from pydantic import Field

from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TurnScope
from icarus.copilot.agent.tools.trying import LookSpec, observed, tried
from icarus.copilot.step_words import step_said
from icarus.library.agents import agent_operations, library_bodies


class AddAgentArgs(ToolArgs):
    body: str = Field(description="Library id of the body the agent is made of (see bodies in the library).")
    name: str = Field(min_length=1, max_length=80, description="The agent's name, shown on its label and scoreboard.")
    start: tuple[float, float] = Field(description="World x, y where it starts: its lane's start.")
    goal: tuple[float, float] = Field(description="World x, y of its own goal: its lane's finish.")
    goal_radius: float = Field(default=1.0, ge=0.1, le=20, description="Radius of its goal zone in metres.")
    look: LookSpec | None = Field(default=None, description="Also render the candidate from this camera.")


def add_agent(scope: TurnScope, args: AddAgentArgs) -> Observation:
    bodies = library_bodies()
    if args.body not in bodies:
        text = f"There is no library body `{args.body}`. Bodies: {', '.join(sorted(bodies))}"
        return Observation(text, ok=False, summary=step_said("tried_invalid", scope.language, changes=args.name[:40]))
    operations = agent_operations(scope.state.project, args.body, args.name, args.start, args.goal, args.goal_radius)
    result, summary = tried(scope, list(operations))
    added = next(op for op in operations if op.op == "add_agent")
    result["agent"] = added.model_dump(include={"agent": {"id", "body", "spawn", "goal"}})["agent"]
    return observed(scope, result, summary, args.look)


ADD_AGENT = Tool(
    name="add_agent",
    description=(
        "Add another learner to the project: a library body in its own lane, with its own spawn point at start, its "
        "own goal zone at goal, the task its body trains with and the project's brain. Each agent trains with only "
        "its own body (the others are absent from its physics) and all train together as a group of runs. The first "
        "agent added also makes the project's body an agent. Lanes come from the obstacle_course layout summary "
        "(lanes: start and goal of each). It runs a try and returns its try_id for propose or apply, and the new "
        "agent's id: change its rewards or brain in a try on top of it (base_try) with set_reward_term or set_brain "
        "naming agent, its lane with set_agent, and take it out with remove_agent."
    ),
    args=AddAgentArgs,
    step="try",
    effect="read",
    run=add_agent,
    per_turn=6,
    timeout_s=60,
    observation_chars=8_000,
)
