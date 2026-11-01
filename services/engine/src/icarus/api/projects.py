from fastapi import APIRouter, Request, Response

from icarus.contracts.operations import OperationBatch
from icarus.contracts.project import CreateProject, ProjectState, ProjectSummary, Revision
from icarus.contracts.scene import SceneDescription
from icarus.design.compiler import compile_project
from icarus.design.scene import scene_description
from icarus.projects.store import ProjectStore

router = APIRouter(prefix="/projects")


def _store(request: Request) -> ProjectStore:
    return request.app.state.store


@router.get("")
def list_projects(request: Request) -> list[ProjectSummary]:
    return _store(request).list_projects()


@router.post("", status_code=201)
def create_project(request: Request, body: CreateProject) -> ProjectState:
    return _store(request).create(body.name, body.template)


@router.get("/{project_id}")
def get_project(request: Request, project_id: str) -> ProjectState:
    return _store(request).state(project_id)


@router.delete("/{project_id}", status_code=204)
def delete_project(request: Request, project_id: str) -> Response:
    _store(request).delete(project_id)
    return Response(status_code=204)


@router.post("/{project_id}/operations")
def apply_operations(request: Request, project_id: str, batch: OperationBatch) -> ProjectState:
    return _store(request).apply(project_id, batch)


@router.get("/{project_id}/revisions")
def list_revisions(request: Request, project_id: str) -> list[Revision]:
    return _store(request).revisions(project_id)


@router.post("/{project_id}/undo")
def undo(request: Request, project_id: str) -> ProjectState:
    return _store(request).undo(project_id)


@router.post("/{project_id}/redo")
def redo(request: Request, project_id: str) -> ProjectState:
    return _store(request).redo(project_id)


@router.get("/{project_id}/scene")
def get_scene(request: Request, project_id: str) -> SceneDescription:
    state = _store(request).state(project_id)
    return scene_description(compile_project(state.project), state.revision.number)
