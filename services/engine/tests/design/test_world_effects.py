import math

import mujoco
import numpy as np
import pytest

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.operations import CreateObject
from icarus.design.checks import design_report
from icarus.design.compiler import compile_project
from icarus.design.surfaces import SURFACE_FRICTION
from icarus.library.components import SURFACE_HINT, SURFACES
from icarus.library.templates import Part, solid
from icarus.projects.operations import apply_operations
from icarus.sim.model_state import build_world, touching
from tests.design.test_compiler import part, project_of
from tests.sim.conftest import project_from

GROUND = part(
    "ground",
    None,
    transform={},
    mesh={"shape": {"type": "list", "value": "plane"}, "size": {"type": "vector", "value": [100, 100, 0.1]}},
    physics_body={"mode": {"type": "choice", "value": "static"}},
    surface={},
)


def zone(effect: str, position: tuple[float, float, float], size: tuple[float, float, float]) -> ObjectSpec:
    return part(
        "area",
        None,
        transform={"position": {"type": "vector", "value": list(position)}},
        zone={"effect": {"type": "choice", "value": effect}, "size": {"type": "vector", "value": list(size)}},
    )


def travelled(objects: list[ObjectSpec], mover: str, speed: float, seconds: float) -> float:
    """How far a movable object gets along x after being launched at `speed` once it has settled."""
    model = compile_project(project_of(*objects)).model
    data = mujoco.MjData(model)
    for _ in range(100):
        mujoco.mj_step(model, data)
    body = model.body(mover).id
    dof = int(model.jnt_dofadr[int(model.body_jntadr[body])])
    start = float(data.xpos[body, 0])
    data.qvel[dof] = speed
    for _ in range(int(seconds / model.opt.timestep)):
        mujoco.mj_step(model, data)
    return float(data.xpos[body, 0]) - start


def mover(shape: str, size: float, mass: float, x: float) -> ObjectSpec:
    return part(
        "mover",
        None,
        transform={"position": {"type": "vector", "value": [x, 0, size / 2 + 0.01]}},
        mesh={"shape": {"type": "list", "value": shape}, "size": {"type": "vector", "value": [size, size, size]}},
        physics_body={"mass": {"type": "number", "value": mass}},
        collider={},
    )


def test_every_surface_has_a_friction_and_the_new_ones_sit_between_ice_and_asphalt():
    assert set(SURFACE_FRICTION) == set(SURFACES)
    friction = SURFACE_FRICTION
    assert friction["ice"] < friction["snow"] < friction["grass"]
    assert friction["wood"] < friction["concrete"] < friction["asphalt"]
    assert all(f"{kind} {value:g} " in SURFACE_HINT for kind, value in friction.items())


def test_a_snow_material_compiles_to_snow_friction():
    snowy = part("snowy", None, transform={}, mesh={}, material={"surface": {"type": "list", "value": "snow"}})
    model = compile_project(project_of(snowy)).model
    assert model.geom("snowy").friction[0] == pytest.approx(SURFACE_FRICTION["snow"])


def test_a_zone_without_an_effect_adds_nothing_to_the_physics():
    model = compile_project(project_of(GROUND, zone("none", (2, 0, 0), (3, 3, 1)))).model
    assert mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, "area:patch") == -1


def test_a_box_slides_much_further_across_a_slippery_zone():
    box = mover("box", 0.2, 2, 1.0)
    plain = travelled([GROUND, box], "mover", 2.0, 1.5)
    slippery = travelled([GROUND, zone("slippery", (2, 0, 0), (3, 3, 1)), box], "mover", 2.0, 1.5)
    assert plain < 0.5 and slippery > 5 * plain


def test_a_ball_rolls_much_shorter_across_a_slow_zone():
    ball = mover("sphere", 0.3, 0.5, 0.0)
    plain = travelled([GROUND, ball], "mover", 2.0, 2.0)
    slow = travelled([GROUND, zone("slow", (4, 0, 0), (12, 3, 1)), ball], "mover", 2.0, 2.0)
    assert plain > 2.0 and slow < 0.5 * plain


def test_a_car_parked_on_a_slippery_zone_passes_its_design_tests_and_is_not_colliding():
    project = project_from("parking_car")
    patch = zone("slippery", (0, 0, 0), (8, 6, 1))
    project = apply_operations(project, [CreateObject(op="create_object", target="world", object=patch)])
    report, _ = design_report(project)
    assert report.ok, report.checks
    world = build_world(project)
    for _ in range(250):
        mujoco.mj_step(world.model, world.data)
    assert touching(world) == frozenset()


def three_wheeler() -> list[ObjectSpec]:
    """A cart on two driven rear wheels and a front caster ball that spins freely on every axis."""
    parts: list[Part] = [solid("cart", "Cart", None, (0, 0, 0.1), "box", (0.6, 0.4, 0.08), 5, "#4f7cac")]
    for side, y in (("left", 0.25), ("right", -0.25)):
        joint = {"kind": "hinge", "axis": (0, 0, 1), "limits": (-180, 180), "damping": 0.05}
        extra = {"joint": joint, "motor": {"kind": "torque", "max_force": 0.5}, "collider": {"friction": 1.2}}
        wheel = solid(f"wheel_{side}", side, "cart", (-0.2, y, 0), "cylinder", (0.2, 0.2, 0.05), 0.5, "#1f2023")
        wheel.components |= extra
        wheel.components["transform"]["rotation"] = (-90, 0, 0)
        parts.append(wheel)
    caster = solid("caster", "Caster", "cart", (0.22, 0, 0), "sphere", (0.2, 0.2, 0.2), 0.3, "#1f2023")
    caster.components["joint"] = {"kind": "ball", "limits": (-180, 180), "damping": 0}
    parts.append(caster)
    return [item.spec() for item in parts]


def test_a_caster_ball_joint_spins_without_limits():
    model = compile_project(project_of(GROUND, *three_wheeler())).model
    joint = model.joint("caster:joint")
    assert int(joint.type[0]) == int(mujoco.mjtJoint.mjJNT_BALL)
    assert not bool(model.jnt_limited[joint.id])


def test_a_three_wheeler_on_a_caster_drives_straight():
    project = project_of(GROUND, *three_wheeler())
    model = compile_project(project).model
    data = mujoco.MjData(model)
    for _ in range(int(3.0 / model.opt.timestep)):
        data.ctrl[:] = 1.0
        mujoco.mj_step(model, data)
    cart = model.body("cart").id
    x, y = float(data.xpos[cart, 0]), float(data.xpos[cart, 1])
    heading = math.degrees(math.atan2(data.xmat[cart][3], data.xmat[cart][0]))
    assert x > 1.0 and abs(y) < 0.1 * x and abs(heading) < 10
    assert np.all(np.isfinite(data.qpos))
