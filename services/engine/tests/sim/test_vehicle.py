"""A body with a vehicle component: throttle, brake and steering mapped onto its wheels and steering joints."""

import math

import mujoco
import numpy as np
import pytest

from icarus.contracts.operations import (
    AddBody,
    AddComponent,
    CreateObject,
    EditOperation,
    SetProperty,
    SetTaskFamily,
)
from icarus.contracts.project import Project
from icarus.contracts.properties import SwitchValue
from icarus.contracts.specs import BodySpec
from icarus.design.checks import design_report
from icarus.design.vehicle import ackermann_angles
from icarus.library.components import default_component
from icarus.library.parts import Part, hinge, solid
from icarus.projects.operations import apply_operations
from icarus.sim.env import ProjectEnv
from icarus.sim.play import PlaySession
from icarus.sim.policy import RandomPolicy
from icarus.sim.vehicle import light_signal
from tests.sim.conftest import project_from


@pytest.fixture
def car() -> Project:
    return project_from("parking_car")


def env_of(project: Project) -> ProjectEnv:
    env = ProjectEnv(project)
    env.reset(seed=0)
    place(env, 0.0, 0.0, 0.0)
    return env


def place(env: ProjectEnv, x: float, y: float, yaw_deg: float) -> None:
    world = env.world
    model, data = world.model, world.data
    free = int(model.jnt_qposadr[int(model.body_jntadr[world.agent])])
    yaw = math.radians(yaw_deg)
    data.qpos[free : free + 2] = (x, y)
    data.qpos[free + 3 : free + 7] = (math.cos(yaw / 2), 0, 0, math.sin(yaw / 2))
    data.qvel[:] = 0
    mujoco.mj_forward(model, data)


def run(env: ProjectEnv, action: tuple[float, float, float], steps: int) -> None:
    for _ in range(steps):
        env.step(np.array(action, dtype=np.float32))


def forward_speed(env: ProjectEnv) -> float:
    world = env.world
    velocity = np.zeros(6)
    mujoco.mj_objectVelocity(world.model, world.data, mujoco.mjtObj.mjOBJ_BODY, world.agent, velocity, 1)
    return float(velocity[3])


# Throttle, brake and steering as the brain sends them (-1..1); brake -1 is released.
FULL = (1.0, -1.0, 0.0)
COAST = (0.0, -1.0, 0.0)
BRAKE = (0.0, 1.0, 0.0)


def test_the_brain_drives_a_vehicle_with_throttle_brake_and_steering_instead_of_its_wheel_motors(car):
    env = ProjectEnv(car)
    assert [action.id for action in env.world.actuators] == ["car:throttle", "car:brake", "car:steering"]
    assert env.action_space.shape == (3,)
    assert [(action.low, action.high) for action in env.world.actuators] == [(-1, 1), (0, 1), (-1, 1)]


def test_ackermann_turns_the_inner_front_wheel_more_and_both_toward_one_turn_center(car):
    layout = env_of(car).world.compiled.vehicles["car"]
    left, right = ackermann_angles(layout, 1.0)
    assert math.degrees(left) == pytest.approx(35)
    assert 0 < right < left
    wheelbase = layout.steers[0].x - layout.rear_axle
    centers = [steer.y + wheelbase / math.tan(angle) for steer, angle in zip(layout.steers, (left, right), strict=True)]
    assert centers[0] == pytest.approx(centers[1])
    assert ackermann_angles(layout, -1.0) == pytest.approx([-right, -left])
    assert ackermann_angles(layout, 0.0) == [0.0, 0.0]


def test_full_throttle_drives_forward_up_to_the_speed_limit_and_reverse_backs_up(car):
    env = env_of(car)
    run(env, FULL, 120)
    assert env.world.data.xpos[env.world.agent, 0] > 5
    assert 2.5 < forward_speed(env) <= 3.0 + 0.15
    place(env, 0.0, 0.0, 0.0)
    run(env, (-1.0, -1.0, 0.0), 40)
    assert forward_speed(env) < -0.5


def test_the_brake_stops_the_car_much_sooner_than_coasting(car):
    coasting, braking = env_of(car), env_of(car)
    for env in (coasting, braking):
        run(env, FULL, 60)
    run(coasting, COAST, 20)
    run(braking, BRAKE, 20)
    assert abs(forward_speed(braking)) < 0.2 < forward_speed(coasting) - 1


def test_full_steering_turns_the_car_left_and_the_opposite_turns_it_right(car):
    headings = []
    for steering in (1.0, -1.0):
        env = env_of(car)
        run(env, (0.6, -1.0, steering), 60)
        forward = env.world.data.xmat[env.world.agent].reshape(3, 3)[:, 0]
        headings.append(math.degrees(math.atan2(forward[1], forward[0])))
    assert headings[0] > 30 and headings[1] < -30


