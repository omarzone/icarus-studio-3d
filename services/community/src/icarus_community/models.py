from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from icarus_community.db import Base


def now() -> datetime:
    return datetime.now(UTC)


def new_id() -> str:
    return uuid4().hex


class User(Base):
    __tablename__ = "users"

    # The `sub` claim of the identity provider's token; the service never stores passwords.
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), index=True)
    handle: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    bio: Mapped[str] = mapped_column(String(300), default="")
    location: Mapped[str] = mapped_column(String(80), default="")
    website: Mapped[str] = mapped_column(String(200), default="")
    photo_key: Mapped[str | None] = mapped_column(String(200), nullable=True)
    signature_on: Mapped[bool] = mapped_column(Boolean, default=True)
    role: Mapped[str] = mapped_column(String(16), default="member")
    banned: Mapped[bool] = mapped_column(Boolean, default=False)
    show_creations: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_remix: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_comments: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_run_finished: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_copilot_needs_ok: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_remix_or_comment: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_community_news: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    position: Mapped[int] = mapped_column(Integer)


class Page(Base):
    """The community page of one local project of one person, before and after it is published."""

    __tablename__ = "pages"
    __table_args__ = (UniqueConstraint("owner_id", "project_id"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(80), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    category_id: Mapped[str | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    allow_remix: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_brain_download: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_retrain: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_commercial: Mapped[bool] = mapped_column(Boolean, default=False)
    visibility: Mapped[str] = mapped_column(String(16), default="public")
    guidelines_accepted: Mapped[bool] = mapped_column(Boolean, default=False)
    creation_id: Mapped[str | None] = mapped_column(
        ForeignKey("creations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Creation(Base):
    __tablename__ = "creations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text, default="")
    category_id: Mapped[str] = mapped_column(ForeignKey("categories.id"), index=True)
    visibility: Mapped[str] = mapped_column(String(16), default="public")
    # "review" waits for a moderator, "public" is listed, "removed" was taken down by one.
    status: Mapped[str] = mapped_column(String(16), default="public", index=True)
    reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
    remix_of: Mapped[str | None] = mapped_column(ForeignKey("creations.id", ondelete="SET NULL"), nullable=True)
    allow_remix: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_brain_download: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_retrain: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_commercial: Mapped[bool] = mapped_column(Boolean, default=False)
    featured: Mapped[bool] = mapped_column(Boolean, default=False)
    votes: Mapped[int] = mapped_column(Integer, default=0)
    remixes: Mapped[int] = mapped_column(Integer, default=0)
    downloads: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class CreationVersion(Base):
    __tablename__ = "creation_versions"
    __table_args__ = (UniqueConstraint("creation_id", "number"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    creation_id: Mapped[str] = mapped_column(ForeignKey("creations.id", ondelete="CASCADE"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    note: Mapped[str] = mapped_column(String(200), default="")
    bundle_key: Mapped[str] = mapped_column(String(200))
    bundle_sha256: Mapped[str] = mapped_column(String(64))
    bundle_bytes: Mapped[int] = mapped_column(Integer)
    thumbnail_key: Mapped[str] = mapped_column(String(200))
    contract_version: Mapped[str] = mapped_column(String(32))
    library_version: Mapped[str] = mapped_column(String(32))
    included: Mapped[list[str]] = mapped_column(JSON, default=list)
    published_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Invite(Base):
    __tablename__ = "invites"
    __table_args__ = (UniqueConstraint("page_id", "email"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    page_id: Mapped[str] = mapped_column(ForeignKey("pages.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(320))
    role: Mapped[str] = mapped_column(String(16), default="viewer")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Vote(Base):
    __tablename__ = "votes"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    creation_id: Mapped[str] = mapped_column(ForeignKey("creations.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    creation_id: Mapped[str] = mapped_column(ForeignKey("creations.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    creation_id: Mapped[str] = mapped_column(ForeignKey("creations.id", ondelete="CASCADE"), index=True)
    # Set when the report is about one comment on the creation rather than the creation itself.
    comment_id: Mapped[str | None] = mapped_column(
        ForeignKey("comments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    reporter_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reason: Mapped[str] = mapped_column(String(16))
    details: Mapped[str] = mapped_column(String(1000), default="")
    open: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Appeal(Base):
    __tablename__ = "appeals"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    creation_id: Mapped[str] = mapped_column(ForeignKey("creations.id", ondelete="CASCADE"), index=True)
    message: Mapped[str] = mapped_column(String(1000))
    open: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Decision(Base):
    __tablename__ = "decisions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    creation_id: Mapped[str] = mapped_column(ForeignKey("creations.id", ondelete="CASCADE"), index=True)
    moderator_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decision: Mapped[str] = mapped_column(String(8))
    note: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Follow(Base):
    __tablename__ = "follows"

    follower_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    followee_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Block(Base):
    __tablename__ = "blocks"

    blocker_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    blocked_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # vote · remix · follow · invite · moderation · comment
    kind: Mapped[str] = mapped_column(String(16))
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    creation_id: Mapped[str | None] = mapped_column(ForeignKey("creations.id", ondelete="CASCADE"), nullable=True)
    text: Mapped[str] = mapped_column(String(300))
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
