from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, Response

from icarus.contracts.copilot import AttachmentInfo, AttachmentUpload
from icarus.copilot.attachments import CONTENT_FILE, AttachmentStore
from icarus.projects.store import ProjectStore

router = APIRouter()


def _attachments(request: Request) -> AttachmentStore:
    return request.app.state.attachments


@router.post("/projects/{project_id}/attachments", status_code=201)
def upload_attachment(request: Request, project_id: str, body: AttachmentUpload) -> AttachmentInfo:
    store: ProjectStore = request.app.state.store
    store.state(project_id)
    return _attachments(request).add(project_id, body)


@router.get("/attachments/{attachment_id}/content")
def attachment_content(request: Request, attachment_id: str) -> Response:
    attachment = _attachments(request).get(attachment_id)
    return FileResponse(attachment.folder / CONTENT_FILE, media_type=attachment.info.media_type)


@router.get("/attachments/{attachment_id}/frames/{index}")
def attachment_frame(request: Request, attachment_id: str, index: int) -> Response:
    path, media_type = _attachments(request).get(attachment_id).frame(index)
    return FileResponse(path, media_type=media_type)
