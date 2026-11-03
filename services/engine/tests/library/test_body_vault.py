import mujoco
import numpy as np
import pytest
from gymnasium.utils.env_checker import check_env
from pydantic import TypeAdapter

from icarus.contracts.operations import AddBody, CreateObject, EditOperation, RemoveBody, SetTaskFamily
from icarus.design.checks import design_report
from icarus.design.compiler import compile_project
from icarus.library.body_vault import (
    VAULT_BODIES,
    UnknownVaultBody,
    body_from_vault,
    use_vault_body,
    vault_body_spec,
)
from icarus.library.catalog import library_catalog
from icarus.library.parts import Part
from icarus.library.rewards import CORE_TERMS, REWARD_TERMS, term_fits
from icarus.projects.operations import apply_operations
from icarus.projects.vault_scene import vault_body_scene, vault_project
from icarus.sim.env import ProjectEnv
from tests.sim.conftest import project_from

OPERATIONS = TypeAdapter(list[EditOperation])
REQUIRED = {"biped", "humanoid", "dog", "spider", "hexapod", "snake", "rover", "hopper"}
SETTLE_SECONDS = 2.0


def _material_colors(body_id: str, color: str | None = None) -> set[str]:
    spec = vault_body_spec(body_id, color=color)
    return {
        prop.value
        for obj in spec.objects
        for component in obj.components
        if component.kind == "material"
        for name, prop in component.properties.items()
        if name == "color" and prop.type == "color"
    }


def test_the_vault_holds_every_promised_body():
    assert set(VAULT_BODIES) >= REQUIRED
    assert {item.id for item in library_catalog().bodies} == set(VAULT_BODIES)


@pytest.mark.parametrize("body_id", list(VAULT_BODIES))
def test_vault_body_passes_every_design_check(body_id):
    report, compiled = design_report(vault_project(body_id))
    assert report.ok, [check.detail for check in report.checks if check.status == "fail"]
    statuses = {check.id: check.status for check in report.checks}
    # Every motor moving its joint and every sensor reading is checked, never skipped.
    assert statuses["actuators"] == "pass" and statuses["sensors"] == "pass"
    assert compiled is not None and compiled.model.nu >= 3


@pytest.mark.parametrize("body_id", list(VAULT_BODIES))
def test_vault_body_stands_still_and_upright_with_its_motors_at_zero(body_id):
    project = vault_project(body_id)
    model = compile_project(project).model
    data = mujoco.MjData(model)
    root = model.body(project.bodies[0].objects[0].id).id
    mujoco.mj_forward(model, data)
    start = float(data.xpos[root, 2])
    for _ in range(int(SETTLE_SECONDS / model.opt.timestep)):
        mujoco.mj_step(model, data)
    assert data.xpos[root, 2] > 0.85 * start
    assert data.xmat[root].reshape(3, 3)[2, 2] > 0.9
    assert np.abs(data.qvel).max() < 0.5


@pytest.mark.parametrize("body_id", list(VAULT_BODIES))
def test_vault_body_has_blinking_eyes_in_its_scene(body_id):
    scene = vault_body_scene(body_id)
    assert len(scene.eyes) == 1
    assert any(geom.color == VAULT_BODIES[body_id].color for geom in scene.geoms)


@pytest.mark.parametrize("body_id", list(VAULT_BODIES))
def test_vault_body_suggests_library_rewards_for_its_family(body_id):
    info = VAULT_BODIES[body_id]
    terms = {reward.term for reward in info.rewards}
    assert set(CORE_TERMS[info.family]) <= terms
    for reward in info.rewards:
        term = REWARD_TERMS[reward.term]
        assert term.weight_min <= reward.weight <= term.weight_max
        assert term_fits(reward.term, info.family)


