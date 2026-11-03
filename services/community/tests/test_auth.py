import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from jwt import PyJWKClient
from jwt.algorithms import ECAlgorithm
from pydantic import ValidationError

from icarus_community.api.app import create_app
from icarus_community.auth import NotSignedIn, TokenVerifier, issue_dev_token
from tests.conftest import make_settings

SUPABASE_URL = "https://project.supabase.test"


class StaticJwks(PyJWKClient):
    """The project's published keys, served from memory instead of the network."""

    def __init__(self, jwks: dict[str, Any]) -> None:
        super().__init__(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json")
        self._static = jwks

    def fetch_data(self) -> Any:
        return self._static


def supabase_claims(**overrides: Any) -> dict[str, Any]:
    now = datetime.now(UTC)
    claims = {
        "iss": f"{SUPABASE_URL}/auth/v1",
        "aud": "authenticated",
        "sub": "2b1e7d0c-supabase-user",
        "email": "Maker@Example.test",
        "exp": now + timedelta(minutes=5),
        "iat": now,
        "user_metadata": {"full_name": "Maker One"},
    }
    claims.update(overrides)
    return claims


@pytest.fixture
def signing_key() -> ec.EllipticCurvePrivateKey:
    return ec.generate_private_key(ec.SECP256R1())


@pytest.fixture
def verifier(tmp_path: Path, signing_key: ec.EllipticCurvePrivateKey) -> TokenVerifier:
    public = json.loads(ECAlgorithm.to_jwk(signing_key.public_key()))
    jwks = {"keys": [{**public, "kid": "key-1", "use": "sig", "alg": "ES256"}]}
    settings = make_settings(tmp_path, dev_auth=False, supabase_url=SUPABASE_URL)
    return TokenVerifier(settings, jwks=StaticJwks(jwks))


def test_supabase_tokens_are_verified_against_the_project_keys(verifier, signing_key):
    token = jwt.encode(supabase_claims(), signing_key, algorithm="ES256", headers={"kid": "key-1"})

    identity = verifier.verify(token)

    assert (identity.subject, identity.email, identity.name) == (
        "2b1e7d0c-supabase-user",
        "maker@example.test",
        "Maker One",
    )


@pytest.mark.parametrize(
    "claims",
    [
        supabase_claims(aud="anon"),
        supabase_claims(iss="https://other.supabase.test/auth/v1"),
        supabase_claims(exp=datetime.now(UTC) - timedelta(minutes=1)),
    ],
    ids=["wrong audience", "other project", "expired"],
)
def test_supabase_tokens_with_wrong_claims_are_refused(verifier, signing_key, claims):
    token = jwt.encode(claims, signing_key, algorithm="ES256", headers={"kid": "key-1"})

    with pytest.raises(NotSignedIn):
        verifier.verify(token)


def test_a_token_signed_by_another_key_is_refused(verifier):
    stranger = ec.generate_private_key(ec.SECP256R1())
    token = jwt.encode(supabase_claims(), stranger, algorithm="ES256", headers={"kid": "key-1"})

    with pytest.raises(NotSignedIn):
        verifier.verify(token)


def test_legacy_projects_verify_with_the_jwt_secret(tmp_path):
    secret = "a-project-jwt-secret-that-is-long-enough"
    settings = make_settings(tmp_path, dev_auth=False, supabase_url=SUPABASE_URL, supabase_jwt_secret=secret)
    token = jwt.encode(supabase_claims(), secret, algorithm="HS256")

    assert TokenVerifier(settings).verify(token).email == "maker@example.test"


def test_development_tokens_only_work_while_dev_auth_is_on(tmp_path):
    dev = make_settings(tmp_path)
    token, _ = issue_dev_token(dev, "dev@icarus.localhost")

    assert TokenVerifier(dev).verify(token).email == "dev@icarus.localhost"
    with pytest.raises(NotSignedIn):
        TokenVerifier(make_settings(tmp_path, dev_auth=False, supabase_url=SUPABASE_URL)).verify(token)
    with pytest.raises(PermissionError):
        issue_dev_token(make_settings(tmp_path, dev_auth=False), "dev@icarus.localhost")


def test_production_refuses_development_sign_in(tmp_path):
    with pytest.raises(ValidationError, match="DEV_AUTH is refused"):
        make_settings(tmp_path, env="production", dev_auth=True, supabase_url=SUPABASE_URL)
    with pytest.raises(ValidationError, match="needs SUPABASE_URL"):
        make_settings(tmp_path, env="production", dev_auth=False)


def test_the_dev_token_endpoint_is_gone_when_dev_auth_is_off(tmp_path):
    settings = make_settings(tmp_path, dev_auth=False, supabase_url=SUPABASE_URL)
    with TestClient(create_app(settings)) as client:
        response = client.post("/v1/dev/token", json={"email": "dev@icarus.localhost"})

    assert response.status_code == 404
