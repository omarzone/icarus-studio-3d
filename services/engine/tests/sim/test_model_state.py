import mujoco
import numpy as np

from icarus.sim.model_state import build_world, observation


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


def test_navigation_keeps_sensors_and_goal_only(parking):
    assert observation(build_world(parking)).shape == (5 + 3,)
