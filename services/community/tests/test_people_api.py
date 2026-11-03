from pathlib import Path

from tests.conftest import PNG

ANA = "ana@example.test"
BEN = "ben@example.test"


def test_the_first_sign_in_makes_an_account_with_a_free_handle(client, sign_in):
    first = client.get("/v1/me", headers=sign_in(ANA)).json()
    namesake = client.get("/v1/me", headers=sign_in("ana@other.test")).json()

    assert (first["handle"], first["name"], first["own"]) == ("ana", "Ana", True)
    assert namesake["handle"].startswith("ana_")
    assert client.get("/v1/me").status_code == 401
    assert client.get("/v1/me", headers={"authorization": "Bearer not-a-token"}).status_code == 401


def test_editing_a_profile_validates_and_refuses_a_taken_handle(client, sign_in):
    ana, ben = sign_in(ANA), sign_in(BEN)
    client.get("/v1/me", headers=ben)

    edited = client.patch(
        "/v1/me", json={"name": "Ana Maker", "handle": "anamaker", "website": "https://ana.test"}, headers=ana
    )
    assert (edited.json()["handle"], edited.json()["website"]) == ("anamaker", "https://ana.test")
    assert client.patch("/v1/me", json={"handle": "ben"}, headers=ana).status_code == 409
    assert client.patch("/v1/me", json={"handle": "No Spaces"}, headers=ana).status_code == 422
    assert client.patch("/v1/me", json={"website": "javascript:alert(1)"}, headers=ana).status_code == 422
    assert client.patch("/v1/me", json={"role": "moderator"}, headers=ana).status_code == 422


def test_a_photo_must_be_a_picture_and_is_served_back(client, sign_in, settings):
    ana = sign_in(ANA)

    assert client.put("/v1/me/photo", json={"image": "PHNjcmlwdD4="}, headers=ana).status_code == 422
    profile = client.put("/v1/me/photo", json={"image": f"data:image/png;base64,{PNG}"}, headers=ana).json()
    assert client.get(profile["photo_path"]).headers["content-type"] == "image/png"

    assert client.delete("/v1/me/photo", headers=ana).json()["photo_path"] is None
    assert list(Path(settings.files_dir).rglob("*.png")) == []


def test_following_notifies_unless_the_person_turned_it_off(client, sign_in):
    ana, ben = sign_in(ANA), sign_in(BEN)
    client.get("/v1/me", headers=ana)

    followed = client.put("/v1/profiles/ana/follow", headers=ben).json()
    assert (followed["following"], followed["stats"]["followers"]) == (True, 1)
    assert client.get("/v1/me/notifications", headers=ana).json()[0]["kind"] == "follow"

    client.delete("/v1/profiles/ana/follow", headers=ben)
    settings = client.patch("/v1/me/notification-settings", json={"remix_or_comment": False}, headers=ana).json()
    assert settings["remix_or_comment"] is False
    client.put("/v1/profiles/ana/follow", headers=ben)
    assert len(client.get("/v1/me/notifications", headers=ana).json()) == 1


def test_hiding_creations_keeps_them_off_the_profile_and_the_catalog(client, sign_in, publish):
    ana, ben = sign_in(ANA), sign_in(BEN)
    publish(ana)
    client.patch("/v1/me/pages/draft-1", json={"title": "Unfinished"}, headers=ana)

    assert [row["title"] for row in client.get("/v1/profiles/ana/creations", headers=ben).json()] == ["Parking car"]
    assert client.get("/v1/profiles/ana/creations?shelf=drafts", headers=ben).json() == []
    drafts = client.get("/v1/profiles/ana/creations?shelf=drafts", headers=ana).json()
    assert [(row["id"], row["status"]) for row in drafts] == [("draft-1", "draft")]

    client.patch("/v1/me/privacy", json={"show_creations": False}, headers=ana)
    assert client.get("/v1/profiles/ana/creations", headers=ben).json() == []
    assert client.get("/v1/creations").json()["total"] == 0


def test_blocked_people_cannot_follow_or_see_the_profile(client, sign_in):
    ana, ben = sign_in(ANA), sign_in(BEN)
    client.get("/v1/me", headers=ben)

    assert client.post("/v1/me/blocks", json={"handle": "ben"}, headers=ana).status_code == 204

    assert client.put("/v1/profiles/ana/follow", headers=ben).status_code == 403
    assert client.get("/v1/profiles/ana", headers=ben).status_code == 404


def test_my_data_can_be_downloaded_and_the_account_deleted(client, sign_in, publish, settings):
    ana, ben = sign_in(ANA), sign_in(BEN)
    creation = publish(ana)
    client.put(f"/v1/creations/{creation['id']}/vote", headers=ben)

    exported = client.get("/v1/me/export", headers=ana).json()
    assert exported["account"]["email"] == ANA
    assert [row["title"] for row in exported["creations"]] == ["Parking car"]
    assert len(exported["versions"]) == 1

    deleted = client.delete("/v1/me", headers=ana).json()
    assert deleted == {"deleted": True, "identity_deleted": False}
    assert client.get(f"/v1/creations/{creation['id']}").status_code == 404
    assert [path for path in Path(settings.files_dir).rglob("*") if path.is_file()] == []
    assert client.get("/v1/profiles/ana").status_code == 404
