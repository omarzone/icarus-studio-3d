"""How full the copilot's context window is for the next turn, counted piece by piece."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.copilot import Capability

ContextPart = Literal["system", "tools", "skills", "memory", "project", "summary", "history", "message", "attachments"]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class ContextRequest(_Model):
    """The message being written: like a sent message, but the text may still be empty."""

    text: str = Field(default="", max_length=4000)
    selection: str | None = None
    workspace: str | None = Field(default=None, max_length=40)
    attachments: list[str] = Field(default=[], max_length=10)
    # How many renders of the scene the app will take and send with the message.
    scene_views: int = Field(default=0, ge=0, le=4)


class ContextItem(_Model):
    label: str
    tokens: int = Field(ge=0)


class ContextCategory(_Model):
    part: ContextPart
    tokens: int = Field(ge=0)
    # The category's pieces (each tool, skill, note, attachment…), summing to its tokens.
    items: list[ContextItem] = []


class ContextCompaction(_Model):
    # The conversation's verbatim size as the folding rule measures it.
    history_tokens: int = Field(ge=0)
    # Past this size, older messages fold into the rolling summary before the turn starts.
    fold_at: int = Field(ge=0)
    # Older messages are folded on every turn now, because the history is already past fold_at.
    folding: bool
    # The next turn writes or updates the summary with a model call before its first step.
    folds_next_turn: bool
    # Within a turn, older tool results are shortened once the prompt passes this size.
    prune_at: int = Field(ge=0)


class ContextUsage(_Model):
    capability: Capability
    # The model the next turn would call, or none when no model is connected.
    model: str | None
    window: int = Field(gt=0)
    # Whether the window comes from the model settings; otherwise it is the engine's conservative default.
    window_known: bool
    # Where the window comes from: set by the person in AI models, learned from a request the service refused as
    # too long, or assumed by the engine because the connection does not say.
    window_source: Literal["assumed", "set", "learned"] = "assumed"
    # Everything sent on the first step: the sum of the categories.
    used: int = Field(ge=0)
    # Kept free for the answer and its reasoning; a prompt never grows into it.
    reserve: int = Field(ge=0)
    free: int = Field(ge=0)
    categories: list[ContextCategory]
    compaction: ContextCompaction
