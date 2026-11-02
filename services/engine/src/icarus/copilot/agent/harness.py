"""The chat's tool set with the harness extensions: skills, memory, comparisons and, for the main loop, subagents."""

from typing import Any

from icarus.copilot.agent.tools import REGISTRY
from icarus.copilot.agent.tools.base import Tool
from icarus.copilot.comparison_tools import COMPARISON_TOOLS
from icarus.copilot.memory_tools import MEMORY_TOOLS
from icarus.copilot.skill_tool import USE_SKILL
from icarus.copilot.subagent_tools import subagent_tools
from icarus.copilot.subagents import Subagents

SUBAGENT_NOTE = (
    "You are a subagent: you work alone on one job handed to you by the copilot, and nobody reads your steps. Do "
    "the job with your tools, then call answer with what you found or changed, citing proposal ids. Notes from the "
    "copilot may arrive between steps."
)


def worker_tools() -> dict[str, Tool[Any]]:
    """Every tool a subagent may be given: the agent's own, skills, memory and comparisons."""
    return {**REGISTRY, USE_SKILL.name: USE_SKILL, **MEMORY_TOOLS, **COMPARISON_TOOLS}


def chat_tools(hub: Subagents | None) -> dict[str, Tool[Any]]:
    """The conversation's own tools; only it gets the subagent tools, so subagents never start other subagents."""
    return {**worker_tools(), **(subagent_tools(hub) if hub is not None else {})}
