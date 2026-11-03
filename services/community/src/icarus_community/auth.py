import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from jwt import PyJWKClient
from jwt.types import Options

from icarus_community.settings import Settings

DEV_ISSUER = "icarus-community-dev"
DEV_TOKEN_LIFETIME = timedelta(hours=1)
ASYMMETRIC_ALGORITHMS = ["ES256", "RS256", "EdDSA"]


class NotSignedIn(Exception):
    pass


@dataclass(frozen=True)
class Identity:
    """Who a verified token belongs to; the identity provider owns passwords, the service only reads its claims."""

    subject: str
    email: str
    name: str | None


class TokenVerifier:
    """Checks Supabase-issued tokens (JWKS or the project's JWT secret) and, in development only, the service's own."""

    def __init__(self, settings: Settings, jwks: PyJWKClient | None = None) -> None:
        self._settings = settings
        self._jwks = jwks
        if self._jwks is None and settings.supabase_url and not settings.supabase_jwt_secret:
            url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
            self._jwks = PyJWKClient(url, cache_keys=True, lifespan=600)

    def verify(self, token: str) -> Identity:
        try:
            unverified = jwt.decode(token, options={"verify_signature": False})
        except jwt.PyJWTError as error:
            raise NotSignedIn("The sign-in token cannot be read") from error
        dev = unverified.get("iss") == DEV_ISSUER
        claims = self._verify_dev(token) if dev else self._verify_supabase(token)
        subject = claims.get("sub")
        email = claims.get("email")
        if not isinstance(subject, str) or not subject or not isinstance(email, str) or not email:
            raise NotSignedIn("The sign-in token has no account and email")
        metadata = claims.get("user_metadata")
        name = metadata.get("full_name") or metadata.get("name") if isinstance(metadata, dict) else None
        return Identity(subject=subject, email=email.lower(), name=name if isinstance(name, str) else None)

    def _verify_dev(self, token: str) -> dict[str, Any]:
        if not self._settings.dev_auth:
            raise NotSignedIn("Development sign-in is off on this server")
        try:
            return jwt.decode(
                token,
                self._settings.dev_jwt_secret,
                algorithms=["HS256"],
                audience=self._settings.supabase_audience,
                issuer=DEV_ISSUER,
            )
        except jwt.PyJWTError as error:
            raise NotSignedIn(f"The sign-in token is not valid: {error}") from error

    def _verify_supabase(self, token: str) -> dict[str, Any]:
        settings = self._settings
        issuer = f"{settings.supabase_url.rstrip('/')}/auth/v1" if settings.supabase_url else None
        options: Options = {"require": ["exp", "sub"], "verify_iss": issuer is not None}
        try:
            if settings.supabase_jwt_secret:
                return jwt.decode(
                    token,
                    settings.supabase_jwt_secret,
                    algorithms=["HS256"],
                    audience=settings.supabase_audience,
                    issuer=issuer,
                    options=options,
                )
            if self._jwks is None:
                raise NotSignedIn("This server is not connected to Supabase")
            key = self._jwks.get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                key.key,
                algorithms=ASYMMETRIC_ALGORITHMS,
                audience=settings.supabase_audience,
                issuer=issuer,
                options=options,
            )
        except jwt.PyJWTError as error:
            raise NotSignedIn(f"The sign-in token is not valid: {error}") from error


def issue_dev_token(settings: Settings, email: str, name: str | None = None) -> tuple[str, int]:
    """A token for local development only; refused unless DEV_AUTH is on, which production settings refuse."""
    if not settings.dev_auth or settings.env == "production":
        raise PermissionError("Development sign-in is off on this server")
    issued = datetime.now(UTC)
    claims: dict[str, Any] = {
        "iss": DEV_ISSUER,
        "aud": settings.supabase_audience,
        "sub": f"dev-{hashlib.sha256(email.lower().encode()).hexdigest()[:32]}",
        "email": email.lower(),
        "iat": issued,
        "exp": issued + DEV_TOKEN_LIFETIME,
        "user_metadata": {"full_name": name} if name else {},
    }
    return jwt.encode(claims, settings.dev_jwt_secret, algorithm="HS256"), int(DEV_TOKEN_LIFETIME.total_seconds())
