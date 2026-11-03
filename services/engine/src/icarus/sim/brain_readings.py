"""What a brain senses and does, read from a live world the way Play shows it."""

from pathlib import Path

from icarus.contracts.brain_network import BrainReadings
from icarus.contracts.play import PlayReading
from icarus.contracts.project import Project
from icarus.sim.env import ProjectEnv
from icarus.sim.model_state import LiveWorld, command_value, sensor_value
from icarus.sim.policy import CheckpointPolicy
from icarus.sim.sensor_info import reading_number

# How far into the first evaluation episode the readings are taken, so the brain has had time to act.
READINGS_SECONDS = 1.0


def sense_readings(world: LiveWorld) -> list[PlayReading]:
    """One number per sensor, with its display range; a muted sensor reads what it measures, unread by the brain."""
    return [
        PlayReading(
            id=sensor.id,
            label=sensor.label,
            value=reading_number(sensor.kind, sensor_value(world, sensor)),
            min=sensor.low,
            max=sensor.high,
            unit=sensor.unit,
        )
        for sensor in world.sensors
    ]


def action_readings(world: LiveWorld) -> list[PlayReading]:
    """What each action is set to right now, in its own range."""
    return [
        PlayReading(
            id=actuator.id,
            label=actuator.label,
            value=command_value(world, actuator),
            min=actuator.low,
            max=actuator.high,
            unit=actuator.unit,
        )
        for actuator in world.actuators
    ]


def read_readings(
    path: Path, project: Project, run_id: str, step: int, seconds: float = READINGS_SECONDS
) -> BrainReadings:
    """The checkpoint driving its first evaluation episode for `seconds` of simulated time (less if it ends first),
    then what it senses and the actions it chose, as MuJoCo computed them."""
    from icarus.training.evaluation import EVALUATION_SEED

    env = ProjectEnv(project)
    observed, _ = env.reset(seed=EVALUATION_SEED)
    policy = CheckpointPolicy.load(path, f"Checkpoint {step}", observed.shape[0])
    world = env.world
    while True:
        observed, _, terminated, truncated, _ = env.step(policy.act(observed).astype("float32"))
        if terminated or truncated or float(world.data.time) >= seconds - 1e-9:
            break
    return BrainReadings(
        run_id=run_id,
        step=step,
        seconds=round(float(world.data.time), 3),
        senses=sense_readings(world),
        actions=action_readings(world),
    )
