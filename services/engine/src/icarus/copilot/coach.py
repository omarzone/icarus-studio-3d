import json
import secrets
import threading
from datetime import UTC, datetime
from typing import Any

from icarus.contracts.coach import CoachFinding, Diagnosis, DiagnosisEvidence, FilmStrip
from icarus.contracts.copilot import AttachmentInfo, Capability, ChatAction, CopilotMessage, CopilotProposal
from icarus.contracts.events import DiagnosisCreatedEvent
from icarus.copilot.agent.answer import FinalAnswer
from icarus.copilot.agent.ending import polished
from icarus.copilot.agent.loop import merged_steps, run_loop
from icarus.copilot.agent.prompt import system_prompt
from icarus.copilot.agent.tools.base import TurnScope
from icarus.copilot.agent.tools.run_review import COACH_TOOLS, CoachScope, DiagnosisArgs
from icarus.copilot.behavior_judgment import behavior_guide
from icarus.copilot.candidate import new_proposal
from icarus.copilot.chat import Copilot, CopilotBusy
from icarus.copilot.client import CopilotError, ModelClient, ToolsRefused, capability_client, copilot_client
from icarus.copilot.coach_words import coach_said
from icarus.copilot.context import lean_context, run_facts
from icarus.copilot.language import Language, say
from icarus.copilot.run_frames import RunFrames
from icarus.tasks import Publisher
from icarus.training.failure_groups import failure_groups
from icarus.training.progress_watch import WatchFinding, checkpoint_results, run_patience, watch
from icarus.training.run_health import run_health
from icarus.training.run_store import RunFolder

DEFAULT_GOAL = 0.8
MAX_OBSERVATIONS = 12
SHEETS_SHOWN = 2

COACH_GUIDE = """

You are now the coach of this project's training. Diagnose {run} at checkpoint {step:,} from its own data: the run
brief below (evaluations, watch rules, how episodes ended, health facts from the worker log, the episode
records and the reward balance, and coach_notes from an earlier look when present), read_run, film_strip and
look_episode for the recorded episodes, and compare_strips to see how the movement changed since an earlier
checkpoint. Base every claim on those numbers and pictures; cite no number that is not in them.
{behavior}
Then decide the next step:
- keep_training: the brain is still improving, the body moves the way the task needs and the run has budget left.
  Before patience_step a brain that learns slowly is still learning: keep training unless a watch rule fired or
  you see a design problem (a goal inside an obstacle, a reward paid for the wrong thing, a body that cannot move).
- stop_and_fix: a watch rule fired, the coach notes name a design problem, or the numbers and pictures show the
  design keeps the brain from learning, or from learning a real gait. Do not wait for more steps with a bad setup.
  Fix whatever part causes it, with any edit operation that passes a try:
  reward: a term that dominates, one the brain exploits, a missing penalty, weights;
  sensors: a sense the brain lacks (add one), one aimed wrong or with too short a range;
  body: joint ranges, motor strength or gear, masses, part sizes, foot friction;
  world: obstacles in the way, the surface, a goal too far (make the task easier first, widen it once success rises);
  brain: practice settings such as steps, copies or per-copy variation.
  A change to what the body senses or to its motors cannot continue from this brain: the next run trains from
  zero and every step this brain trained is lost. Prefer reward or world fixes that keep the sizes, so the next
  run continues from the best brain; change the body or sensors only when they are the cause, and then say in the
  proposal that it restarts from zero and costs the steps already trained.
- done: success reached the goal and holds it, with a gait that does the task.
Call the diagnosis tool as soon as you have read the run and watched the episodes, before you try a fix; call it
again to update it once your fix is proposed, with each finding's try_id. Then answer with a short summary for the
person.{autopilot}
Run brief (JSON, from the run's files): {brief}"""
AUTOPILOT_LINE = (
    " The autopilot runs this training: it applies your proposal itself and trains again, continuing from this "
    "brain when it can. Never ask the person to press Apply."
)


class NothingToDiagnose(Exception):
    """The run has no evaluated checkpoint, or not the one asked for."""


def _evidence(args: DiagnosisArgs, published: dict[str, AttachmentInfo]) -> list[DiagnosisEvidence]:
    return [
        DiagnosisEvidence(
            kind=item.kind,
            label=item.label,
            detail=item.detail,
            attachment_id=published[item.frame].id if item.frame and item.frame in published else None,
        )
        for item in args.evidence
    ]


def _watched(strips: list[FilmStrip], step: int) -> FilmStrip | None:
    """The last strip the coach watched of the diagnosed step, else the last it watched at all."""
    return next((strip for strip in reversed(strips) if strip.step == step), strips[-1] if strips else None)


