from typing import Literal

from pydantic import Field

from icarus.contracts.training import MAX_COPIES, MAX_STEPS
from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TurnScope
from icarus.copilot.agent.tools.inspect import compact
from icarus.copilot.chat_training import TrainingRequest
from icarus.training.run_store import TERMINAL_STATES


class TrainArgs(ToolArgs):
    action: Literal["start", "stop", "status"]
    total_steps: int | None = Field(
        default=None, ge=10_000, le=MAX_STEPS, description="Steps to train; none uses the recommended budget."
    )
    copies: int | None = Field(default=None, ge=1, le=MAX_COPIES, description="Parallel copies; none uses the brain's.")


def _status(scope: TurnScope) -> Observation:
    active = [s for s in scope.services.runs.list_runs(scope.project_id) if s.state not in TERMINAL_STATES]
    if not active:
        return Observation(
            "No run of this project is training.", summary="Checked training: nothing is running", run_facts=True
        )
    status = active[0]
    facts = {
        "name": status.name,
        "state": status.state,
        "step": status.step,
        "total_steps": status.total_steps,
        "copies": status.copies,
        "success_rate": status.success_rate,
    }
    return Observation(compact(facts), summary=f"Checked {status.name}", run_facts=True)


def train(scope: TurnScope, args: TrainArgs) -> Observation:
    if args.action == "status":
        return _status(scope)
    request = TrainingRequest(action=args.action, total_steps=args.total_steps, copies=args.copies)
    sentence = scope.services.trainer.act(scope.project_id, request)
    scope.reports.append(sentence)
    started = sentence.startswith("I started") or sentence.startswith("I asked")
    if started:
        scope.side_effects.append(sentence)
    verb = "Started training" if args.action == "start" else "Stopped training"
    return Observation(sentence, ok=started, summary=verb if started else sentence.rstrip(".")[:200])


TRAIN = Tool(
    name="train",
    description=(
        "Start or stop training this project, or read the status of the run that is training. Start uses the same "
        "checks as the Train button. Only start when the person asks to train, or in autopilot right after a fix."
    ),
    args=TrainArgs,
    step="train",
    effect="write",
    run=train,
    per_turn=2,
    timeout_s=15,
    reads_when=lambda args: args.action == "status",
)
