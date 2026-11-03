from fastapi import APIRouter, Response

from icarus_community import moderation
from icarus_community.api.deps import SessionDep, SignedIn, Writer
from icarus_community.schemas.service import DecisionRequest, ModerationCounts, ModerationItem, ModerationQueue

router = APIRouter(prefix="/v1/moderation")


@router.get("/counts")
def counts(db: SessionDep, user: SignedIn) -> ModerationCounts:
    moderation.require_moderator(user)
    return moderation.counts(db)


@router.get("/queue")
def queue(db: SessionDep, user: SignedIn, queue: ModerationQueue = "reports") -> list[ModerationItem]:
    moderation.require_moderator(user)
    return moderation.list_queue(db, queue)


@router.post("/decisions", status_code=204)
def decide(db: SessionDep, user: Writer, body: DecisionRequest) -> Response:
    moderation.decide(db, user, body)
    return Response(status_code=204)