def test_body_from_vault_adds_a_prefixed_recolored_body_where_asked():
    operations = body_from_vault("spider", at=(2, -1, 0), color="#123456", prefix="a1_")
    OPERATIONS.validate_python(OPERATIONS.dump_python(operations))
    assert isinstance(operations[0], AddBody) and operations[0].body.id == "a1_spider"
    created = [op for op in operations if isinstance(op, CreateObject)]
    assert created and all(op.target == "a1_spider" and op.object.id.startswith("a1_") for op in created)
    ids = {op.object.id for op in created}
    assert all(op.object.parent is None or op.object.parent in ids for op in created)
    spec = vault_body_spec("spider", at=(2, -1, 0), color="#123456", prefix="a1_")
    standing = vault_body_spec("spider")
    root, origin = spec.objects[0], standing.objects[0]
    position = next(c for c in root.components if c.kind == "transform").properties["position"]
    start = next(c for c in origin.components if c.kind == "transform").properties["position"]
    assert position.type == "vector" and start.type == "vector"
    assert position.value == pytest.approx((2, -1, start.value[2]))
    assert "#123456" in _material_colors("spider", "#123456")
    assert VAULT_BODIES["spider"].color not in _material_colors("spider", "#123456")


def test_a_scaled_vault_body_weighs_the_cube_and_still_passes_its_checks():
    small = compile_project(vault_project("dog")).model
    project = apply_operations(project_from("empty_world"), body_from_vault("dog", scale=0.6))
    report, compiled = design_report(project)
    assert report.ok, [check.detail for check in report.checks if check.status == "fail"]
    assert compiled is not None
    scaled = compiled.model.body_subtreemass[compiled.model.body("torso").id]
    assert scaled == pytest.approx(small.body_subtreemass[small.body("torso").id] * 0.6**3, rel=1e-3)
    with pytest.raises(ValueError):
        vault_body_spec("dog", scale=5)


def test_use_vault_body_replaces_the_agent_and_takes_its_task():
    project = project_from("parking_car")
    operations = use_vault_body(project, "hexapod", color="#aa3366")
    OPERATIONS.validate_python(OPERATIONS.dump_python(operations))
    assert [op.body for op in operations if isinstance(op, RemoveBody)] == ["car_body"]
    assert any(isinstance(op, SetTaskFamily) and op.family == "locomotion" for op in operations)
    changed = apply_operations(project, operations)
    assert [body.id for body in changed.bodies] == ["hexapod"]
    assert changed.task.family == "locomotion"
    assert {reward.term for reward in changed.task.rewards} == {r.term for r in VAULT_BODIES["hexapod"].rewards}
    report, _ = design_report(changed)
    assert report.ok, [check.detail for check in report.checks if check.status == "fail"]


def test_use_vault_body_keeps_a_task_of_the_same_family():
    project = project_from("walker_robot")
    operations = use_vault_body(project, "dog")
    changed = apply_operations(project, operations)
    assert [body.id for body in changed.bodies] == ["dog"]
    assert changed.task == project.task


def test_use_vault_body_prefixes_ids_a_world_object_already_has():
    marker = Part("torso", "Torso statue", None, {"transform": {}})
    project = apply_operations(
        project_from("empty_world"), [CreateObject(op="create_object", target="world", object=marker.spec())]
    )
    changed = apply_operations(project, use_vault_body(project, "biped"))
    assert changed.bodies[0].id == "biped_biped"
    assert all(obj.id.startswith("biped_") for obj in changed.bodies[0].objects)


def test_unknown_vault_body_is_refused():
    with pytest.raises(UnknownVaultBody):
        body_from_vault("dragon")


@pytest.mark.parametrize("body_id", list(VAULT_BODIES))
def test_vault_body_made_the_agent_trains_as_a_valid_environment(body_id):
    project = project_from("empty_world")
    env = ProjectEnv(apply_operations(project, use_vault_body(project, body_id)))
    check_env(env, skip_render_check=True)
    observation, _ = env.reset(seed=3)
    _, reward, terminated, _, _ = env.step(np.zeros(len(env.world.actuators), dtype=np.float32))
    assert np.all(np.isfinite(observation)) and np.isfinite(reward) and not terminated
