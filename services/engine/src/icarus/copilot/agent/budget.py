import time
from collections import Counter
from collections.abc import Mapping
from dataclasses import dataclass, field

from icarus.copilot.client import Usage
from icarus.copilot.language import Language, say


@dataclass(frozen=True)
class AgentLimits:
    # Includes the wrap-up call that forces the answer.
    max_model_calls: int = 10
    max_tool_calls: int = 24
    max_calls_per_step: int = 6
    per_tool: Mapping[str, int] = field(
        default_factory=lambda: {"look": 4, "try": 6, "propose": 3, "apply": 2, "train": 2}
    )
    # The whole turn, model and tools.
    wall_seconds: float = 150.0
    # Sum of measured prompt tokens over the turn's calls: a cost bound.
    turn_prompt_tokens: int = 400_000
    parallel_tools: int = 4
    # The model's window when the connection does not say; conservative because it cannot be discovered.
    context_tokens: int = 64_000
    reserve_share: float = 0.15
    reserve_min: int = 8_000
    prune_ratio: float = 0.70
    history_share: float = 0.35
    keep_recent_tokens: int = 12_000
    keep_user_tokens: int = 4_000
    images_kept: int = 2
    step_observation_chars: int = 20_000


def ceiling(window: int, limits: AgentLimits) -> int:
    """The prompt size a request may reach, leaving room for the answer."""
    return window - max(int(limits.reserve_share * window), limits.reserve_min)


@dataclass
class TurnBudget:
    limits: AgentLimits
    window: int
    started: float = field(default_factory=time.monotonic)
    model_calls: int = 0
    prompt_tokens: int = 0
    tool_calls: Counter[str] = field(default_factory=Counter)
    repeated: Counter[tuple[str, str]] = field(default_factory=Counter)
    # The measured prompt size of the last call and how many messages it had, for the size estimate.
    measured: int | None = None
    measured_messages: int = 0
    # The text key of the limit that forced the answer, once one did; tools are then off.
    forced: str | None = None
    nudged_empty: bool = False
    overflow_recovered: bool = False

    @property
    def deadline(self) -> float:
        return self.started + self.limits.wall_seconds

    def record_model_call(self, usage: Usage | None, messages: int) -> None:
        self.model_calls += 1
        if usage is not None:
            self.prompt_tokens += usage.prompt_tokens
            self.measured, self.measured_messages = usage.prompt_tokens, messages

    def force(self, key: str) -> None:
        self.forced = self.forced or key

    def wrap_up_reason(self, language: Language = "en") -> str | None:
        """The first limit reached, worded for the person in their language, or None."""
        limits = self.limits
        if self.forced:
            return say(self.forced, language)
        if self.model_calls >= limits.max_model_calls - 1:
            return say("limit_steps", language, count=limits.max_model_calls)
        if sum(self.tool_calls.values()) >= limits.max_tool_calls:
            return say("limit_tools", language, count=limits.max_tool_calls)
        if time.monotonic() > self.deadline - 20:
            return say("limit_time", language, seconds=f"{limits.wall_seconds:g}")
        if self.prompt_tokens >= limits.turn_prompt_tokens:
            return say("limit_reading", language)
        return None

    def cap_reached(self, tool: str) -> str | None:
        cap = self.limits.per_tool.get(tool)
        if cap is not None and self.tool_calls[tool] >= cap:
            return f"You already used {tool} {cap} times this turn, its limit; answer with what you have."
        if sum(self.tool_calls.values()) >= self.limits.max_tool_calls:
            return "The turn's tool calls are used up; answer with what you have."
        return None
