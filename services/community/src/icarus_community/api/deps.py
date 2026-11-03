from collections.abc import Iterator
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from icarus_community.accounts import account_for
from icarus_community.auth import NotSignedIn, TokenVerifier
from icarus_community.db import Database
from icarus_community.errors import ServiceError
from icarus_community.file_store import FileStore
from icarus_community.models import User
from icarus_community.rate_limit import WriteLimiter
from icarus_community.settings import Settings


@dataclass
class Services:
    settings: Settings
    database: Database
    files: FileStore
    verifier: TokenVerifier
    limiter: WriteLimiter


def services(request: Request) -> Services:
    return request.app.state.services


def session(request: Request) -> Iterator[Session]:
    yield from services(request).database.session()


ServicesDep = Annotated[Services, Depends(services)]
SessionDep = Annotated[Session, Depends(session)]


def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


def optional_user(request: Request, db: SessionDep, deps: ServicesDep) -> User | None:
    token = _bearer(request)
    if token is None:
        return None
    try:
        identity = deps.verifier.verify(token)
    except NotSignedIn as error:
        raise ServiceError("not_signed_in", str(error)) from error
    return account_for(db, identity, deps.settings)


def current_user(user: Annotated[User | None, Depends(optional_user)]) -> User:
    if user is None:
        raise ServiceError("not_signed_in", "Sign in to do this")
    return user


def writer(request: Request, user: Annotated[User, Depends(current_user)], deps: ServicesDep) -> User:
    """A signed-in person who may write: not suspended and within the write rate."""
    if user.banned:
        raise ServiceError("banned", "This account is suspended")
    if not deps.limiter.allow(user.id):
        raise ServiceError("rate_limited", "Too many changes in a minute; try again shortly")
    return user


Viewer = Annotated[User | None, Depends(optional_user)]
SignedIn = Annotated[User, Depends(current_user)]
Writer = Annotated[User, Depends(writer)]