def _findings(
    scope: TurnScope, args: DiagnosisArgs, proposal: CopilotProposal | None
) -> tuple[list[CoachFinding], list[CopilotProposal]]:
    """Each finding with the proposal that fixes it: the main one, or one more made from its own passed try."""
    extra: dict[str, CopilotProposal] = {}
    findings: list[CoachFinding] = []
    has_runs = bool(scope.services.runs.list_runs(scope.project_id))
    for item in args.findings:
        tried = scope.tries.get(item.try_id) if item.try_id else None
        proposal_id = None
        if tried is not None and tried.passed and tried.base_revision == scope.state.revision.number:
            if proposal is not None and item.try_id == scope.proposal_try:
                proposal_id = proposal.id
            else:
                if tried.id not in extra:
                    extra[tried.id] = new_proposal(
                        scope.state.project,
                        tried.base_revision,
                        item.change[:200],
                        f"{item.behavior} {item.change}",
                        tried.operations,
                        list(tried.warnings),
                        has_runs,
                    )
                proposal_id = extra[tried.id].id
        findings.append(
            CoachFinding(area=item.area, behavior=item.behavior, change=item.change, proposal_id=proposal_id)
        )
    return findings, list(extra.values())


class Coach:
    """Diagnoses a run at a checkpoint with an agent turn over its data and pictures, and posts what it found."""

    def __init__(self, copilot: Copilot, frames: RunFrames) -> None:
        self._copilot = copilot
        self._frames = frames
        services = copilot.services
        self._projects, self._runs = services.projects, services.runs
        self._busy: set[str] = set()
        self._guard = threading.Lock()
        self._publish: Publisher | None = None

    def attach_publisher(self, publish: Publisher) -> None:
        self._publish = publish

    def diagnoses(self, run_id: str) -> list[Diagnosis]:
        return self._runs.folder(run_id).diagnoses()

    def _step(self, folder: RunFolder, step: int | None) -> int:
        steps = [point.step for point in folder.metrics() if point.kind == "eval"]
        if not steps:
            raise NothingToDiagnose(f"{folder.stored_status().name} has no evaluated checkpoint yet.")
        if step is None:
            return steps[-1]
        if step not in steps:
            raise NothingToDiagnose(f"{folder.stored_status().name} has no checkpoint at step {step:,}.")
        return step

    def diagnose(
        self,
        run_id: str,
        step: int | None = None,
        goal_success: float = DEFAULT_GOAL,
        autopilot: bool = False,
        notes: list[str] | None = None,
    ) -> Diagnosis:
        folder = self._runs.folder(run_id)
        checkpoint = self._step(folder, step)
        with self._guard:
            if run_id in self._busy:
                raise CopilotBusy("The coach is already diagnosing this run.")
            self._busy.add(run_id)
        try:
            return self._diagnose(folder, checkpoint, goal_success, autopilot, notes or [])
        finally:
            with self._guard:
                self._busy.discard(run_id)

    def _brief(
        self, folder: RunFolder, step: int, goal: float, notes: list[str]
    ) -> tuple[dict[str, Any], list[WatchFinding]]:
        status = folder.status()
        state = self._projects.state(status.project_id)
        results = checkpoint_results(folder)
        patience = run_patience(self._runs, folder)
        found = watch([result for result in results if result.step <= step], goal, patience)
        episodes = folder.episodes(step)
        groups = failure_groups(episodes) if episodes else []
        brief = run_facts(state, self._runs, status) | {
            "diagnosed_step": step,
            "goal_success": goal,
            # Before this step of the run, slow progress alone is no reason to change the design.
            "patience_step": patience,
            "checkpoints": [
                {"step": r.step, "success": r.success, "episode_return": round(r.episode_return, 3)} for r in results
            ],
            "watch_rules": [finding.reason for finding in found],
            "episode_endings": [{"ending": g.label, "share": g.share, "description": g.description} for g in groups],
            # What the worker log, the episode records and the reward balance say, with their numbers.
            "health": [fact.text for fact in run_health(folder, step)],
        }
        if notes:
            brief["coach_notes"] = notes
        return brief, found

    def _client(self) -> tuple[ModelClient, Capability]:
        settings = self._copilot.settings
        vision = capability_client(settings, "vision")
        return (vision, "vision") if vision else (copilot_client(settings), "reasoning")

    def _diagnose(self, folder: RunFolder, step: int, goal: float, autopilot: bool, notes: list[str]) -> Diagnosis:
        status = folder.status()
        project_id = status.project_id
        language = self._copilot.language(project_id)
        brief, found = self._brief(folder, step, goal, notes)
        brief_text = json.dumps(brief, ensure_ascii=False, separators=(",", ":"))
        state = self._projects.state(project_id)
        request = f"Diagnose {status.name} at checkpoint {step:,}."
        scope = CoachScope(
            project_id,
            state,
            "ask",
            self._copilot.services,
            request=request,
            language=language,
            tools=COACH_TOOLS,
            folder=folder,
            run_name=status.name,
            step=step,
        )
        context = lean_context(state, self._runs, None, "SCR-TRAIN", None)
        scope.sources += [context, brief_text, request]
        scope.percent_sources += [brief_text]
        guide = COACH_GUIDE.format(
            run=status.name,
            step=step,
            brief=brief_text,
            behavior=behavior_guide(),
            autopilot=AUTOPILOT_LINE if autopilot else "",
        )
        system = system_prompt("ask", context, None) + guide
        messages = [{"role": "system", "content": system}, {"role": "user", "content": request}]
        final, failure = self._run(scope, messages)
        args = scope.findings or self._fallback(found, brief, failure or "no diagnosis was written", language)
        frames = [item.frame for item in args.evidence if item.frame]
        published = self._frames.publish(folder, step, frames)
        proposal = scope.proposal
        findings, extra = _findings(scope, args, proposal)
        number = len(folder.diagnoses()) + 1
        diagnosis = Diagnosis(
            id=f"{folder.run_id}-{number}",
            project_id=project_id,
            run_id=folder.run_id,
            step=step,
            created_at=datetime.now(UTC),
            summary=args.summary[:400],
            observations=args.observations[:MAX_OBSERVATIONS],
            evidence=_evidence(args, published),
            failure_groups=self._frames.failure_groups(folder, step),
            hypothesis=args.hypothesis[:600],
            next_step=args.next_step,
            proposal_id=proposal.id if proposal else None,
            findings=findings,
        )
        folder.add_diagnosis(diagnosis)
        text = polished(scope, final.answer) if final else f"{diagnosis.summary} {diagnosis.hypothesis}"
        message = CopilotMessage(
            id=secrets.token_hex(6),
            role="copilot",
            text=text,
            created_at=datetime.now(UTC),
            proposal_id=diagnosis.proposal_id,
            attachments=self._sheets(folder, step),
            actions=self._actions(language, proposal is not None, autopilot),
            steps=merged_steps(scope.steps),
            film_strip=_watched(scope.strips, step),
            findings=findings,
        )
        self._copilot.post(project_id, message, ([proposal] if proposal else []) + extra)
        if self._publish is not None:
            event = DiagnosisCreatedEvent(type="diagnosis_created", diagnosis_id=diagnosis.id, run_id=diagnosis.run_id)
            self._publish(event, project_id)
        return diagnosis

    def _run(self, scope: CoachScope, messages: list[dict]) -> tuple[FinalAnswer | None, str | None]:
        client, capability = self._client()
        settings, limits = self._copilot.settings, self._copilot.limits
        if settings.refuses_tools(capability):
            return None, "the model connection does not use tools"
        window = settings.context_tokens(capability) or limits.context_tokens
        try:
            outcome = run_loop(client, scope, messages, limits, window)
        except ToolsRefused:
            return None, "the model connection does not use tools"
        except CopilotError as error:
            if scope.findings is None:
                raise
            return None, str(error)
        return outcome.final, outcome.failure

    def _fallback(
        self, found: list[WatchFinding], brief: dict[str, Any], failure: str, language: Language
    ) -> DiagnosisArgs:
        """What the engine itself can say from the run's data when the model wrote no diagnosis."""
        reasons = [finding.reason for finding in found]
        endings = [f"{item['ending']}: {item['description']}" for item in brief["episode_endings"]]
        facts = " ".join(reasons) or coach_said("no_findings", language)
        rules = {finding.rule for finding in found}
        next_step = "done" if "goal_held" in rules else "stop_and_fix" if rules else "keep_training"
        return DiagnosisArgs(
            summary=coach_said("fallback", language, reason=failure, facts=facts)[:400],
            observations=[*reasons, *endings][:MAX_OBSERVATIONS],
            evidence=[],
            hypothesis=say("unsupported", language)[:600],
            next_step=next_step,
        )

    def _sheets(self, folder: RunFolder, step: int) -> list[AttachmentInfo]:
        episodes = folder.episodes(step)
        names = [record.sheet for record in (episodes.episodes if episodes else []) if record.sheet]
        published = self._frames.publish(folder, step, names[:SHEETS_SHOWN])
        return list(published.values())

    def _actions(self, language: Language, proposed: bool, autopilot: bool) -> list[ChatAction]:
        actions = []
        if proposed:
            actions += [
                ChatAction(label=say("apply", language), kind="apply"),
                ChatAction(label=say("discard", language), kind="discard"),
            ]
        actions.append(ChatAction(label=coach_said("watch_training", language), kind="navigate", target="SCR-TRAIN"))
        if autopilot:
            message = coach_said("stop_autopilot_message", language)
            actions.append(ChatAction(label=coach_said("stop_autopilot", language), kind="send", target=message))
        else:
            message = coach_said("train_again_message", language)
            actions.append(ChatAction(label=coach_said("train_again", language), kind="send", target=message))
        return actions
