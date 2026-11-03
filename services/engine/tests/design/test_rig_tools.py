import base64

import pytest

from icarus.contracts.operations import OperationBatch, RemoveComponent, SetProperty
from icarus.contracts.properties import NumberValue
from icarus.contracts.rig import AutoRigStart
from icarus.design.compiler import compile_project
from icarus.design.rig_audit import rig_findings
from icarus.design.skin_binding import rebind, skin_weights
from icarus.design.test_poses import UnknownPose, take_pose
from icarus.projects.auto_rig import AutoRigBoard, auto_rig
from icarus.projects.rig_fixes import fix_rig, rig_check
from icarus.projects.skins import SkinStore
from icarus.projects.store import ProjectStore
from tests.model_files import humanoid_obj


@pytest.fixture
def store(tmp_path) -> ProjectStore:
    return ProjectStore(tmp_path)


def _humanoid(store: ProjectStore) -> str:
    return store.create("Body", "humanoid").project.id


def _motor_id(store: ProjectStore, project_id: str, part: str) -> tuple[str, str]:
    obj = next(o for b in store.state(project_id).project.bodies for o in b.objects if o.id.endswith(part))
    return obj.id, next(c.id for c in obj.components if c.kind == "motor")


def test_the_vault_humanoid_has_nothing_to_fix(store):
    project_id = _humanoid(store)
    check = rig_check(store.state(project_id))
    assert check.report.ok and check.findings == []
    assert [pose.id for pose in check.poses] == ["rest", "low", "high"]


def test_a_motor_too_weak_for_its_leg_is_found_and_fixed(store):
    project_id = _humanoid(store)
    thigh, motor = _motor_id(store, project_id, "thigh_left")
    weak = SetProperty(
        op="set_property",
        object=thigh,
        component=motor,
        property="max_force",
        value=NumberValue(type="number", value=5),
    )
    store.apply(project_id, OperationBatch(operations=[weak], summary="Weaken"))
    check = rig_check(store.state(project_id))
    assert any(finding.id == f"weak:{thigh}" and finding.fixable for finding in check.findings)
    result = fix_rig(store, project_id)
    assert result.revision is not None and len(result.applied) >= 1
    assert all(finding.id != f"weak:{thigh}" for finding in result.check.findings)


def test_a_legged_body_without_balance_gets_it_back(store):
    project_id = _humanoid(store)
    project = store.state(project_id).project
    root = next(obj for obj in project.bodies[0].objects if obj.parent is None)
    balance = next(c.id for c in root.components if c.kind == "balance")
    store.apply(
        project_id,
        OperationBatch(
            operations=[RemoveComponent(op="remove_component", object=root.id, component=balance)], summary="No balance"
        ),
    )
    findings = rig_findings(store.state(project_id).project, compile_project(store.state(project_id).project))
    assert [finding.id for finding in findings] == [f"balance:{root.id}"]
    fix_rig(store, project_id)
    fixed = store.state(project_id).project
    assert any(c.kind == "balance" for o in fixed.bodies[0].objects for c in o.components)


def test_poses_set_real_joints_and_report_whether_the_motors_hold_them(store):
    project_id = _humanoid(store)
    state = store.state(project_id)
    compiled = compile_project(state.project)
    rest = take_pose(state.project, compiled, state.revision.number, "rest")
    assert rest.holds and rest.joints == 12 and rest.overlaps == []
    low = take_pose(state.project, compiled, state.revision.number, "low")
    assert low.joints == 12 and low.label == "Toward the lower limits"
    assert {geom.name for geom in low.scene.geoms} >= {"head", "thigh_left"}
    with pytest.raises(UnknownPose):
        take_pose(state.project, compiled, state.revision.number, "cartwheel")


def test_an_auto_rigged_body_is_bound_and_rebinding_settles(store, tmp_path):
    project_id = store.create("Rig", "empty_world").project.id
    skins = SkinStore(tmp_path)
    board = AutoRigBoard()
    board.begin(project_id, "task", "person.obj")
    request = AutoRigStart(name="person.obj", data=base64.b64encode(humanoid_obj()).decode())
    auto_rig(store, skins, board, project_id, request, lambda: None)
    weights = skin_weights(store.state(project_id).project, skins)
    assert len(weights.bones) >= 10
    assert all(0 <= bone.coverage <= 1 and bone.vertices > 0 for bone in weights.bones)
    operations = rebind(store.state(project_id).project, skins)
    if operations:
        store.apply(project_id, OperationBatch(operations=operations, summary="Rebind"))
    assert rebind(store.state(project_id).project, skins) == []


def test_a_body_without_skins_has_no_weights(store, tmp_path):
    project_id = _humanoid(store)
    weights = skin_weights(store.state(project_id).project, SkinStore(tmp_path))
    assert weights.bones == [] and weights.body is not None
