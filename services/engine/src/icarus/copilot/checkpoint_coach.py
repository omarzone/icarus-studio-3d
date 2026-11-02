"""The coach watching every coached run: facts at each checkpoint, a budgeted look with the vision model early,
when a new problem shows, when progress stalls and when the gait gets worse, and a diagnosis with a tested fix as
soon as a problem shows."""

import logging
import queue
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal

from icarus.contracts.copilot import AgentStep, ChatAction, CheckItem, RunCard
from icarus.copilot.agent.turn import new_message
from icarus.copilot.behavior_judgment import GAIT_WORSE, coach_findings
from icarus.copilot.chat import Copilot
from icarus.copilot.client import CopilotError
from icarus.copilot.coach import DEFAULT_GOAL
from icarus.copilot.coach_words import coach_said, percent
from icarus.copilot.early_look import EarlyLook, LookResult, look_facts
from icarus.copilot.language import Language
from icarus.copilot.run_frames import RunFrames
from icarus.training.progress_watch import WatchFinding, checkpoint_results, trend, watch
from icarus.training.run_health import HealthFact, run_health
from icarus.training.run_store import RunFolder, RunStore

# A diagnosis of a run at a step, with what the coach already found as notes for it.
DiagnosisStarter = Callable[[str, int, list[str]], None]
MAX_CHECKS = 12

log = logging.getLogger(__name__)


# A gait signal got worse when it moved this share of its last looked-at value the wrong way (at least GAIT_STEP).
GAIT_WORSE_SHARE = 0.15
GAIT_STEP = 0.02


@dataclass(frozen=True)
class LookBudget:
    """How many model looks a run gets: always the first checkpoints, then only when the facts suggest trouble."""

    early_checkpoints: int = 2
    per_run: int = 6
    # More looks once a problem was found, to follow the fix.
    after_problem: int = 4
    # Also look when the learning curve turns flat and when a gait signal gets worse.
    on_stall: bool = True
    on_gait: bool = True


def gait_values(facts: list[HealthFact]) -> dict[str, float]:
    """The worst value of each gait signal among the facts; empty when the worker measured no gait."""
    values: dict[str, float] = {}
    for fact in facts:
        direction = GAIT_WORSE.get(fact.kind)
        value = getattr(fact, "value", None)
        if direction is None or not isinstance(value, int | float):
            continue
        known = values.get(fact.kind)
        values[fact.kind] = float(value) if known is None else (max if direction > 0 else min)(known, float(value))
    return values


def gait_worse(before: dict[str, float], now: dict[str, float]) -> list[str]:
    """The gait signals that moved the wrong way since the last look, by name."""
    worse = []
    for kind, value in now.items():
        old = before.get(kind)
        if old is not None and (value - old) * GAIT_WORSE[kind] > max(GAIT_STEP, GAIT_WORSE_SHARE * abs(old)):
            worse.append(kind)
    return worse


@dataclass
class _Watched:
    steps: set[int] = field(default_factory=set)
    rules: set[str] = field(default_factory=set)
    problems: set[str] = field(default_factory=set)
    looks: int = 0
    found_problem: bool = False
    blocker: WatchFinding | None = None
    flat: bool = False
    # The gait signals at the last look.
    gait: dict[str, float] = field(default_factory=dict)


