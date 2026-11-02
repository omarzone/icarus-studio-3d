from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

from icarus.projects.notes import MAX_NOTES_LENGTH, ProjectNotes
from icarus.projects.store import ProjectStore

router = APIRouter()


class ProjectNotesBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(max_length=MAX_NOTES_LENGTH)


def _notes(request: Request, project_id: str) -> ProjectNotes:
    store: ProjectStore = request.app.state.store
    store.state(project_id)
    return ProjectNotes(store.root)


@router.get("/projects/{project_id}/notes")
def get_notes(request: Request, project_id: str) -> ProjectNotesBody:
    return ProjectNotesBody(text=_notes(request, project_id).read(project_id))


@router.put("/projects/{project_id}/notes")
def put_notes(request: Request, project_id: str, body: ProjectNotesBody) -> ProjectNotesBody:
    _notes(request, project_id).write(project_id, body.text)
    return body
