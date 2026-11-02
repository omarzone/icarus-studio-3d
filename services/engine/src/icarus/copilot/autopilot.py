import logging
import secrets
import threading
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal, Protocol

from icarus.contracts.coach import AutopilotLogLine, AutopilotStart, AutopilotStatus
from icarus.contracts.copilot import ChatAction, CopilotMessage, CopilotProposal
from icarus.contracts.project import ProjectState
from icarus.contracts.specs import MIN_TRAINING_STEPS
from icarus.contracts.training import MAX_COPIES, RunStatus, StartRun, WarmStart
from icarus.copilot.chat import Copilot, CopilotBusy, ProposalOutdated
from icarus.copilot.client import CopilotError
from icarus.copilot.coach import Coach, NothingToDiagnose
from icarus.copilot.coach_words import RULE_WORDS, coach_said, percent
from icarus.copilot.fix_trials import TRIAL_STEPS, trial_table, trial_winner
from icarus.copilot.language import Language
from icarus.projects.files import write_atomic
from icarus.projects.operations import OperationError, apply_operations
from icarus.projects.store import ProjectStore
from icarus.training.progress_watch import CheckpointResult, WatchFinding, checkpoint_results, watch
from icarus.training.run_comparison import compare_runs
from icarus.training.run_store import TERMINAL_STATES, RunStore
from icarus.training.schedule import planned_steps
from icarus.training.settings import TrainingSettingsStore
from icarus.training.supervisor import NotTrainable, RunInProgress, WarmStartRefused
from icarus.training.warm_start import warm_start_problem

log = logging.getLogger(__name__)

POLL_SECONDS = 2.0
# A stopped worker finishes its rollout and evaluates a last checkpoint before it ends.
STOP_WAIT_SECONDS = 180.0
STOP_JOIN_SECONDS = 5.0
LOG_LINES = 200
# Each autopilot run trains half the recommended budget: it can stop early, continue warm or be fixed in between.
ITERATION_SHARE = 2

type RunEnding = Literal["held", "flagged", "ended", "stopped", "out_of_time", "failed"]


class AutopilotBusy(RuntimeError):
    """A project already has an autopilot running."""


class NoAutopilot(LookupError):
    pass


class RunStarter(Protocol):
    """What the autopilot needs from the supervisor: it starts and stops runs, it never trains in this process."""

    def start(self, state: ProjectState, start: StartRun, threads: int, use_graphics_card: bool) -> RunStatus: ...

    def stop(self, run_id: str) -> RunStatus: ...


class BlockerSource(Protocol):
    """The coach watching runs: a design problem it found in one, which the loop stops the run for."""

    def blocker(self, run_id: str) -> WatchFinding | None: ...


@dataclass
class _Best:
    run_id: str
    name: str
    step: int
    success: float
    episode_return: float
    revision: int


@dataclass
class _Pilot:
    status: AutopilotStatus
    language: Language
    stop: threading.Event = field(default_factory=threading.Event)
    thread: threading.Thread | None = None
    deadline: float = 0.0
    best: _Best | None = None
    held: str | None = None


def best_of(results: list[CheckpointResult]) -> CheckpointResult | None:
    return max(results, key=lambda result: (result.success or 0.0, result.episode_return), default=None)