def tank() -> Project:
    """A box on six wheels, three a side, steering by driving its sides at different speeds."""
    hull = solid("hull", "Hull", None, (0, 0, 0.45), "box", (1.6, 1.0, 0.4), 120, "#666666")
    hull.components["vehicle"] = {"steering": "differential", "drive": "all", "max_torque": 80, "max_speed": 3}
    parts = [hull]
    for index, x in enumerate((-0.6, 0.0, 0.6)):
        for side, y in (("left", 0.6), ("right", -0.6)):
            parts.append(
                solid(
                    f"wheel_{side}_{index}",
                    f"Wheel {side} {index}",
                    "hull",
                    (x, y, -0.15),
                    "cylinder",
                    (0.6, 0.6, 0.15),
                    5,
                    "#222222",
                    rotation=(-90, 0, 0),
                    extra={"joint": hinge((0, 0, 1), (-180, 180)), "collider": {"friction": 1.2}},
                )
            )
    goal = Part("goal", "Goal", None, {"transform": {"position": (10, 0, 0)}, "goal_zone": {}})
    operations: list[EditOperation] = [
        AddBody(op="add_body", body=BodySpec(id="tank", name="Tank", objects=[])),
        *[CreateObject(op="create_object", target="tank", object=part.spec()) for part in parts],
        CreateObject(op="create_object", target="world", object=goal.spec()),
        SetTaskFamily(op="set_task_family", family="navigation"),
    ]
    return apply_operations(project_from("empty_world"), operations)


def test_a_differential_vehicle_turns_in_place_by_driving_its_sides_apart():
    project = tank()
    report, _ = design_report(project)
    assert report.ok, [check.detail for check in report.checks if check.status == "fail"]
    env = env_of(project)
    assert env.world.compiled.vehicles["hull"].steers == ()
    run(env, (0.0, -1.0, 1.0), 40)
    forward = env.world.data.xmat[env.world.agent].reshape(3, 3)[:, 0]
    assert math.degrees(math.atan2(forward[1], forward[0])) > 20
    assert np.hypot(*env.world.data.xpos[env.world.agent, :2]) < 0.5


def test_a_vehicle_without_reverse_only_drives_forward(car):
    reverse = SetProperty(
        op="set_property",
        object="car",
        component="vehicle",
        property="reverse",
        value=SwitchValue(type="switch", value=False),
    )
    env = env_of(apply_operations(car, [reverse]))
    assert env.world.actuators[0].low == 0
    run(env, (-1.0, -1.0, 0.0), 40)
    assert forward_speed(env) > -0.05


def test_lights_follow_braking_backing_and_driving(car):
    env = env_of(car)
    vehicle = env.world.vehicle
    assert vehicle is not None
    assert light_signal(vehicle).model_dump() == {"brake": False, "reverse": False, "head": False}
    run(env, FULL, 40)
    assert light_signal(vehicle).model_dump() == {"brake": False, "reverse": False, "head": True}
    run(env, BRAKE, 2)
    assert light_signal(vehicle).brake
    place(env, 0.0, 0.0, 0.0)
    run(env, (-1.0, -1.0, 0.0), 10)
    assert light_signal(vehicle).reverse


def test_play_shows_the_vehicle_actions_and_its_light_states(car):
    session = PlaySession(car, 1, RandomPolicy(3, seed=0), seed=0)
    session.step_realtime(0.3)
    frame = session.frame()
    assert [action.label for action in frame.actions] == ["Throttle", "Brake", "Steering"]
    assert frame.signals is not None and frame.signals.lights is not None
    lamps = {geom.name: geom.light_role for geom in session.info().scene.geoms if geom.light_role}
    assert set(lamps.values()) == {"brake", "reverse", "head"}


def test_speed_and_target_senses_read_motion_and_where_the_spot_is_in_the_car_frame(car):
    env = env_of(car)
    run(env, FULL, 30)
    world = env.world
    senses = {sensor.kind: sensor for sensor in world.sensors}
    assert {"speed", "yaw", "target", "heading"} <= set(senses)
    speed = world.data.sensordata[senses["speed"].address]
    assert speed == pytest.approx(forward_speed(env), abs=0.05)
    place(env, 7.0, 0.0, 90.0)
    target = world.data.sensordata[senses["target"].address : senses["target"].address + 3]
    # The spot is 5 m ahead in the world, so 5 m to the car's right once it faces left.
    assert target[:2] == pytest.approx([0.0, -5.0], abs=1e-6)
    heading = world.data.sensordata[senses["heading"].address : senses["heading"].address + 3]
    assert heading[:2] == pytest.approx([0.0, -1.0], abs=1e-6)


@pytest.mark.parametrize("template", ["parking_car", "motorcycle"])
def test_the_vehicle_templates_pass_their_design_tests(template):
    report, compiled = design_report(project_from(template))
    assert report.ok, [check.detail for check in report.checks if check.status == "fail"]
    assert compiled is not None and compiled.vehicles


def test_the_motorcycle_steers_its_fork_and_drives_its_rear_wheel():
    layout = env_of(project_from("motorcycle")).world.compiled.vehicles["frame"]
    assert [steer.object for steer in layout.steers] == ["fork"]
    assert {wheel.object: wheel.drive for wheel in layout.wheels} == {"wheel_front": False, "wheel_rear": True}


def test_a_motor_on_a_wheel_the_vehicle_drives_gives_way_to_the_vehicle(car):
    motor = AddComponent(op="add_component", object="wheel_rear_left", component=default_component("motor", "motor"))
    env = env_of(apply_operations(car, [motor]))
    names = [env.world.model.actuator(index).name for index in range(env.world.model.nu)]
    assert "wheel_rear_left:drive" in names and not any(name.endswith(":motor") for name in names)
    assert env.action_space.shape == (3,)
