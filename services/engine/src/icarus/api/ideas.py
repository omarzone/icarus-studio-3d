from fastapi import APIRouter, Request

from icarus.contracts.copilot import BuildIdea, BuildStatus, IdeaRequest, IdeaSet, MixIdeas, TweakIdea
from icarus.copilot.architect import IdeaBook, propose_ideas
from icarus.copilot.builds import BuildBoard
from icarus.copilot.client import copilot_client
from icarus.copilot.idea_revisions import mix_ideas, tweak_idea

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


@router.post("/ideas/{idea_set_id}/ideas/{idea_id}/tweak")
def tweak(request: Request, idea_set_id: str, idea_id: str, body: TweakIdea) -> IdeaSet:
    """The set with one idea revised by the copilot from the person's words and tested again."""
    client = copilot_client(request.app.state.model_settings)
    return tweak_idea(client, _ideas(request), idea_set_id, idea_id, body.words)


@router.post("/ideas/{idea_set_id}/mix", status_code=202)
def mix_and_build(request: Request, idea_set_id: str, body: MixIdeas) -> BuildStatus:
    """Add the world of one idea with the body of another to the set, tested, and start building it."""
    _, mixed = mix_ideas(_ideas(request), idea_set_id, body.world_from, body.body_from)
    return _builds(request).start(BuildIdea(idea_set=idea_set_id, idea=mixed.id))


@router.post("/builds", status_code=202)
def start_build(request: Request, body: BuildIdea) -> BuildStatus:
    return _builds(request).start(body)


@router.get("/builds/{build_id}")
def get_build(request: Request, build_id: str) -> BuildStatus:
    return _builds(request).status(build_id)
