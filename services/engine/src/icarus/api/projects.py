from typing import Annotated

from fastapi import APIRouter, Query, Request, Response

from icarus.contracts.operations import OperationBatch
from icarus.contracts.project import CreateProject, DuplicateProject, ProjectState, ProjectSummary, Revision
from icarus.contracts.scene import SceneDescription
from icarus.design.compiler import compile_project
from icarus.design.scene import scene_description
from icarus.projects.store import ProjectStore
from icarus.sim.variation import copy_scenes

router = APIRouter(prefix="/projects")

MAX_PREVIEW_COPIES = 64


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
    request.app.state.attachments.forget(project_id)
    request.app.state.copilot.forget(project_id)
    return Response(status_code=204)


@router.post("/{project_id}/operations")
def apply_operations(request: Request, project_id: str, batch: OperationBatch) -> ProjectState:
    return _store(request).apply(project_id, batch)


@router.get("/{project_id}/revisions")
def list_revisions(request: Request, project_id: str) -> list[Revision]:
    return _store(request).revisions(project_id)


@router.post("/{project_id}/duplicate", status_code=201)
def duplicate_project(request: Request, project_id: str, body: DuplicateProject) -> ProjectState:
    return _store(request).duplicate(project_id, body.name)


@router.post("/{project_id}/revisions/{number}/restore")
def restore_revision(request: Request, project_id: str, number: int) -> ProjectState:
    return _store(request).restore(project_id, number)


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


@router.get("/{project_id}/copies")
def get_copies(
    request: Request, project_id: str, count: Annotated[int | None, Query(ge=1, le=MAX_PREVIEW_COPIES)] = None
) -> list[SceneDescription]:
    """Each training copy's first episode, seeded as training seeds it: brain seed + copy index."""
    state = _store(request).state(project_id)
    brain = state.project.brain
    copies = count or min(brain.copies, MAX_PREVIEW_COPIES)
    seeds = [brain.seed + index for index in range(copies)]
    return copy_scenes(state.project, state.revision.number, seeds)
