import pytest

from icarus.hardware.check import best_kit, check_hardware, check_rows
from icarus.hardware.demands import BodyNeeds, MotorNeed, SensorNeed, body_needs
from icarus.hardware.project_brain import hardware_check, project_needs
from icarus.library.hardware import ACTUATORS, KITS, SENSORS, kit

SERVO = ACTUATORS["standard_servo"]


def _joint(id: str, effort: float, travel: float | None = 90, speed: float | None = None) -> MotorNeed:
    return MotorNeed(f"{id}:motor", f"{id}:joint", id.title(), "joint", effort, speed, travel)


def _needs(motors: list[MotorNeed], sensors: list[SensorNeed] | None = None) -> BodyNeeds:
    return BodyNeeds(motors, sensors or [], navigation=False)


def test_every_kit_names_parts_that_exist_in_the_library():
    for item in KITS.values():
        assert all(slot.part in ACTUATORS and slot.count > 0 for slot in item.actuators)
        assert all(slot.part in SENSORS and slot.count > 0 for slot in item.sensors)
    assert all(part.effort > 0 and part.speed > 0 for part in ACTUATORS.values())


@pytest.mark.parametrize(
    ("effort", "status"), [(0.5 * SERVO.effort, "pass"), (0.9 * SERVO.effort, "warn"), (1.5 * SERVO.effort, "fail")]
)
def test_a_joint_passes_inside_the_margin_warns_near_the_rating_and_fails_beyond_it(effort, status):
    (row,) = check_rows(_needs([_joint("knee", effort)]), kit("servo_humanoid"))
    assert (row.status, row.hardware, row.unit) == (status, SERVO.name, "N·m")
    assert row.need == pytest.approx(effort) and row.limit == SERVO.effort
    assert SERVO.name in row.gap


def test_a_failing_joint_says_how_far_short_the_part_is():
    (row,) = check_rows(_needs([_joint("knee", 3 * SERVO.effort)]), kit("servo_humanoid"))
    assert "3.0× short" in row.gap


def test_travel_and_speed_fail_a_joint_whose_torque_fits():
    wide = check_rows(_needs([_joint("hip", 0.2, travel=270)]), kit("servo_humanoid"))[0]
    endless = check_rows(_needs([_joint("hip", 0.2, travel=None)]), kit("servo_humanoid"))[0]
    fast = check_rows(_needs([_joint("hip", 0.2, speed=3 * SERVO.speed)]), kit("servo_humanoid"))[0]
    assert (wide.status, wide.unit) == ("fail", "°")
    assert endless.status == "fail" and "without end" in endless.gap
    assert (fast.status, fast.unit) == ("fail", "rad/s")


def test_joints_beyond_the_kits_count_and_roles_it_lacks_fail_without_a_part():
    many = [_joint(f"j{i}", 0.1) for i in range(KITS["servo_humanoid"].actuators[0].count + 2)]
    rows = check_rows(_needs(many), kit("servo_humanoid"))
    assert [row.status for row in rows[-2:]] == ["fail", "fail"] and rows[-1].hardware is None
    wheel = MotorNeed("w:drive", "w:joint", "Wheel", "drive", 0.01, 1.0, None)
    (row,) = check_rows(_needs([wheel]), kit("servo_humanoid"))
    assert row.status == "fail" and "no part for drive" in row.gap


def test_a_shared_drive_motor_carries_every_drive_wheel_together():
    wheels = [MotorNeed(f"{side}:drive", f"{side}:joint", side, "drive", 1.0, 10.0, None) for side in ("L", "R")]
    (row,) = check_rows(_needs(wheels), kit("rc_car"))
    assert row.id == "drive:shared" and row.need == pytest.approx(2.0) and row.status == "fail"


def test_sensors_check_reach_and_sim_only_senses_always_warn():
    sensors = [
        SensorNeed("near", "Near", "distance", range_m=2.0),
        SensorNeed("far", "Far", "distance", range_m=5.0),
        SensorNeed("very_far", "Very far", "distance", range_m=10.0),
        SensorNeed("goal", "Goal distance and direction", None, virtual=True),
    ]
    rows = check_rows(_needs([], sensors), kit("rc_car"))
    assert [row.status for row in rows] == ["pass", "warn", "fail", "warn"]
    assert rows[3].hardware is None and "odometry" in rows[3].gap


def test_skipped_rows_leave_the_verdict_and_the_problem_moves_on():
    needs = _needs([_joint("knee", 3.0), _joint("hip", 0.95)])
    check = check_hardware("p", 1, needs, kit("servo_humanoid"), frozenset())
    assert check.verdict == "fail" and check.problem is not None and check.problem.title.startswith("Knee")
    skipped = check_hardware("p", 1, needs, kit("servo_humanoid"), frozenset({"knee:motor"}))
    assert [row.status for row in skipped.rows] == ["skipped", "warn"]
    assert skipped.verdict == "warn" and skipped.problem is not None and skipped.problem.title.startswith("Hip")


def test_the_best_kit_for_a_car_is_a_car_kit_and_for_legs_a_servo_kit(studio):
    car = body_needs(studio.project("parking_car").project)
    walker = body_needs(studio.project("walker_robot").project)
    assert best_kit(car).id in ("rc_car", "smart_car")
    assert any(slot.role == "joint" for slot in best_kit(walker).actuators)


def test_the_parking_car_has_drive_steering_rays_and_sim_only_senses(studio):
    needs = body_needs(studio.project("parking_car").project)
    assert {need.role for need in needs.motors} == {"drive", "steering"}
    assert all(need.speed and need.speed > 0 for need in needs.motors if need.role == "drive")
    assert any(need.role == "distance" for need in needs.sensors)
    assert any(need.virtual and need.id == "goal" for need in needs.sensors)
    assert needs.top_speed and needs.top_speed > 0 and needs.measured_from is None


def test_a_trained_brain_is_measured_and_never_exceeds_the_design_limits(studio):
    state = studio.project("walker_robot")
    design = {need.id: need for need in body_needs(state.project).motors}
    studio.brain(state)
    check = hardware_check(state, studio.runs, "servo_humanoid")
    assert check.measured_from is not None and "step 5,000" in check.measured_from
    assert all(row.measured for row in check.rows if row.kind == "joint")
    measured = project_needs(state, studio.runs).motors
    assert measured and all(need.measured and need.speed is not None for need in measured)
    assert all(need.effort <= design[need.id].effort + 1e-6 for need in measured)
    assert any(need.effort > 0 for need in measured)
