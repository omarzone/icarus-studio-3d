import logging
import threading
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

from pydantic import Field

from icarus.contracts.coach import AutopilotStart
from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TurnScope
from icarus.copilot.agent.tools.inspect import compact
from icarus.copilot.step_words import step_said
from icarus.training.supervisor import NotTrainable, RunInProgress

if TYPE_CHECKING:
    from icarus.copilot.autopilot import Autopilot
    from icarus.copilot.coach import Coach

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Coaching:
    coach: "Coach"
    autopilot: "Autopilot"


class CoachArgs(ToolArgs):
    action: Literal["diagnose", "start_autopilot", "stop_autopilot", "autopilot_status"]
    mode: Literal["ask", "fix"] = Field(
        default="ask", description="Autopilot: ask stops at each fix for the person; fix applies fixes itself."
    )
    goal_success: float | None = Field(
        default=None, gt=0, le=1, description="Share of episodes that counts as learned."
    )
    max_iterations: int | None = Field(
        default=None, ge=1, le=12, description="Most training runs the autopilot starts."
    )
    max_minutes: int | None = Field(default=None, ge=5, le=600, description="Most minutes the autopilot works.")


def _diagnose_later(coaching: Coaching, run_id: str) -> None:
    try:
        coaching.coach.diagnose(run_id)
    except Exception:  # noqa: BLE001 - a background diagnosis that fails only leaves a log line
        log.exception("background diagnosis failed")


def _diagnose(scope: TurnScope, coaching: Coaching) -> Observation:
    runs = scope.services.runs
    evaluated = [status for status in runs.list_runs(scope.project_id) if runs.folder(status.run_id).checkpoints()]
    if not evaluated:
        reason = "no run of this project has an evaluated checkpoint yet"
        return Observation(reason, ok=False, summary=step_said("coach_refused", scope.language, reason=reason))
    run = evaluated[0]
    threading.Thread(target=_diagnose_later, args=(coaching, run.run_id), name="diagnosis", daemon=True).start()
    text = f"The coach is diagnosing {run.name}; its diagnosis will appear in this conversation in a moment."
    scope.reports.append(text)
    return Observation(text, summary=step_said("coach_asked", scope.language, name=run.name))


def coach(scope: TurnScope, args: CoachArgs) -> Observation:
    coaching = scope.services.coaching
    if coaching is None:
        return Observation("The coach is not available in this engine.", ok=False)
    autopilot = coaching.autopilot
    language = scope.language
    match args.action:
        case "diagnose":
            return _diagnose(scope, coaching)
        case "autopilot_status":
            try:
                status = autopilot.status(scope.project_id)
            except LookupError:
                return Observation("The autopilot has not run for this project.", run_facts=True)
            facts = status.model_dump(mode="json", exclude={"log", "started_at", "finished_at"})
            facts["recent_log"] = [line.text for line in status.log[-5:]]
            return Observation(compact(facts), summary=step_said("autopilot_checked", language), run_facts=True)
        case "stop_autopilot":
            status = autopilot.stop(scope.project_id)
            text = f"The autopilot is {status.state}."
            scope.side_effects.append(text)
            return Observation(text, summary=step_said("autopilot_stopped", language))
        case "start_autopilot":
            values = {
                key: value
                for key, value in args.model_dump(include={"goal_success", "max_iterations", "max_minutes"}).items()
                if value is not None
            }
            try:
                status = autopilot.start(scope.project_id, AutopilotStart(mode=args.mode, **values))
            except RunInProgress:
                reason = "a run of this project is still training; stop it first"
                return Observation(reason, ok=False, summary=step_said("coach_refused", language, reason=reason))
            except (NotTrainable, RuntimeError) as error:
                return Observation(str(error), ok=False, summary=step_said("coach_refused", language, reason=error))
            text = (
                f"The autopilot started in {status.mode} mode: goal {status.goal_success}, at most "
                f"{status.max_iterations} runs. Its steps will appear in this conversation."
            )
            scope.side_effects.append(text)
            return Observation(text, summary=step_said("autopilot_started", language), run_facts=True)


COACH = Tool(
    name="coach",
    description=(
        "The training coach. diagnose: the coach studies the latest run's numbers and episode pictures and posts a "
        "diagnosis in this conversation. start_autopilot: train, diagnose, fix and train again until the goal holds "
        "or the budget runs out (mode ask stops at each fix for the person, fix applies fixes itself). "
        "stop_autopilot and autopilot_status. Use it only when the person asks for it."
    ),
    args=CoachArgs,
    step="train",
    effect="write",
    run=coach,
    per_turn=2,
    timeout_s=20,
    reads_when=lambda args: args.action == "autopilot_status",
)
