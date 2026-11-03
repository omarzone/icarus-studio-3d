from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse, Response

from icarus.contracts.errors import ApiError
from icarus.contracts.motion import (
    MotionChoice,
    MotionClip,
    MotionExportFile,
    MotionExportRequest,
    MotionTracking,
    MotionTrain,
    MotionVideoUpload,
    MotionWorkspace,
)
from icarus.contracts.training import RunStatus
from icarus.design.test_poses import UnknownPose
from icarus.motion.clip_store import ClipRejected, UnknownClip
from icarus.motion.retarget import NotRetargetable
from icarus.motion.service import MotionService, NoClip, NoPoseModel, TrackingBusy
from icarus.projects.auto_rig import AutoRigRefused

router = APIRouter()


def _motion(request: Request) -> MotionService:
    return request.app.state.motion


@router.get("/projects/{project_id}/motion")
def get_motion(request: Request, project_id: str) -> MotionWorkspace:
    return _motion(request).workspace(project_id)


@router.post("/projects/{project_id}/motion/videos", status_code=201)
def add_video(request: Request, project_id: str, body: MotionVideoUpload) -> MotionClip:
    """A reference video the app sampled into frames becomes the project's clip."""
    return _motion(request).add_video(project_id, body)


@router.post("/projects/{project_id}/motion/choice")
def choose(request: Request, project_id: str, body: MotionChoice) -> MotionClip:
    return _motion(request).choose(project_id, body)


@router.get("/projects/{project_id}/motion/frames/{index}")
def frame(request: Request, project_id: str, index: int) -> Response:
    service = _motion(request)
    picture, media = service.services.clips.frame(project_id, service.clip(project_id).id, index)
    return Response(picture, media_type=media)


@router.post("/projects/{project_id}/motion/tracking", status_code=202)
def track(request: Request, project_id: str) -> MotionTracking:
    return _motion(request).track(project_id)


@router.delete("/projects/{project_id}/motion/tracking")
def cancel_tracking(request: Request, project_id: str) -> MotionTracking | None:
    return _motion(request).cancel_tracking(project_id)


@router.post("/projects/{project_id}/motion/train", status_code=201)
def train(request: Request, project_id: str, body: MotionTrain) -> RunStatus:
    return _motion(request).train(project_id, body)


@router.post("/projects/{project_id}/motion/export")
def export(request: Request, project_id: str, body: MotionExportRequest) -> MotionExportFile:
    return _motion(request).export(project_id, body)


async def _refused(request: Request, exc: Exception) -> JSONResponse:
    match exc:
        case NoPoseModel():
            body, status = ApiError(code="not_connected", message=str(exc)), 503
        case UnknownClip() | NoClip():
            body, status = ApiError(code="not_found", message=str(exc) or "There is no such clip"), 404
        case TrackingBusy():
            body, status = ApiError(code="conflict", message=str(exc)), 409
        case _:
            body, status = ApiError(code="invalid", message=str(exc)), 422
    return JSONResponse(status_code=status, content=body.model_dump())


def add_motion_errors(app: FastAPI) -> None:
    """How the body and motion workspaces' refusals answer."""
    for error in (NoPoseModel, UnknownClip, NoClip, TrackingBusy, ClipRejected, NotRetargetable, UnknownPose):
        app.add_exception_handler(error, _refused)
    app.add_exception_handler(AutoRigRefused, _refused)
