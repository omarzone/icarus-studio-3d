"""The values displays show, measured on the live world at this step; the viewport only formats them."""

import math

from icarus.contracts.decor import DisplayReading
from icarus.contracts.project import Project
from icarus.contracts.scene import SceneSignals
from icarus.design.components import view
from icarus.projects.document import all_objects
from icarus.sim.model_state import LiveWorld, sensor_value
from icarus.sim.rewards import RewardState
from icarus.sim.sensor_info import reading_number


def goal_distance(state: RewardState) -> float | None:
    if state.goal is None:
        return None
    return math.hypot(state.goal[0] - state.position[0], state.goal[1] - state.position[1])


def _progress(world: LiveWorld, state: RewardState) -> float | None:
    distance, start = goal_distance(state), world.tally.start_distance
    if distance is None or start is None or start <= 1e-9:
        return None
    return min(1.0, max(0.0, 1.0 - distance / start))


def _sensor(world: LiveWorld, wanted: str) -> float | None:
    if not wanted:
        return None
    for sensor in world.sensors:
        if sensor.id == wanted or sensor.id.startswith(f"{wanted}:"):
            return reading_number(sensor.kind, sensor_value(world, sensor))
    return None


def _value(world: LiveWorld, state: RewardState, source: str, sensor: str) -> float | None:
    tally = world.tally
    match source:
        case "episode_time":
            return float(world.data.time)
        case "step":
            return float(round(float(world.data.time) / world.control_period))
        case "try":
            return float(tally.tries)
        case "training_steps":
            return float(tally.training_steps) if tally.training_steps is not None else None
        case "successes":
            return float(tally.successes)
        case "reward":
            return tally.episode_return
        case "goal_distance":
            return goal_distance(state)
        case "goal_progress":
            return _progress(world, state)
        case "sensor":
            return _sensor(world, sensor)
        case "plates":
            return float(state.plates_reached)
        case _:
            return None


def display_readings(world: LiveWorld, state: RewardState) -> list[DisplayReading]:
    readings: list[DisplayReading] = []
    for item in world.compiled.decor.displays:
        value = _value(world, state, str(item.fields["source"]), item.sensor)
        readings.append(DisplayReading(object=item.object, value=None if value is None else round(value, 3)))
    return readings


def training_step_displays(project: Project) -> frozenset[str]:
    """Objects whose display shows the brain's training steps, which only the training loop knows while it runs."""
    found: set[str] = set()
    for obj in all_objects(project):
        component = view(obj, "display")
        if component is not None and component.text("source") == "training_steps":
            found.add(obj.id)
    return frozenset(found)


def stamp_training_steps(signals: SceneSignals | None, objects: frozenset[str], steps: int) -> None:
    """Fill the training-step displays of a frame a training copy captured with the run's step count."""
    if signals is None or not objects:
        return
    for reading in signals.displays:
        if reading.object in objects:
            reading.value = float(steps)
