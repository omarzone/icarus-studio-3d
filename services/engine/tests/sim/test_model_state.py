import mujoco
import numpy as np

from icarus.sim.model_state import GOAL_DISTANCE_SCALE, build_world, observation


def test_the_parking_car_has_five_rays_of_ten_metres_and_four_actuators(parking):
    world = build_world(parking)
    rays = [sensor for sensor in world.sensors if sensor.kind == "ray"]
    assert len(rays) == 5
    assert all((ray.low, ray.high, ray.unit) == (0, 10, "m") for ray in rays)
    assert len(world.actuators) == 4
    assert world.model.body(world.agent).name == "car"
    assert world.goal is not None and world.goal.radius == 1.5


def test_the_walker_has_balance_and_touch_sensors_and_six_actuators(walker):
    world = build_world(walker)
    kinds = sorted(sensor.kind for sensor in world.sensors)
    assert kinds == ["accel", "gyro", "touch", "touch"]
    assert len(world.actuators) == 6
    assert world.goal is None
    assert world.geom_objects["foot_left"] == "foot_left"
    assert world.object_names["foot_left"] == "Left foot"


def test_locomotion_observes_the_angle_and_speed_of_every_body_joint(walker):
    world = build_world(walker)
    hinges = [index for index in range(world.model.njnt) if world.model.jnt_type[index] == mujoco.mjtJoint.mjJNT_HINGE]
    assert len(hinges) == 6
    knee = world.model.joint("shin_left:joint").id
    world.data.qpos[world.model.jnt_qposadr[knee]] = 0.7
    world.data.qvel[world.model.jnt_dofadr[knee]] = -1.25
    mujoco.mj_forward(world.model, world.data)
    values = observation(world)
    assert values.shape == (8 + 2 * 6,)
    angles, speeds = values[8:14], values[14:20]
    assert 0.7 in np.round(angles, 6) and -1.25 in np.round(speeds, 6)
    assert np.count_nonzero(angles) == 1 and np.count_nonzero(speeds) == 1


def test_navigation_observes_rays_motion_steering_and_the_goal_in_the_agent_frame(parking):
    world = build_world(parking)
    model, data = world.model, world.data
    free = model.jnt_qposadr[model.body_jntadr[world.agent]]
    data.qpos[free + 3 : free + 7] = (np.cos(np.pi / 4), 0, 0, np.sin(np.pi / 4))
    data.qvel[model.jnt_dofadr[model.body_jntadr[world.agent]] + 1] = 1.5
    data.qvel[model.jnt_dofadr[model.body_jntadr[world.agent]] + 5] = 0.4
    steer = model.joint("steer_left:joint")
    data.qpos[model.jnt_qposadr[steer.id]] = steer.range[1] / 2
    mujoco.mj_forward(model, data)
    values = observation(world)
    assert values.shape == (5 + 3 + 2 + 3,)
    rays, motion, steering, goal = values[:5], values[5:8], values[8:10], values[10:]
    np.testing.assert_allclose(rays, 1.0)
    np.testing.assert_allclose(motion, (1.5, 0.0, 0.4), atol=1e-6)
    np.testing.assert_allclose(steering, (0.5, 0.0), atol=1e-6)
    np.testing.assert_allclose(goal, (12 / GOAL_DISTANCE_SCALE, 0.0, -1.0), atol=1e-6)
