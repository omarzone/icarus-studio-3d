from fastapi import APIRouter, Request

from icarus.contracts.context_usage import ContextRequest, ContextUsage
from icarus.contracts.copilot import Conversation, SendMessage, SetAutonomy
from icarus.contracts.scene import SceneDescription
from icarus.copilot.chat import Copilot

router = APIRouter()


def _copilot(request: Request) -> Copilot:
    return request.app.state.copilot


@router.get("/projects/{project_id}/conversation")
def get_conversation(request: Request, project_id: str) -> Conversation:
    return _copilot(request).conversation(project_id)


@router.post("/projects/{project_id}/conversation/messages")
def send_message(request: Request, project_id: str, body: SendMessage) -> Conversation:
    return _copilot(request).send(project_id, body)


@router.post("/projects/{project_id}/conversation/context")
def get_context_usage(request: Request, project_id: str, body: ContextRequest) -> ContextUsage:
    """What the next message would send to the model, measured piece by piece; nothing is sent."""
    return _copilot(request).context_usage(project_id, body)


@router.post("/projects/{project_id}/conversation/autonomy")
def set_autonomy(request: Request, project_id: str, body: SetAutonomy) -> Conversation:
    return _copilot(request).set_autonomy(project_id, body.autonomy)


@router.post("/proposals/{proposal_id}/apply")
def apply_proposal(request: Request, proposal_id: str) -> Conversation:
    return _copilot(request).apply(proposal_id)


@router.post("/proposals/{proposal_id}/discard")
def discard_proposal(request: Request, proposal_id: str) -> Conversation:
    return _copilot(request).discard(proposal_id)


@router.get("/proposals/{proposal_id}/scene")
def get_proposal_scene(request: Request, proposal_id: str) -> SceneDescription:
    return _copilot(request).proposal_scene(proposal_id)
