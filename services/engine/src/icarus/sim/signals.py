from icarus.contracts.decor import PlateSignal
from icarus.contracts.scene import GoalSignal, SceneSignals
from icarus.sim.displays import display_readings
from icarus.sim.model_state import LiveWorld
from icarus.sim.rewards import RewardState, inside_goal, parked, stopped
from icarus.sim.vehicle import light_signal


def plate_signals(world: LiveWorld) -> list[PlateSignal]:
    return [
        PlateSignal(
            object=plate.object, pressed=state.pressed, occupied=state.occupied, active=state.active, reached=done
        )
        for plate, state, done in zip(world.plates, world.plate_states, world.plate_reached, strict=False)
    ]


def scene_signals(world: LiveWorld, state: RewardState) -> SceneSignals | None:
    """The goal rules, vehicle lights, plates and display values as the engine measures them at this state, for the
    viewport to show."""
    goal = None
    if world.goal is not None and world.agent is not None and state.goal is not None:
        goal = GoalSignal(
            inside=inside_goal(state), aligned=state.goal_aligned, stopped=stopped(state), met=parked(state)
        )
    lights = light_signal(world.vehicle) if world.vehicle is not None else None
    plates = plate_signals(world)
    displays = display_readings(world, state)
    if goal is None and lights is None and not plates and not displays:
        return None
    return SceneSignals(goal=goal, lights=lights, plates=plates, displays=displays)
