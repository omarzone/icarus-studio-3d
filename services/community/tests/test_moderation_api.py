from fastapi.testclient import TestClient

from icarus_community.api.app import create_app
from tests.conftest import PNG, make_settings, project_bundle

MOD = "mod@example.test"
ANA = "ana@example.test"
BEN = "ben@example.test"


def test_only_moderators_see_the_queues(client, sign_in):
    assert client.get("/v1/moderation/counts", headers=sign_in(ANA)).status_code == 403
    assert client.get("/v1/me", headers=sign_in(MOD)).json()["role"] == "moderator"
    assert client.get("/v1/moderation/counts", headers=sign_in(MOD)).json() == {
        "reports": 0,
        "new": 0,
        "banned": 0,
        "appeals": 0,
    }


def test_each_queued_report_carries_the_creation_picture(client, sign_in, publish):
    mod, ana, ben = sign_in(MOD), sign_in(ANA), sign_in(BEN)
    creation = publish(ana)
    client.post(f"/v1/creations/{creation['id']}/reports", json={"reason": "spam", "details": ""}, headers=ben)

    item = client.get("/v1/moderation/queue", params={"queue": "reports"}, headers=mod).json()[0]

    assert item["picture"] == creation["thumbnail_path"]
    assert client.get(item["picture"], headers=mod).status_code == 200


def test_reports_are_decided_and_the_author_hears_the_result(client, sign_in, publish):
    mod, ana, ben = sign_in(MOD), sign_in(ANA), sign_in(BEN)
    creation = publish(ana)
    client.post(f"/v1/creations/{creation['id']}/reports", json={"reason": "stolen", "details": "mine"}, headers=ben)

    queue = client.get("/v1/moderation/queue", params={"queue": "reports"}, headers=mod).json()
    assert [(item["id"], item["reason"], item["reports"]) for item in queue] == [(creation["id"], "stolen", 1)]

    client.post("/v1/moderation/decisions", json={"creation_id": creation["id"], "decision": "remove"}, headers=mod)
    assert client.get(f"/v1/creations/{creation['id']}").status_code == 404
    assert client.get("/v1/moderation/counts", headers=mod).json()["reports"] == 0
    note = client.get("/v1/me/notifications", headers=ana).json()[0]
    assert (note["kind"], note["text"]) == ("moderation", "A moderator removed Parking car")

    client.post(f"/v1/creations/{creation['id']}/appeals", json={"message": "It is my own work"}, headers=ana)
    assert client.get("/v1/moderation/counts", headers=mod).json()["appeals"] == 1
    client.post("/v1/moderation/decisions", json={"creation_id": creation["id"], "decision": "keep"}, headers=mod)
    assert client.get(f"/v1/creations/{creation['id']}").status_code == 200


def test_a_ban_suspends_the_author(client, sign_in, publish):
    mod, ana = sign_in(MOD), sign_in(ANA)
    creation = publish(ana)

    client.post("/v1/moderation/decisions", json={"creation_id": creation["id"], "decision": "ban"}, headers=mod)

    assert client.get("/v1/moderation/counts", headers=mod).json()["banned"] == 1
    refused = client.patch("/v1/me/pages/proj-2", json={"title": "Another"}, headers=ana)
    assert (refused.status_code, refused.json()["code"]) == (403, "banned")
    assert client.get("/v1/me/export", headers=ana).status_code == 200


def test_new_creations_wait_for_review_when_moderation_is_required(tmp_path, sign_in, prepared):
    settings = prepared(make_settings(tmp_path, moderation_required=True))
    with TestClient(create_app(settings)) as client:
        ana, mod = sign_in(ANA), sign_in(MOD)
        client.patch(
            "/v1/me/pages/p", json={"title": "Car", "category": "cars", "guidelines_accepted": True}, headers=ana
        )
        created = client.post(
            "/v1/creations", json={"project_id": "p", "bundle": project_bundle(), "thumbnail": PNG}, headers=ana
        ).json()
        assert created["status"] == "review"
        assert client.get("/v1/creations").json()["total"] == 0
        assert [item["id"] for item in client.get("/v1/moderation/queue?queue=new", headers=mod).json()] == [
            created["id"]
        ]

        client.post("/v1/moderation/decisions", json={"creation_id": created["id"], "decision": "keep"}, headers=mod)
        assert client.get("/v1/creations").json()["total"] == 1
        assert client.get("/v1/me/pages/p", headers=ana).json()["status"] == "public"
