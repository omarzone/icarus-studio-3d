import base64

import pytest

from icarus.contracts.rig import AutoRigStart
from icarus.projects.auto_rig import AutoRigBoard, auto_rig
from icarus.projects.mesh_files import read_mesh
from icarus.projects.rig_fit import fit_rig
from icarus.projects.skins import SkinStore
from icarus.projects.store import ProjectStore
from tests.model_files import blob_obj, humanoid_obj


def _never() -> None:
    return None


@pytest.fixture
def store(tmp_path) -> ProjectStore:
    return ProjectStore(tmp_path)


def _rig(store: ProjectStore, tmp_path, data: bytes, name: str = "person.obj"):
    project_id = store.create("Rig", "empty_world").project.id
    board = AutoRigBoard()
    board.begin(project_id, "task", name)
    request = AutoRigStart(name=name, data=base64.b64encode(data).decode())
    return project_id, board, auto_rig(store, SkinStore(tmp_path), board, project_id, request, _never)


def test_the_fit_finds_two_legs_and_arms_at_the_mesh_sides():
    fit = fit_rig(read_mesh("person.obj", humanoid_obj()))
    assert fit.humanoid
    assert fit.height == pytest.approx(1.7, abs=0.01)
    segments = {segment.name: segment for segment in fit.segments}
    # Left is +y once the mesh faces +x; the hands hang near the arms' lower end.
    assert segments["thigh_left"].start[1] > 0 > segments["thigh_right"].start[1]
    assert segments["forearm_left"].end[2] == pytest.approx(0.8, abs=0.08)
    assert abs(segments["forearm_left"].end[1]) == pytest.approx(0.25, abs=0.05)


def test_a_rigged_humanoid_stands_its_physics_tests_and_wears_its_mesh(store, tmp_path):
    project_id, _, status = _rig(store, tmp_path, humanoid_obj())
    assert status.state == "done" and status.shape == "humanoid"
    assert all(step.state == "done" for step in status.steps)
    state = store.state(project_id)
    assert state.report.ok
    body = state.project.bodies[0]
    assert body.id == status.body
    ids = {obj.id.removeprefix(f"{body.id}_") for obj in body.objects}
    assert {"pelvis", "chest", "head", "thigh_left", "shin_right", "forearm_left", "foot_right"} <= ids
    skinned = [obj for obj in body.objects if any(component.kind == "skin" for component in obj.components)]
    assert len(skinned) >= 10
    assert state.project.task.family == "locomotion"


def test_a_mesh_without_legs_becomes_one_rigid_part(store, tmp_path):
    project_id, _, status = _rig(store, tmp_path, blob_obj(), "crate.obj")
    assert status.shape == "rigid"
    body = store.state(project_id).project.bodies[0]
    assert len(body.objects) == 1


def test_a_cancelled_auto_rig_changes_nothing(store, tmp_path):
    project_id = store.create("Rig", "empty_world").project.id
    before = store.state(project_id).revision.number
    board = AutoRigBoard()
    board.begin(project_id, "task", "person.obj")
    calls = iter(range(100))

    def cancel_on_third() -> None:
        if next(calls) == 2:
            raise RuntimeError("cancelled")

    request = AutoRigStart(name="person.obj", data=base64.b64encode(humanoid_obj()).decode())
    with pytest.raises(RuntimeError):
        auto_rig(store, SkinStore(tmp_path), board, project_id, request, cancel_on_third)
    assert store.state(project_id).revision.number == before
