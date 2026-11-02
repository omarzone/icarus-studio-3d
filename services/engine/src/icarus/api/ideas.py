from fastapi import APIRouter, Request

from icarus.contracts.copilot import BuildIdea, BuildStatus, IdeaRequest, IdeaSet
from icarus.copilot.architect import IdeaBook, propose_ideas
from icarus.copilot.builds import BuildBoard
from icarus.copilot.client import copilot_client

router = APIRouter()


def _ideas(request: Request) -> IdeaBook:
    return request.app.state.ideas


def _builds(request: Request) -> BuildBoard:
    return request.app.state.builds


@router.post("/ideas")
def create_ideas(request: Request, body: IdeaRequest) -> IdeaSet:
    idea_set, drafts = propose_ideas(copilot_client(request.app.state.model_settings), body.prompt)
    _ideas(request).add(idea_set, drafts)
    return idea_set


@router.get("/ideas/{idea_set_id}")
def get_ideas(request: Request, idea_set_id: str) -> IdeaSet:
    return _ideas(request).get(idea_set_id)[0]


@router.post("/builds", status_code=202)
def start_build(request: Request, body: BuildIdea) -> BuildStatus:
    return _builds(request).start(body)


@router.get("/builds/{build_id}")
def get_build(request: Request, build_id: str) -> BuildStatus:
    return _builds(request).status(build_id)