class Autopilot:
    """Train, watch, diagnose, fix and train again until the goal holds or the budget runs out, one loop per project.

    It lives in the API process and only drives the supervisor. Nothing of a loop survives an engine restart: a
    status left running is read back as stopped.
    """

    def __init__(
        self,
        projects: ProjectStore,
        runs: RunStore,
        starter: RunStarter,
        settings: TrainingSettingsStore,
        copilot: Copilot,
        coach: Coach,
        folder: Path,
        poll_seconds: float = POLL_SECONDS,
        trial_steps: int | None = TRIAL_STEPS,
    ) -> None:
        self._projects, self._runs, self._starter, self._settings = projects, runs, starter, settings
        self._copilot, self._coach = copilot, coach
        self._folder = folder
        self._poll = poll_seconds
        self._pilots: dict[str, _Pilot] = {}
        self._lock = threading.Lock()
        self._watcher: BlockerSource | None = None
        # Steps of each short A/B trial when a run stalls in fix mode; None tries no alternatives.
        self._trial_steps = trial_steps

    def attach_watcher(self, watcher: BlockerSource) -> None:
        self._watcher = watcher

    def drives(self, project_id: str) -> bool:
        """Whether a loop runs this project's training now, so the coach leaves the decisions to it."""
        with self._lock:
            pilot = self._pilots.get(project_id)
            return pilot is not None and pilot.status.state in ("running", "waiting_approval")

    def _path(self, project_id: str) -> Path:
        return self._folder / f"{project_id}.autopilot.json"

    def status(self, project_id: str) -> AutopilotStatus:
        self._projects.state(project_id)
        with self._lock:
            pilot = self._pilots.get(project_id)
            if pilot is not None:
                return pilot.status.model_copy(deep=True)
        path = self._path(project_id)
        if not path.is_file():
            raise NoAutopilot(project_id)
        stored = AutopilotStatus.model_validate_json(path.read_text(encoding="utf-8"))
        if stored.state in ("running", "waiting_approval"):
            line = AutopilotLogLine(time=datetime.now(UTC), text="The engine closed while the autopilot ran.")
            stored = stored.model_copy(update={"state": "stopped", "log": [*stored.log, line][-LOG_LINES:]})
        return stored

    def start(self, project_id: str, request: AutopilotStart) -> AutopilotStatus:
        state = self._projects.state(project_id)
        if state.project.task.family == "none":
            raise NotTrainable("it has no task to train")
        with self._lock:
            current = self._pilots.get(project_id)
            if current is not None and current.status.state in ("running", "waiting_approval"):
                raise AutopilotBusy("The autopilot is already running for this project.")
            training = [run for run in self._runs.list_runs(project_id) if run.state not in TERMINAL_STATES]
            if training:
                raise RunInProgress(training[0].run_id)
            status = AutopilotStatus(
                project_id=project_id,
                mode=request.mode,
                state="running",
                iteration=0,
                max_iterations=request.max_iterations,
                goal_success=request.goal_success,
                started_at=datetime.now(UTC),
                run_ids=[],
                diagnosis_ids=[],
                log=[],
            )
            pilot = _Pilot(status, self._copilot.language(project_id))
            pilot.deadline = time.monotonic() + request.max_minutes * 60
            self._pilots[project_id] = pilot
            pilot.thread = threading.Thread(target=self._drive, args=(pilot, request), name="autopilot", daemon=True)
        goal = percent(request.goal_success, pilot.language)
        counts = {"iterations": request.max_iterations, "minutes": request.max_minutes}
        self._say(pilot, coach_said("started", pilot.language, goal=goal, **counts))
        pilot.thread.start()
        return self.status(project_id)

    def stop(self, project_id: str) -> AutopilotStatus:
        with self._lock:
            pilot = self._pilots.get(project_id)
        if pilot is None:
            return self.status(project_id)
        pilot.stop.set()
        # The run is asked to stop right away; the loop then ends on its own within a poll.
        for run_id in pilot.status.run_ids[-1:]:
            if self._runs.folder(run_id).status().state not in TERMINAL_STATES:
                self._starter.stop(run_id)
        if pilot.thread is not None:
            pilot.thread.join(STOP_JOIN_SECONDS)
        return self.status(project_id)

    def shutdown(self) -> None:
        with self._lock:
            pilots = list(self._pilots.values())
        for pilot in pilots:
            pilot.stop.set()

    def _note(self, pilot: _Pilot, text: str) -> None:
        with self._lock:
            line = AutopilotLogLine(time=datetime.now(UTC), text=text[:400])
            pilot.status.log = [*pilot.status.log, line][-LOG_LINES:]
            snapshot = pilot.status.model_dump_json(indent=2)
        write_atomic(self._path(pilot.status.project_id), snapshot)

    def _update(self, pilot: _Pilot, **values: object) -> None:
        with self._lock:
            pilot.status = pilot.status.model_copy(update=values)
            snapshot = pilot.status.model_dump_json(indent=2)
        write_atomic(self._path(pilot.status.project_id), snapshot)

    def _say(self, pilot: _Pilot, text: str, final: bool = False) -> None:
        """A step of the loop: a log line and a copilot message in the project's conversation."""
        self._note(pilot, text)
        language = pilot.language
        actions = [ChatAction(label=coach_said("watch_training", language), kind="navigate", target="SCR-TRAIN")]
        if not final and pilot.status.state in ("running", "waiting_approval"):
            stop = coach_said("stop_autopilot_message", language)
            actions.append(ChatAction(label=coach_said("stop_autopilot", language), kind="send", target=stop))
        message = CopilotMessage(
            id=secrets.token_hex(6), role="copilot", text=text, created_at=datetime.now(UTC), actions=actions
        )
        self._copilot.post(pilot.status.project_id, message, [])

    def _drive(self, pilot: _Pilot, request: AutopilotStart) -> None:
        try:
            ending = self._iterate(pilot, request)
        except Exception as error:  # noqa: BLE001 - the loop ends with a readable failed status, never silently
            log.exception("autopilot failed")
            self._finish(pilot, "failed", coach_said("failed", pilot.language, reason=error))
            return
        self._finish(pilot, *ending)

    def _finish(self, pilot: _Pilot, state: Literal["done", "stopped", "failed"], text: str) -> None:
        # The last message is posted before the state changes, so whoever waits for the end also finds it.
        self._say(pilot, text, final=True)
        self._update(pilot, state=state, finished_at=datetime.now(UTC))

    def _out_of_budget(self, pilot: _Pilot) -> bool:
        return pilot.stop.is_set() or time.monotonic() >= pilot.deadline

    def _iterate(self, pilot: _Pilot, request: AutopilotStart) -> tuple[Literal["done", "stopped", "failed"], str]:
        project_id, language = pilot.status.project_id, pilot.language
        lineage: list[CheckpointResult] = []
        previous: RunStatus | None = None
        for iteration in range(1, request.max_iterations + 1):
            if self._out_of_budget(pilot):
                break
            state = self._projects.state(project_id)
            if previous is not None and previous.revision_number != state.revision.number:
                lineage = []
            run = self._start_run(pilot, state, iteration)
            # A warm run's step 0 re-evaluates a brain already counted on this revision, so it does not count twice.
            repeats_first = self._config_warm(run) is not None and bool(lineage)
            ending, results, found = self._watch_run(pilot, run, lineage, repeats_first)
            self._record(pilot, run, results, previous)
            lineage += results[1:] if repeats_first else results
            previous = self._runs.folder(run.run_id).status()
            if ending == "held":
                self._say(pilot, coach_said("held", language, name=run.name))
                return "done", self._done_text(pilot, "done")
            if ending == "failed":
                reason = previous.failure.reason if previous.failure else run.name
                return "failed", coach_said("failed", language, reason=reason)
            if ending in ("stopped", "out_of_time"):
                break
            if found:
                why = ", ".join(RULE_WORDS[finding.rule][language] for finding in found)
                self._say(pilot, coach_said("flagged", language, name=run.name, why=why))
            if iteration < request.max_iterations and not self._coach_step(pilot, run, request, found):
                return "stopped", coach_said("discarded", language)
            if pilot.held is not None:
                self._say(pilot, coach_said("held", language, name=pilot.held))
                return "done", self._done_text(pilot, "done")
        if pilot.stop.is_set():
            return "stopped", coach_said("stopped", language)
        why = coach_said("budget_minutes" if time.monotonic() >= pilot.deadline else "budget_runs", language)
        return "done", self._done_text(pilot, "budget", why=why)

    def _done_text(self, pilot: _Pilot, key: str, **values: object) -> str:
        best = pilot.best
        name = best.name if best else coach_said("nothing_best", pilot.language)
        share = percent(best.success if best else None, pilot.language)
        return coach_said(key, pilot.language, best=name, success=share, **values)

    def _config_warm(self, run: RunStatus) -> WarmStart | None:
        return self._runs.folder(run.run_id).config().warm_start

    def _warm_start(self, pilot: _Pilot, state: ProjectState) -> WarmStart | None:
        """The best brain so far, when the current design senses and acts the way it did."""
        best = pilot.best
        if best is None:
            return None
        warm = WarmStart(run_id=best.run_id, step=best.step)
        # Step 0 of a run trained from zero is the untrained network, not a brain worth continuing.
        if best.step == 0 and self._runs.folder(best.run_id).config().warm_start is None:
            return None
        return None if warm_start_problem(self._runs, state.project, warm) else warm

    def _start_run(self, pilot: _Pilot, state: ProjectState, iteration: int) -> RunStatus:
        project = state.project
        settings = self._settings.get()
        warm = self._warm_start(pilot, state)
        steps = max(MIN_TRAINING_STEPS, planned_steps(project) // ITERATION_SHARE)
        # Coached: the coach looks at its first checkpoints and flags a design problem before the watch rules would.
        copies = min(project.brain.copies, MAX_COPIES)
        start = StartRun(total_steps=steps, copies=copies, warm_start=warm, coach=True)
        try:
            run = self._starter.start(state, start, settings.threads, settings.use_graphics_card)
        except WarmStartRefused:
            warm = None
            start = start.model_copy(update={"warm_start": None})
            run = self._starter.start(state, start, settings.threads, settings.use_graphics_card)
        self._update(pilot, iteration=iteration, run_ids=[*pilot.status.run_ids, run.run_id])
        language = pilot.language
        if warm is None:
            self._say(pilot, coach_said("run_zero", language, iteration=iteration, name=run.name))
        else:
            source = self._runs.folder(warm.run_id).stored_status().name
            self._say(pilot, coach_said("run_warm", language, iteration=iteration, name=run.name, source=source))
        return run

    def _watch_run(
        self,
        pilot: _Pilot,
        run: RunStatus,
        lineage: list[CheckpointResult],
        repeats_first: bool,
        flags: bool = True,
    ) -> tuple[RunEnding, list[CheckpointResult], list[WatchFinding]]:
        """Follow a run until it holds the goal, ends or runs out of time; with flags, also stop it for a watch rule
        or for a design problem the coach found."""
        folder = self._runs.folder(run.run_id)
        goal, seen = pilot.status.goal_success, -1
        while True:
            status = folder.status()
            results = checkpoint_results(folder)
            if len(results) != seen:
                seen = len(results)
                chained = lineage + (results[1:] if repeats_first else results)
                if any(finding.rule == "goal_held" for finding in watch(chained, goal)):
                    return self._ended(folder.run_id, "held"), checkpoint_results(folder), []
                found = watch(results, goal) if flags else []
                if found and status.state not in TERMINAL_STATES:
                    for finding in found:
                        self._note(pilot, f"{run.name}: {finding.reason}")
                    return self._ended(folder.run_id, "flagged"), checkpoint_results(folder), found
            blocker = self._watcher.blocker(run.run_id) if self._watcher and flags else None
            if blocker is not None and status.state not in TERMINAL_STATES:
                self._note(pilot, f"{run.name}: {blocker.reason}")
                return self._ended(folder.run_id, "flagged"), checkpoint_results(folder), [blocker]
            if status.state in TERMINAL_STATES:
                ending: RunEnding = "failed" if status.state == "failed" else "ended"
                return ending, results, []
            if pilot.stop.is_set():
                return self._ended(folder.run_id, "stopped"), checkpoint_results(folder), []
            if time.monotonic() >= pilot.deadline:
                return self._ended(folder.run_id, "out_of_time"), checkpoint_results(folder), []
            pilot.stop.wait(self._poll)

    def _ended(self, run_id: str, ending: RunEnding) -> RunEnding:
        """Stop a run the loop is done with and wait, boundedly, for its last checkpoint."""
        folder = self._runs.folder(run_id)
        self._starter.stop(run_id)
        waited = time.monotonic() + STOP_WAIT_SECONDS
        while folder.status().state not in TERMINAL_STATES and time.monotonic() < waited:
            time.sleep(min(self._poll, 1.0))
        return ending

    def _record(
        self, pilot: _Pilot, run: RunStatus, results: list[CheckpointResult], previous: RunStatus | None
    ) -> None:
        """Keep the best brain and compare this run with the one before on the same evaluation seeds."""
        top = best_of(results)
        if top is None:
            return
        success = top.success or 0.0
        best = pilot.best
        # Returns of different revisions come from different rewards, so at equal success the newer design wins.
        rank = (success, run.revision_number, top.episode_return)
        if best is None or rank > (best.success, best.revision, best.episode_return):
            pilot.best = _Best(run.run_id, run.name, top.step, success, top.episode_return, run.revision_number)
            self._update(pilot, best_run_id=run.run_id, best_success=success)
        if previous is not None and pilot.best is not None:
            earlier = best_of(checkpoint_results(self._runs.folder(previous.run_id)))
            old = percent(earlier.success if earlier else None, pilot.language)
            new = percent(success, pilot.language)
            names = {"name": run.name, "previous": previous.name, "best": pilot.best.name}
            self._say(pilot, coach_said("compared", pilot.language, new=new, old=old, **names))

    def _coach_step(self, pilot: _Pilot, run: RunStatus, request: AutopilotStart, found: list[WatchFinding]) -> bool:
        """Diagnose the run and act on it; False when the person turned the coach's proposal down."""
        notes = [finding.reason for finding in found]
        try:
            diagnosis = self._coach.diagnose(run.run_id, goal_success=request.goal_success, autopilot=True, notes=notes)
        except (CopilotError, CopilotBusy, NothingToDiagnose) as error:
            # Without a diagnosis the loop keeps training the same design, continuing from the best brain.
            self._note(pilot, f"The coach could not diagnose {run.name}: {error}")
            return True
        self._update(pilot, diagnosis_ids=[*pilot.status.diagnosis_ids, diagnosis.id])
        self._note(pilot, f"Diagnosis of {run.name}: {diagnosis.summary}")
        proposal_id = diagnosis.proposal_id
        if diagnosis.next_step != "stop_and_fix" or proposal_id is None:
            if diagnosis.next_step == "stop_and_fix":
                self._say(pilot, coach_said("no_fix", pilot.language))
            return True
        proposal = next(item for item in self._copilot.conversation(run.project_id).proposals if item.id == proposal_id)
        stalled = any(finding.rule == "stalled" for finding in found)
        if request.mode == "fix" and stalled and self._trial(pilot, proposal_id, proposal.summary):
            return True
        if request.mode == "fix":
            try:
                conversation = self._copilot.apply(proposal_id)
            except ProposalOutdated:
                self._say(pilot, coach_said("no_fix", pilot.language))
                return True
            applied = next(item for item in conversation.proposals if item.id == proposal_id)
            revision = applied.applied_revision
            self._say(pilot, coach_said("applied", pilot.language, summary=proposal.summary, revision=revision))
            return True
        self._update(pilot, state="waiting_approval")
        self._say(pilot, coach_said("waiting", pilot.language, summary=proposal.summary))
        while not self._out_of_budget(pilot):
            current = next(
                item for item in self._copilot.conversation(run.project_id).proposals if item.id == proposal_id
            )
            if current.status != "open":
                self._update(pilot, state="running")
                return current.status == "applied"
            pilot.stop.wait(self._poll)
        self._update(pilot, state="running")
        return True

    def _trial_run(self, pilot: _Pilot, warm: WarmStart | None, seed: int, what: str, letter: str) -> RunStatus:
        """One short trial from the given brain, or from zero, on the current revision, followed to its end."""
        state = self._projects.state(pilot.status.project_id)
        settings = self._settings.get()
        assert self._trial_steps is not None
        copies = min(state.project.brain.copies, MAX_COPIES)
        start = StartRun(total_steps=self._trial_steps, copies=copies, seed=seed, warm_start=warm, coach=True)
        run = self._starter.start(state, start, settings.threads, settings.use_graphics_card)
        self._update(pilot, run_ids=[*pilot.status.run_ids, run.run_id])
        steps = f"{self._trial_steps:,}"
        key = "trial_start" if warm is not None else "trial_cold_start"
        said = coach_said(key, pilot.language, letter=letter, name=run.name, steps=steps, what=what)
        self._say(pilot, said)
        ending, results, _ = self._watch_run(pilot, run, [], True, flags=False)
        self._record(pilot, run, results, None)
        if ending == "held":
            pilot.held = run.name
        return self._runs.folder(run.run_id).status()

    def _cold_reason(self, state: ProjectState, proposal: CopilotProposal, warm: WarmStart) -> str | None:
        """Why the fixed design cannot continue from the brain, when its senses or motors change."""
        try:
            candidate = apply_operations(state.project, proposal.operations)
        except OperationError:
            return None
        return warm_start_problem(self._runs, candidate, warm)

    def _trial(self, pilot: _Pilot, proposal_id: str, summary: str) -> bool:
        """Try more steps and the fix as two short runs on one seed and keep the better design: both continue from
        the best brain, or both train from zero when the fix changes what the body senses or drives.

        False when no trial fits (no trained brain to continue from); the loop then applies the fix as usual.
        """
        project_id, language = pilot.status.project_id, pilot.language
        state = self._projects.state(project_id)
        best = self._warm_start(pilot, state) if self._trial_steps else None
        if best is None or self._out_of_budget(pilot):
            return False
        proposal = next(item for item in self._copilot.conversation(project_id).proposals if item.id == proposal_id)
        cold = self._cold_reason(state, proposal, best)
        warm = None if cold else best
        if cold:
            self._say(pilot, coach_said("trial_cold", language, why=cold))
        seed = self._runs.folder(best.run_id).config().seed
        base = state.revision.number
        same_key = "trial_same_cold" if cold else "trial_same"
        same = self._trial_run(pilot, warm, seed, coach_said(same_key, language), "A")
        if pilot.held or self._out_of_budget(pilot):
            return True
        try:
            conversation = self._copilot.apply(proposal_id)
        except ProposalOutdated:
            self._say(pilot, coach_said("no_fix", language))
            return True
        applied = next(item for item in conversation.proposals if item.id == proposal_id)
        self._say(pilot, coach_said("applied", language, summary=summary, revision=applied.applied_revision))
        fixed = self._trial_run(pilot, warm, seed, coach_said("trial_fix", language, summary=summary), "B")
        if pilot.held:
            return True
        comparison = compare_runs(self._runs, same.run_id, fixed.run_id)
        names = (coach_said(same_key, language), coach_said("trial_fix_name", language))
        if not cold:
            names = (coach_said("trial_same_name", language), names[1])
        winner = trial_winner(comparison)
        kept = names[0] if winner == "a" else names[1]
        self._say(pilot, coach_said("trial_result", language, table=trial_table(comparison, names), winner=kept))
        if winner == "a":
            self._projects.restore(project_id, base)
            self._say(pilot, coach_said("trial_restored_cold" if cold else "trial_restored", language, revision=base))
        return True
