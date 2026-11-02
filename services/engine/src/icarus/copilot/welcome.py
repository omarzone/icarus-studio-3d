"""The copilot's opener for a new project's empty conversation, written by the engine without a model call."""

from icarus.contracts.copilot import ChatSuggestion, CopilotMessage
from icarus.contracts.project import Project
from icarus.copilot.agent.turn import new_message

TITLE = "What should we build?"


def _starters(project: Project) -> list[ChatSuggestion]:
    if project.task.family == "none":
        return [
            ChatSuggestion(text="Give the robot a task to learn", intent="propose-change"),
            ChatSuggestion(text="What is in this world?", intent="explain"),
            ChatSuggestion(text="Suggest ideas for this project", intent="ask"),
        ]
    return [
        ChatSuggestion(text="Explain the task and its rewards", intent="explain"),
        ChatSuggestion(text="Check the design before training", intent="ask"),
        ChatSuggestion(text="Start training", intent="train-run"),
    ]


def welcome_message(project: Project) -> tuple[CopilotMessage, list[ChatSuggestion]]:
    bodies = ", ".join(body.name for body in project.bodies[:3])
    has = f" It has {bodies}." if bodies else ""
    text = (
        f"I'm the copilot of {project.name}.{has} Tell me what the robot should learn and I'll design the world, the "
        "body and the rewards, test them, and train it. Pick a start below or write your own."
    )
    return new_message("copilot", text, title=TITLE), _starters(project)