class CheckpointCoach:
    """Comments on each checkpoint of a coached run from its own data, and looks with the model within a budget."""

    def __init__(
        self,
        copilot: Copilot,
        runs: RunStore,
        diagnose: DiagnosisStarter,
        look: EarlyLook | None = None,
        frames: RunFrames | None = None,
        budget: LookBudget | None = None,
        piloted: Callable[[str], bool] | None = None,
        background: bool = False,
    ) -> None:
        self._copilot = copilot
        self._runs = runs
        self._diagnose = diagnose
        self._look = look
        self._frames = frames
        self._budget = budget or LookBudget()
        self._piloted = piloted or (lambda _project: False)
        self._watched: dict[str, _Watched] = {}
        self._lock = threading.Lock()
        self._queue: queue.Queue[tuple[str, int]] | None = queue.Queue() if background else None
        if self._queue is not None:
            threading.Thread(target=self._work, name="checkpoint-coach", daemon=True).start()

    def comment(self, run_id: str, step: int) -> None:
        """Called once per checkpoint; a step already handled is ignored. Model calls never block the caller when the
        coach runs in the background."""
        with self._lock:
            watched = self._watched.setdefault(run_id, _Watched())
            if step in watched.steps:
                return
            watched.steps.add(step)
        if self._queue is not None:
            self._queue.put((run_id, step))
        else:
            self._handle(run_id, step)

    def blocker(self, run_id: str) -> WatchFinding | None:
        """A design problem the coach found in this run that an autopilot should stop it for."""
        with self._lock:
            watched = self._watched.get(run_id)
            return watched.blocker if watched else None

    def looks(self, run_id: str) -> int:
        with self._lock:
            watched = self._watched.get(run_id)
            return watched.looks if watched else 0

    def wait(self) -> None:
        if self._queue is not None:
            self._queue.join()

    def _work(self) -> None:
        assert self._queue is not None
        while True:
            run_id, step = self._queue.get()
            try:
                self._handle(run_id, step)
            except Exception:  # A broken run or model answer must not stop the coach for the next checkpoint.
                log.exception("checkpoint coach failed")
            finally:
                self._queue.task_done()

    def _handle(self, run_id: str, step: int) -> None:
        folder = self._runs.folder(run_id)
        status = folder.status()
        results = [result for result in checkpoint_results(folder) if result.step <= step]
        index = next((i for i, result in enumerate(results) if result.step == step), None)
        if index is None:
            return
        project_id = status.project_id
        language = self._copilot.language(project_id)
        watched = self._watched[run_id]
        findings = [f for f in watch(results, DEFAULT_GOAL) if f.rule not in watched.rules]
        watched.rules |= {finding.rule for finding in findings}
        facts = run_health(folder, step)
        fresh = [fact for fact in facts if fact.problem and fact.kind not in watched.problems]
        watched.problems |= {fact.kind for fact in fresh}
        curve = trend(results)
        curve_text = None
        if curve.call != "early":
            curve_text = curve.reason if language == "en" else coach_said(f"trend_{curve.call}", language)
        notes = [fact.text for fact in facts]
        piloted = self._piloted(project_id)
        if findings:
            # A watch rule fired: the diagnosis looks at the episodes itself, so no separate look is spent.
            self._post_trend(folder, step, language, facts, curve_text, findings)
            if not piloted:
                self._diagnose(run_id, step, notes)
            return
        early = index < self._budget.early_checkpoints
        budget = self._budget
        stalled = budget.on_stall and curve.call == "flat" and not watched.flat
        watched.flat = curve.call == "flat"
        gait = gait_values(facts)
        worse = gait_worse(watched.gait, gait) if budget.on_gait else []
        allowed = budget.per_run + (budget.after_problem if watched.found_problem else 0)
        if self._look is None or not (early or fresh or stalled or worse) or watched.looks >= allowed:
            self._post_trend(folder, step, language, facts, curve_text, [])
            return
        watched.looks += 1
        watched.gait = gait
        given = look_facts(folder, step, facts, results, curve)
        reasons = (["progress stalled"] if stalled else []) + [f"{kind} got worse" for kind in worse]
        if reasons:
            given["why_this_look"] = reasons
        try:
            result = self._look.look(folder, step, given, language)
        except CopilotError as error:
            log.warning("the coach could not look at %s step %s: %s", run_id, step, error)
            self._post_trend(folder, step, language, facts, curve_text, [])
            return
        self._post_look(folder, step, language, facts, result, early)
        if not result.check.problem:
            return
        # A later look that sees the same problems reports them; only a first or a new problem starts another fix.
        first = not watched.found_problem or bool(fresh) or stalled or bool(worse)
        watched.found_problem = True
        found = self._noted(result)
        if piloted:
            with self._lock:
                watched.blocker = WatchFinding("design_blocker", found)
        elif first:
            self._diagnose(run_id, step, [found, *notes])

    def _noted(self, result: LookResult) -> str:
        check = result.check
        parts = [check.summary, check.blocker, check.why_it_ends, check.reward_note]
        parts += [f"{item.seen} ({item.area}: {item.change})" for item in check.gait if item.change]
        return "The coach's early look found a design problem: " + " ".join(part for part in parts if part)

    def _text(self, folder: RunFolder, step: int, language: Language) -> str:
        status = folder.status()
        current = next(result for result in checkpoint_results(folder) if result.step == step)
        success = percent(current.success, language) if current.success is not None else None
        if language == "es":
            text = f"{status.name}, paso {step:,}: retorno {current.episode_return:.2f}"
            return text + (f", éxito {success}." if success else ".")
        text = f"{status.name} at step {step:,}: return {current.episode_return:.2f}"
        return text + (f", success {success}." if success else ".")

    def _checks(self, facts: list[HealthFact], language: Language) -> list[CheckItem]:
        # The engine's facts are written in English; in another language the model's look says them instead.
        if language != "en":
            return []
        return [CheckItem(text=fact.text[:200], tone="warn") for fact in facts if fact.problem][:MAX_CHECKS]

    def _actions(self, language: Language) -> list[ChatAction]:
        label = coach_said("watch_training", language)
        return [ChatAction(label=label, kind="navigate", target="SCR-TRAIN")]

    def _post_trend(
        self,
        folder: RunFolder,
        step: int,
        language: Language,
        facts: list[HealthFact],
        curve: str | None,
        findings: list[WatchFinding],
    ) -> None:
        text = self._text(folder, step, language)
        if curve:
            text = f"{text} {curve}"
        if findings:
            text = f"{text} {' '.join(finding.reason for finding in findings)}"
        message = new_message(
            "copilot",
            text,
            title=f"Checkpoint {step:,}",
            run=RunCard(run_id=folder.run_id, milestone_step=step),
            checks=self._checks(facts, language),
            actions=self._actions(language),
        )
        self._copilot.post(folder.stored_status().project_id, message, [])

    def _post_look(
        self, folder: RunFolder, step: int, language: Language, facts: list[HealthFact], result: LookResult, early: bool
    ) -> None:
        check = result.check
        attachments = list(self._frames.publish(folder, step, result.looked_at).values()) if self._frames else []
        tone: dict[bool, Literal["ok", "warn"]] = {True: "ok", False: "warn"}
        checks = [
            CheckItem(text=coach_said("moves" if check.moves else "still", language)[:200], tone=tone[check.moves]),
            CheckItem(
                text=(check.why_it_ends or coach_said("ends_early", language))[:200]
                if check.ends_early
                else coach_said("runs_full", language),
                tone=tone[not check.ends_early],
            ),
            CheckItem(
                text=(check.reward_note or coach_said("reward_ok", language))[:200], tone=tone[check.reward_makes_sense]
            ),
        ]
        if check.blocker:
            checks.append(CheckItem(text=check.blocker[:200], tone="warn"))
        checks += self._checks(facts, language)
        pictures = len(result.looked_at) + (1 if result.strip else 0)
        looked = coach_said("looked" if pictures else "read_facts", language, count=pictures, step=f"{step:,}")
        summary = check.summary or coach_said("no_summary", language)
        text = f"{self._text(folder, step, language)} {summary}"
        if check.problem:
            text = f"{text} {coach_said('fixing', language)}"
        title = coach_said("early_title" if early else "look_title", language, step=f"{step:,}")
        message = new_message(
            "copilot",
            text,
            title=title[:120],
            run=RunCard(run_id=folder.run_id, milestone_step=step),
            attachments=attachments,
            checks=checks[:MAX_CHECKS],
            steps=[AgentStep(tool="look", summary=looked[:200])],
            actions=self._actions(language),
            film_strip=result.strip.strip if result.strip else None,
            findings=coach_findings(check.gait),
        )
        self._copilot.post(folder.stored_status().project_id, message, [])
