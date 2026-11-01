import time

import pytest

from icarus.contracts.operations import SetProperty
from icarus.contracts.properties import NumberValue, VectorValue
from icarus.design.checks import design_report
from icarus.library.templates import TEMPLATES, template_operations
from icarus.projects.operations import apply_operations, empty_project


def template(name: str):
    return apply_operations(empty_project("0123456789ab", "T"), template_operations(name))


def set_number(project, obj: str, component: str, prop: str, value: float):
    operation = SetProperty(
        op="set_property",
        object=obj,
        component=component,
        property=prop,
        value=NumberValue(type="number", value=value),
    )
    return apply_operations(project, [operation])


def statuses(report) -> dict[str, str]:
    return {check.id: check.status for check in report.checks}


@pytest.mark.parametrize("name", list(TEMPLATES))
def test_every_template_passes_every_check(name):
    report, compiled = design_report(template(name))
    assert report.ok, [check.detail for check in report.checks if check.status == "fail"]
    assert compiled is not None


def test_a_motor_without_force_fails_the_actuator_check_by_name():
    project = set_number(template("walker_robot"), "thigh_left", "motor", "max_force", 0)
    report, _ = design_report(project)
    actuators = next(check for check in report.checks if check.id == "actuators")
    assert actuators.status == "fail"
    assert "Left thigh" in actuators.detail


def test_a_body_buried_under_the_ground_fails_settling_readably():
    operation = SetProperty(
        op="set_property",
        object="torso",
        component="transform",
        property="position",
        value=VectorValue(type="vector", value=(0, 0, -3)),
    )
    report, compiled = design_report(apply_operations(template("walker_robot"), [operation]))
    settles = next(check for check in report.checks if check.id == "settles")
    assert settles.status == "fail"
    assert "Torso" in settles.detail
    assert compiled is None


def test_an_invalid_structure_skips_every_physics_check():
    project = set_number(template("parking_car"), "car", "physics_body", "mass", -1)
    report, compiled = design_report(project)
    assert statuses(report) == {
        "structure": "fail",
        "compiles": "skip",
        "settles": "skip",
        "actuators": "skip",
        "sensors": "skip",
    }
    assert compiled is None


def test_the_humanoid_report_is_fast_on_cpu():
    project = template("humanoid")
    started = time.perf_counter()
    design_report(project)
    assert time.perf_counter() - started < 1.5
