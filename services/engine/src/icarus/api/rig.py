from fastapi import APIRouter, HTTPException, Request

from icarus.contracts.operations import OperationBatch
from icarus.contracts.rig import (
    AutoRigStart,
    AutoRigStatus,
    PoseRequest,
    PoseResult,
    RigCheck,
    RigFixResult,
    SkinWeights,
)
from icarus.design.compiler import compile_project
from icarus.design.skin_binding import rebind, skin_weights
from icarus.design.test_poses import CLIP_POSE, take_pose
from icarus.motion.retarget import reference_pose
from icarus.projects.auto_rig import AutoRigBoard, auto_rig
from icarus.projects.rig_fixes import fix_rig, rig_check
from icarus.projects.skins import SkinStore
from icarus.projects.store import ProjectStore
from icarus.tasks import TaskContext, TaskRegistry

router = APIRouter()


def _store(request: Request) -> ProjectStore:
    return request.app.state.store


def _board(request: Request) -> AutoRigBoard:
    return request.app.state.auto_rigs


@router.post("/projects/{project_id}/auto-rig", status_code=202)
def start_auto_rig(request: Request, project_id: str, body: AutoRigStart) -> AutoRigStatus:
    """Turn a mesh into the project's body in the background; its steps are read with GET."""
    store, board, skins = _store(request), _board(request), request.app.state.skins
    tasks: TaskRegistry = request.app.state.tasks
    store.state(project_id)

    def work(context: TaskContext) -> None:
        try:
            auto_rig(store, skins, board, project_id, body, context.token.check)
        except Exception as error:
            board.update(project_id, state="stopped" if context.token.cancelled else "failed", message=str(error))
            raise

    # On the board before the work starts, so its first step is never written over.
    board.begin(project_id, "", body.name)
    task = tasks.start("auto_rig", f"Auto-rig {body.name}", work, project_id)
    board.update(project_id, task_id=task.id)
    status = board.get(project_id)
    assert status is not None
    return status


@router.get("/projects/{project_id}/auto-rig")
def get_auto_rig(request: Request, project_id: str) -> AutoRigStatus:
    _store(request).state(project_id)
    status = _board(request).get(project_id)
    if status is None:
        raise HTTPException(status_code=404, detail="No auto-rig has run for this project")
    return status


@router.delete("/projects/{project_id}/auto-rig")
def cancel_auto_rig(request: Request, project_id: str) -> AutoRigStatus:
    status = get_auto_rig(request, project_id)
    if status.state == "running":
        request.app.state.tasks.cancel(status.task_id)
    return status


@router.get("/projects/{project_id}/rig-check")
def get_rig_check(request: Request, project_id: str) -> RigCheck:
    return rig_check(_store(request).state(project_id))


@router.post("/projects/{project_id}/rig-check/fix")
def fix_rig_problems(request: Request, project_id: str) -> RigFixResult:
    return fix_rig(_store(request), project_id)


@router.post("/projects/{project_id}/poses")
def apply_pose(request: Request, project_id: str, body: PoseRequest) -> PoseResult:
    """Take a test pose in MuJoCo; the project never changes."""
    state = _store(request).state(project_id)
    compiled = compile_project(state.project)
    angles = reference_pose(state.project, compiled) if body.pose == CLIP_POSE else None
    return take_pose(state.project, compiled, state.revision.number, body.pose, angles, body.body)


@router.get("/projects/{project_id}/skin-weights")
def get_skin_weights(request: Request, project_id: str) -> SkinWeights:
    skins: SkinStore = request.app.state.skins
    return skin_weights(_store(request).state(project_id).project, skins)


@router.post("/projects/{project_id}/skin-weights/rebind")
def rebind_skin(request: Request, project_id: str) -> SkinWeights:
    """Give every triangle of the body's skin to the part it is nearest to, as one revision."""
    store, skins = _store(request), request.app.state.skins
    operations = rebind(store.state(project_id).project, skins)
    if operations:
        store.apply(project_id, OperationBatch(operations=operations, summary="Rebound the skin to the nearest parts"))
    return skin_weights(store.state(project_id).project, skins)
