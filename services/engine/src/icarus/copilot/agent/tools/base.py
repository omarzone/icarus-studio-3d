import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Literal

from pydantic import BaseModel, ConfigDict

from icarus.contracts.copilot import AgentStep, AttachmentInfo, Autonomy, CopilotProposal
from icarus.contracts.events import EngineEvent
from icarus.contracts.operations import EditOperation
from icarus.contracts.project import ProjectState
from icarus.copilot.attachments import AttachmentStore
from icarus.copilot.chat_training import ChatTrainer
from icarus.copilot.language import Language
from icarus.copilot.response_schema import response_schema
from icarus.design.compiler import CompiledModel
from icarus.projects.store import ProjectStore
from icarus.sim.views import ViewRenderer
from icarus.training.run_store import RunStore

if TYPE_CHECKING:
    from icarus.copilot.agent.tools.coaching import Coaching
    from icarus.copilot.client import ModelClient
    from icarus.copilot.hooks import HookRegistry
    from icarus.motion.clip_store import ClipStore
    from icarus.projects.skins import SkinStore

type StepKind = Literal["inspect", "look", "try", "propose", "train", "library", "export"]
type Effect = Literal["read", "write"]

log = logging.getLogger(__name__)

OBSERVATION_CHARS = 6_000
MAX_VIEWS = 4


class ToolArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")


@dataclass(frozen=True)
class Observation:
    # What the model reads; it also becomes a source that backs numbers in the answer.
    text: str
    ok: bool = True
    image: bytes | None = None
    image_label: str | None = None
    # The step line the person sees, written by the tool and never by the model.
    summary: str = ""
    # Run results, the only engine data that backs a percentage.
    run_facts: bool = False


@dataclass(frozen=True)
class TryResult:
    id: str
    operations: list[EditOperation]
    base_revision: int
    problems: list[str]
    compiled: CompiledModel | None
    # Design problems this change brings that do not fail it; a proposal carries them to the person.
    warnings: tuple[str, ...] = ()

    @property
    def passed(self) -> bool:
        return not self.problems and self.compiled is not None


@dataclass(frozen=True)
class ToolServices:
    projects: ProjectStore
    runs: RunStore
    trainer: ChatTrainer
    attachments: AttachmentStore
    views: ViewRenderer
    # The coach and the autopilot for the chat's coach tool; none until attached.
    coaching: "Coaching | None" = None
    # Where models and reference clips are kept, for the rigging and motion tools; none until attached.
    skins: "SkinStore | None" = None
    clips: "ClipStore | None" = None


@dataclass
class TurnScope:
    """What one turn's tools read and write; created when the turn starts and dropped when it ends."""

    project_id: str
    state: ProjectState
    autonomy: Autonomy
    services: ToolServices
    tries: dict[str, TryResult] = field(default_factory=dict)
    # The one open proposal this message carries and the try it came from; a later propose replaces it.
    proposal: CopilotProposal | None = None
    proposal_try: str | None = None
    # A proposal an earlier message left open, which the person can still apply.
    earlier_proposal: bool = False
    # The person's latest message and its language, for every text the engine writes itself.
    request: str = ""
    language: Language = "en"
    applied: list[CopilotProposal] = field(default_factory=list)
    views: list[AttachmentInfo] = field(default_factory=list)
    steps: list[AgentStep] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    percent_sources: list[str] = field(default_factory=list)
    # Sentences of what changed, kept even when the model fails later.
    side_effects: list[str] = field(default_factory=list)
    # Sentences the engine adds to the answer, such as what the trainer did.
    reports: list[str] = field(default_factory=list)
    train_offered: bool = False
    can_see: bool = True
    view_slots: int = 0
    head_compiled: CompiledModel | None = None
    # The tools this turn may call by name; none means the chat's own set.
    tools: "dict[str, Tool[Any]] | None" = None
    # The hook points this turn's calls pass through; none means the engine's default rules.
    hooks: "HookRegistry | None" = None
    # Where this turn's live events go (steps, views, proposals); none publishes nothing.
    publish: Callable[[EngineEvent], None] | None = None
    turn_id: str = ""
    # Runs this turn started, for the message's run card.
    started_runs: list[str] = field(default_factory=list)
    # The turn's model and the one that sees pictures, for tools that plan with a model; none means not connected.
    client: "ModelClient | None" = None
    vision: "ModelClient | None" = None
    # The person's attachments sent with this message, by id, and when the turn must end (time.monotonic).
    attachments: list[str] = field(default_factory=list)
    deadline: float | None = None
    guard: threading.Lock = field(default_factory=threading.Lock)

    def emit(self, event: EngineEvent) -> None:
        if self.publish is None:
            return
        try:
            self.publish(event)
        except Exception:  # A broken listener must not break the person's turn.
            log.exception("could not publish %s", event.type)

    def next_try_id(self) -> str:
        with self.guard:
            try_id = f"t{len(self.tries) + 1}"
            self.tries[try_id] = TryResult(try_id, [], self.state.revision.number, ["still running"], None)
            return try_id

    def take_view_slot(self) -> bool:
        """Whether one more render may be attached to this message; at most MAX_VIEWS are."""
        with self.guard:
            if self.view_slots >= MAX_VIEWS:
                return False
            self.view_slots += 1
            return True


@dataclass(frozen=True)
class Tool[A: ToolArgs]:
    name: str
    description: str
    args: type[A]
    step: StepKind
    effect: Effect
    run: Callable[[TurnScope, A], Observation]
    per_turn: int | None
    timeout_s: float
    observation_chars: int = OBSERVATION_CHARS
    # Writes that only read for some arguments, such as asking the trainer for its status.
    reads_when: Callable[[A], bool] | None = None

    def effect_for(self, args: A) -> Effect:
        return "read" if self.reads_when is not None and self.reads_when(args) else self.effect


def tool_definition(name: str, description: str, args: type[BaseModel]) -> dict[str, Any]:
    """One OpenAI function definition; strict only when the schema can be expressed in strict mode."""
    schema, strict = response_schema(args)
    function: dict[str, Any] = {"name": name, "description": description, "parameters": schema}
    if strict:
        function["strict"] = True
    return {"type": "function", "function": function}
