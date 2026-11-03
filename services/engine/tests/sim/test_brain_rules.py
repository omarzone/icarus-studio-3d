import numpy as np

from icarus.contracts.operations import SetBrain, SetEpisode
from icarus.projects.operations import apply_operations
from icarus.sim.env import ProjectEnv
from icarus.sim.model_state import build_world, control_substeps
from tests.sim.conftest import project_from


def _run(env: ProjectEnv, action: np.ndarray, limit: int = 2_000) -> tuple[int, bool, bool, dict]:
    env.reset(seed=0)
    for step in range(1, limit + 1):
        _, _, terminated, truncated, info = env.step(action)
        if terminated or truncated:
            return step, terminated, truncated, info
    raise AssertionError("The episode never ended")


def test_a_try_ends_after_the_task_s_seconds_at_the_brain_s_decision_rate():
    project = apply_operations(
        project_from("walker_robot"),
        [SetEpisode(op="set_episode", seconds=5, end_on_fall=False), SetBrain(op="set_brain", decisions_per_second=10)],
    )
    env = ProjectEnv(project)
    steps, terminated, truncated, info = _run(env, np.zeros(6, dtype=np.float32))
    assert (steps, terminated, truncated) == (50, False, True)
    assert abs(float(env.world.data.time) - 5.0) < 0.05
    assert "fell" in info


def test_a_fall_ends_the_try_only_while_its_rule_is_on():
    falling = project_from("walker_robot")
    limp = np.full(6, -1.0, dtype=np.float32)
    env = ProjectEnv(falling)
    steps, terminated, _, info = _run(env, limp)
    assert terminated and info["fell"] and steps < 600
    kept = ProjectEnv(apply_operations(falling, [SetEpisode(op="set_episode", end_on_fall=False, seconds=10)]))
    _, terminated, truncated, info = _run(kept, limp)
    assert not terminated and truncated and info["fell"]


def test_a_muted_sense_reads_zero_and_a_muted_motor_rests():
    project = project_from("walker_robot")
    muted = apply_operations(
        project, [SetBrain(op="set_brain", muted_senses=["torso/balance"], muted_motors=["thigh_left/motor"])]
    )
    heard, env = ProjectEnv(project), ProjectEnv(muted)
    heard.reset(seed=0)
    env.reset(seed=0)
    loud = heard.step(np.ones(6, dtype=np.float32))[0]
    quiet = env.step(np.ones(6, dtype=np.float32))[0]
    assert loud.shape == quiet.shape
    # The balance sensor's accelerometer reads gravity; muted, the brain reads zeros in its place.
    assert np.abs(loud[:6]).max() > 1
    assert np.all(quiet[:6] == 0) and np.any(quiet[6:] != 0)
    actuator = env.world.actuators[0]
    assert actuator.id == "thigh_left:motor"
    assert env.world.data.ctrl[actuator.index] == min(max(0.0, actuator.low), actuator.high)
    assert env.world.data.ctrl[env.world.actuators[1].index] == env.world.actuators[1].high


def test_decisions_per_second_set_how_many_physics_steps_a_decision_lasts():
    project = project_from("parking_car")
    slow = build_world(apply_operations(project, [SetBrain(op="set_brain", decisions_per_second=10)]))
    assert control_substeps(slow) == 2 * control_substeps(build_world(project))
