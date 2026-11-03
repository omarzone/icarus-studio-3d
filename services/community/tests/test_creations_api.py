from tests.conftest import PNG, project_bundle

ANA = "ana@example.test"
BEN = "ben@example.test"


def test_publishing_needs_a_ready_page_and_a_data_only_bundle(client, sign_in):
    ana = sign_in(ANA)
    body = {"project_id": "proj-1", "bundle": project_bundle(), "thumbnail": PNG}

    refused = client.post("/v1/creations", json=body, headers=ana)
    assert refused.status_code == 422
    assert "guidelines" in refused.json()["message"]

    client.patch(
        "/v1/me/pages/proj-1", json={"title": "Car", "category": "cars", "guidelines_accepted": True}, headers=ana
    )
    with_code = {**body, "bundle": {**project_bundle(), "project": {**project_bundle()["project"], "hook": "x"}}}
    assert client.post("/v1/creations", json=with_code, headers=ana).json()["code"] == "invalid"
    not_a_picture = {**body, "thumbnail": "aGVsbG8="}
    assert "PNG, JPEG or WebP" in client.post("/v1/creations", json=not_a_picture, headers=ana).json()["message"]
    assert client.post("/v1/creations", json=body).status_code == 401


def test_a_published_creation_is_listed_found_and_versioned(client, sign_in, publish):
    ana = sign_in(ANA)
    created = publish(ana, title="Parking car")
    publish(ana, project_id="proj-2", title="Walking spider")

    page = client.get("/v1/me/pages/proj-1", headers=ana).json()
    assert (page["status"], page["creation_id"]) == ("public", created["id"])
    listed = client.get("/v1/creations", params={"sort": "recent"}).json()
    assert [item["title"] for item in listed["items"]] == ["Walking spider", "Parking car"]
    assert client.get("/v1/creations", params={"q": "spider"}).json()["total"] == 1
    assert client.get("/v1/creations", params={"category": "worlds"}).json()["total"] == 0

    again = client.post(
        "/v1/creations",
        json={"project_id": "proj-1", "bundle": project_bundle(), "thumbnail": PNG, "note": "Faster"},
        headers=ana,
    ).json()
    assert again["id"] == created["id"]
    assert [version["number"] for version in again["versions"]] == [2, 1]
    thumbnail = client.get(f"/v1/creations/{created['id']}/thumbnail")
    assert thumbnail.headers["content-type"] == "image/png"
    bundle = client.get(f"/v1/creations/{created['id']}/bundle").json()
    assert bundle["project"]["name"] == "Parking car"
    assert client.get(f"/v1/creations/{created['id']}").json()["downloads"] == 1


def test_votes_toggle_and_notify_the_author(client, sign_in, publish):
    ana, ben = sign_in(ANA), sign_in(BEN)
    creation = publish(ana)

    voted = client.put(f"/v1/creations/{creation['id']}/vote", headers=ben).json()
    assert (voted["votes"], voted["voted"]) == (1, True)
    assert client.put(f"/v1/creations/{creation['id']}/vote", headers=ben).json()["votes"] == 1
    assert client.delete(f"/v1/creations/{creation['id']}/vote", headers=ben).json()["votes"] == 0
    assert client.put(f"/v1/creations/{creation['id']}/vote", headers=ana).status_code == 422

    notes = client.get("/v1/me/notifications", headers=ana).json()
    assert [(note["kind"], note["actor"]["handle"]) for note in notes] == [("vote", "ben")]
    client.post("/v1/me/notifications/read", headers=ana)
    assert all(note["read"] for note in client.get("/v1/me/notifications", headers=ana).json())


def test_remixes_keep_lineage_and_respect_the_authors_permission(client, sign_in, publish):
    ana, ben = sign_in(ANA), sign_in(BEN)
    original = publish(ana)

    remix = publish(ben, project_id="ben-1", title="Parking car, faster", remix_of=original["id"])
    assert remix["remix_of"] == {"id": original["id"], "title": "Parking car"}
    assert client.get(f"/v1/creations/{original['id']}").json()["remixes"] == 1
    assert client.get("/v1/me/notifications", headers=ana).json()[0]["kind"] == "remix"

    client.patch("/v1/me/privacy", json={"allow_remix": False}, headers=ana)
    client.patch(
        "/v1/me/pages/ben-2", json={"title": "Again", "category": "cars", "guidelines_accepted": True}, headers=ben
    )
    refused = client.post(
        "/v1/creations",
        json={"project_id": "ben-2", "bundle": project_bundle(remix_of=original["id"]), "thumbnail": PNG},
        headers=ben,
    )
    assert refused.status_code == 403


def test_visibility_and_invites_decide_who_can_open_a_creation(client, sign_in, publish):
    ana, ben, cat = sign_in(ANA), sign_in(BEN), sign_in("cat@example.test")
    creation = publish(ana)
    url = f"/v1/creations/{creation['id']}"

    client.put("/v1/me/pages/proj-1/share/visibility", json={"visibility": "unlisted"}, headers=ana)
    assert client.get(url).status_code == 200
    assert client.get("/v1/creations").json()["total"] == 0

    client.get("/v1/me", headers=ben)
    share = client.post("/v1/me/pages/proj-1/share/invites", json={"email": BEN}, headers=ana).json()
    client.put("/v1/me/pages/proj-1/share/visibility", json={"visibility": "invited"}, headers=ana)
    assert [person["role"] for person in share["people"]] == ["owner", "viewer"]
    assert client.get(url, headers=ben).status_code == 200
    assert client.get(url, headers=cat).status_code == 404
    assert client.get("/v1/me/notifications", headers=ben).json()[0]["kind"] == "invite"

    invite_id = share["people"][1]["id"]
    editor = client.put(f"/v1/me/pages/proj-1/share/invites/{invite_id}", json={"role": "editor"}, headers=ana).json()
    assert editor["people"][1]["role"] == "editor"
    version = client.post(
        "/v1/creations",
        json={"project_id": "x", "creation_id": creation["id"], "bundle": project_bundle(), "thumbnail": PNG},
        headers=ben,
    )
    assert version.status_code == 201
    assert len(version.json()["versions"]) == 2

    client.put("/v1/me/pages/proj-1/share/visibility", json={"visibility": "private"}, headers=ana)
    assert client.get(url, headers=ben).status_code == 404


def test_reporting_with_block_hides_the_author_from_the_reporter(client, sign_in, publish):
    ana, ben = sign_in(ANA), sign_in(BEN)
    creation = publish(ana)

    response = client.post(
        f"/v1/creations/{creation['id']}/reports", json={"reason": "spam", "block_author": True}, headers=ben
    )

    assert response.status_code == 204
    assert client.get("/v1/creations", headers=ben).json()["total"] == 0
    assert client.get("/v1/creations").json()["total"] == 1
    assert [person["handle"] for person in client.get("/v1/me/privacy", headers=ben).json()["blocked"]] == ["ana"]
    unblocked = client.delete("/v1/me/blocks/ana", headers=ben).json()
    assert unblocked["blocked"] == []
    assert (
        client.post(f"/v1/creations/{creation['id']}/reports", json={"reason": "virus"}, headers=ben).status_code == 422
    )
