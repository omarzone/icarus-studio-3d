from icarus.contracts.scene import GoalSignal, SceneSignals
from icarus.sim.model_state import LiveWorld
from icarus.sim.rewards import RewardState, inside_goal, parked, stopped
from icarus.sim.vehicle import light_signal


def scene_signals(world: LiveWorld, state: RewardState) -> SceneSignals | None:
    """The goal rules and vehicle lights as the engine measures them at this state, for the viewport to show."""
    goal = None
    if world.goal is not None and world.agent is not None and state.goal is not None:
        goal = GoalSignal(
            inside=inside_goal(state), aligned=state.goal_aligned, stopped=stopped(state), met=parked(state)
        )
    lights = light_signal(world.vehicle) if world.vehicle is not None else None
    if goal is None and lights is None:
        return None
    return SceneSignals(goal=goal, lights=lights)
