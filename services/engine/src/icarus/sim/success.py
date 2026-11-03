from icarus.sim.model_state import LiveWorld
from icarus.sim.rewards import RewardState, delivered, parked, plates_done


def task_done(world: LiveWorld, state: RewardState) -> bool:
    """Whether the try succeeds at this state: the object rests in the goal when the task carries one, the plates are
    reached when they are the goal (in any family), otherwise a navigation agent meets the goal zone's rules."""
    if world.carried is not None:
        return delivered(state)
    if world.plate_goal:
        return plates_done(state)
    return world.family == "navigation" and parked(state)
