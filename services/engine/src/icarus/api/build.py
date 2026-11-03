from fastapi import APIRouter, HTTPException, Request

from icarus.contracts.build import (
    BuildTarget,
    ExportChoice,
    ExportPlan,
    ExportRequest,
    ExportResult,
    HardwareCheck,
    HardwareCheckRequest,
)
from icarus.contracts.project import ProjectState
from icarus.design.compile_error import CompileError
from icarus.projects.store import ProjectStore
from icarus.training.run_store import RunStore

router = APIRouter(prefix="/projects/{project_id}")


def _sources(request: Request, project_id: str) -> tuple[ProjectState, RunStore]:
    store: ProjectStore = request.app.state.store
    return store.state(project_id), request.app.state.runs


def _unbuildable(error: Exception) -> HTTPException:
    return HTTPException(status_code=422, detail=str(error))


@router.get("/build/targets")
def get_build_targets(request: Request, project_id: str) -> list[BuildTarget]:
    from icarus.hardware.build_targets import build_targets

    try:
        return build_targets(*_sources(request, project_id))
    except CompileError as error:
        raise _unbuildable(error) from error


@router.post("/export/plan")
def plan_export(request: Request, project_id: str, body: ExportChoice) -> ExportPlan:
    """The files an export would write and their sizes; nothing is written."""
    from icarus.hardware.export_bundle import export_bundle

    try:
        return export_bundle(*_sources(request, project_id), body).plan(body)
    except CompileError as error:
        raise _unbuildable(error) from error


@router.post("/export", status_code=201)
def write_export(request: Request, project_id: str, body: ExportRequest) -> ExportResult:
    """Write the export as one zip file at the path the person chose in the app's save dialog."""
    from icarus.hardware.export_bundle import ExportRefused, export_bundle, write_zip

    try:
        return write_zip(export_bundle(*_sources(request, project_id), body), body.destination)
    except (CompileError, ExportRefused) as error:
        raise _unbuildable(error) from error


@router.post("/hardware/check")
def check_hardware(request: Request, project_id: str, body: HardwareCheckRequest) -> HardwareCheck:
    """The body's joints and sensors against a hardware kit, measured with the trained brain when there is one."""
    from icarus.hardware.project_brain import hardware_check
    from icarus.library.hardware import UnknownKit

    try:
        return hardware_check(*_sources(request, project_id), body.kit, frozenset(body.skipped))
    except UnknownKit as error:
        raise HTTPException(status_code=404, detail=f"There is no hardware kit {body.kit!r}") from error
    except CompileError as error:
        raise _unbuildable(error) from error
