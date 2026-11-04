from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from icarus_community.catalog import thumbnail_path
from icarus_community.errors import ServiceError, not_found
from icarus_community.models import Appeal, Creation, Decision, Report, User
from icarus_community.notifications import notify
from icarus_community.schemas.service import DecisionRequest, ModerationCounts, ModerationItem, ModerationQueue

QUEUE_LIMIT = 100


def require_moderator(user: User) -> None:
    if user.role != "moderator":
        raise ServiceError("forbidden", "Only moderators can do this")


def _open_reports(creation_id_column):  # type: ignore[no-untyped-def]
    return select(func.count()).where(Report.creation_id == creation_id_column, Report.open.is_(True)).scalar_subquery()


def _queue_query(queue: ModerationQueue):  # type: ignore[no-untyped-def]
    query = select(Creation).join(User, User.id == Creation.owner_id)
    match queue:
        case "reports":
            return query.where(_open_reports(Creation.id) > 0, Creation.status != "removed")
        case "new":
            return query.where(Creation.reviewed.is_(False), Creation.status != "removed")
        case "banned":
            return query.where(User.banned.is_(True))
        case "appeals":
            return query.where(Creation.id.in_(select(Appeal.creation_id).where(Appeal.open.is_(True))))


def counts(session: Session) -> ModerationCounts:
    def count(queue: ModerationQueue) -> int:
        return session.scalar(select(func.count()).select_from(_queue_query(queue).subquery())) or 0

    return ModerationCounts(
        reports=count("reports"), new=count("new"), banned=count("banned"), appeals=count("appeals")
    )


def _scan(creation: Creation) -> str:
    # Every bundle passed the data-only check when it was stored; the queue says so instead of inventing a score.
    if creation.status == "removed":
        return "Removed by a moderator"
    return "Bundle checked: data only" if creation.reviewed else "Bundle checked: data only · not reviewed yet"


def list_queue(session: Session, queue: ModerationQueue) -> list[ModerationItem]:
    rows = session.scalars(_queue_query(queue).order_by(Creation.created_at.desc()).limit(QUEUE_LIMIT))
    items: list[ModerationItem] = []
    for creation in rows:
        owner = session.get(User, creation.owner_id)
        reports = list(
            session.scalars(
                select(Report)
                .where(Report.creation_id == creation.id, Report.open.is_(True))
                .order_by(Report.created_at)
            )
        )
        reasons = sorted(
            {report.reason if report.comment_id is None else f"comment: {report.reason}" for report in reports}
        )
        items.append(
            ModerationItem(
                id=creation.id,
                creation=creation.title,
                author=f"@{owner.handle}" if owner else "deleted account",
                reason=", ".join(reasons) if reasons else ("New creation" if queue == "new" else queue.capitalize()),
                reports=len(reports),
                scan=_scan(creation),
                picture=thumbnail_path(creation.id),
            )
        )
    return items


def decide(session: Session, moderator: User, request: DecisionRequest) -> None:
    require_moderator(moderator)
    creation = session.get(Creation, request.creation_id)
    if creation is None:
        raise not_found("That creation")
    owner = session.get(User, creation.owner_id)
    creation.reviewed = True
    if request.decision == "keep":
        creation.status = "public"
        text = f"A moderator reviewed {creation.title} and kept it"
    else:
        creation.status = "removed"
        text = f"A moderator removed {creation.title}"
        if request.decision == "ban" and owner is not None:
            owner.banned = True
            text = f"A moderator removed {creation.title} and suspended your account"
    if request.note:
        text = f"{text}: {request.note}"
    session.execute(update(Report).where(Report.creation_id == creation.id).values(open=False))
    session.execute(update(Appeal).where(Appeal.creation_id == creation.id).values(open=False))
    session.add(
        Decision(creation_id=creation.id, moderator_id=moderator.id, decision=request.decision, note=request.note)
    )
    if owner is not None:
        notify(session, owner, "moderation", text, creation=creation)
    session.commit()


def appeal(session: Session, owner: User, creation_id: str, message: str) -> None:
    creation = session.get(Creation, creation_id)
    if creation is None or creation.owner_id != owner.id:
        raise not_found("That creation")
    if creation.status != "removed":
        raise ServiceError("invalid", "Only removed creations can be appealed")
    session.add(Appeal(creation_id=creation.id, message=message))
    session.commit()
