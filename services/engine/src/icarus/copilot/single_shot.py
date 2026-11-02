import json
from dataclasses import dataclass, field

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.copilot import Conversation, CopilotMessage
from icarus.contracts.operations import EditOperation
from icarus.contracts.project import Project
from icarus.copilot.candidate import dry_run
from icarus.copilot.chat_training import TrainingRequest
from icarus.copilot.grounding import unsupported_numbers

HISTORY_MESSAGES = 12

# The one-call path for services that refuse native tools: one structured reply with an optional proposal.
SYSTEM = """You are the copilot of Icarus Studio 3D, inside one project: a world, bodies, a task and a brain trained
with reinforcement learning on MuJoCo. Answer the person briefly and concretely, in the language of the person's
message. Match their level: plain everyday words and no jargon for casual messages, technical terms for technical ones.
When they ask for a change, propose it as edit operations on objects, components and properties that exist in the
project, using only library component kinds and values inside their ranges. When you place or move objects near the
goal or a body, compare the gaps with the body's "size" (length, width, height in metres) in the context and add a
short warning to the proposal's "warnings" when the body cannot fit or pass. When they ask what something does,
explain it from the library schema and its current values.
When they ask to vary something between training copies or on every try (positions, turning, colors, friction of a
world object), add or set the "randomize" component (Randomize per copy) on that world object; never on body parts.
The "sky" component on a world object (preset, top and horizon colors, ambient light, fog) controls how the sky, light
and haze look; change the look with set_property on it. Its top and horizon colors apply only with preset "custom",
so "blue sky" means preset "day", or preset "custom" with a blue top color.
Pictures: views are renders of the current scene taken by the app; use them to check layout, colors and proportions
before proposing. Other pictures, video frames and documents are the person's references. Numbers in their documents
count as sources.
Only cite numbers that appear in the context below or in their message, rounded to 2 or 3 significant figures.
Training: you can start or stop training with the "training" field. Set it only when the person's latest message
asks to train, start, stop or pause training{autopilot}. Otherwise leave it null. In ask mode a start becomes a Train
button for the person. The engine adds what happened to your answer, so do not claim a run started or stopped.
Diagnosis: base every explanation of learning on "latest_run". When it says "No training has run for this project
yet", answer that no training has run yet and offer to start one, without guessing causes. When a run exists, use its
evaluations, "latest_evaluation" and "latest_training" (reward_terms, episode_length, success and failure rates) and
compare its total_steps with recommended_steps; when "far_below_recommended" is true, say the run is too short to
judge.
Suggest up to three short follow-up questions.
Autonomy: {autonomy}
Conversation so far:
{history}
Project context (JSON):
{context}"""

AUTOPILOT = ", or right after a change you propose to fix why it does not learn"


class _Output(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProposalDraft(_Output):
    summary: str = Field(min_length=1, max_length=200)
    explanation: str = Field(min_length=1, max_length=2000)
    operations: list[EditOperation] = Field(min_length=1, max_length=50)
    # Problems the copilot sees in its own change, such as a gap narrower than the body.
    warnings: list[str] = Field(default_factory=list, max_length=3)


class ChatReply(_Output):
    answer: str = Field(min_length=1, max_length=4000)
    proposal: ProposalDraft | None
    suggestions: list[str] = Field(max_length=3)
    training: TrainingRequest | None = None


@dataclass
class Review:
    """What the last check of a reply found, so the final answer knows which parts to drop."""

    project: Project
    sources: list[str]
    # Run results and the person's words: the only sources that back a percentage.
    percent_sources: list[str]
    unsupported: list[str] = field(default_factory=list)
    proposal_unsupported: list[str] = field(default_factory=list)
    proposal_problem: str | None = None
    dropped_suggestions: list[str] = field(default_factory=list)

    def _unbacked(self, text: str, sources: list[str]) -> list[str]:
        return unsupported_numbers(text, sources, self.percent_sources)

    def check(self, reply: ChatReply) -> list[str]:
        self.proposal_problem, self.proposal_unsupported = None, []
        sources = list(self.sources)
        if reply.proposal is not None:
            result = dry_run(self.project, reply.proposal.operations)
            if isinstance(result, str):
                self.proposal_problem = result
            else:
                # Values the copilot proposes in a validated change are backed by that change.
                sources.append(json.dumps([op.model_dump() for op in reply.proposal.operations]))
            described = "\n".join([reply.proposal.summary, reply.proposal.explanation, *reply.proposal.warnings])
            self.proposal_unsupported = self._unbacked(described, sources)
        self.unsupported = self._unbacked(reply.answer, sources)
        self.dropped_suggestions = [text for text in reply.suggestions if self._unbacked(text, sources)]
        problems = [f"The proposal is not valid: {self.proposal_problem}"] if self.proposal_problem else []
        unbacked = [*self.unsupported, *self.proposal_unsupported]
        unbacked += [number for text in self.dropped_suggestions for number in self._unbacked(text, sources)]
        if unbacked:
            problems.append(f"These numbers are not in the context or the conversation: {', '.join(unbacked)}")
        return problems


def _attached(message: CopilotMessage) -> str:
    return f" [attached: {', '.join(item.name for item in message.attachments)}]" if message.attachments else ""


def history_text(conversation: Conversation) -> str:
    recent = conversation.messages[-HISTORY_MESSAGES:]
    return "\n".join(f"{message.role}: {message.text}{_attached(message)}" for message in recent) or "(none)"
