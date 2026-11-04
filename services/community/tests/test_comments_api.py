ANA = "ana@example.test"
BEN = "ben@example.test"
CAL = "cal@example.test"
MOD = "mod@example.test"


def comments_url(creation: dict) -> str:
    return f"/v1/creations/{creation['id']}/comments"


def test_signed_in_people_comment_and_everyone_reads_newest_first(client, sign_in, publish):
    ana, ben = sign_in(ANA), sign_in(BEN)
    creation = publish(ana)

    assert client.post(comments_url(creation), json={"text": "Nice"}).status_code == 401
    first = client.post(comments_url(creation), json={"text": "  Works with a truck  "}, headers=ben)
    assert first.status_code == 201
    assert (first.json()["text"], first.json()["author"]["handle"], first.json()["can_delete"]) == (
        "Works with a truck",
        "ben",
        True,
    )
    client.post(comments_url(creation), json={"text": "Thanks!"}, headers=ana)

    page = client.get(comments_url(creation)).json()
    assert ([item["text"] for item in page["items"]], page["total"], page["open"]) == (
        ["Thanks!", "Works with a truck"],
        2,
        True,
    )
    assert not any(item["can_delete"] for item in page["items"])
    note = client.get("/v1/me/notifications", headers=ana).json()[0]
    assert (note["kind"], note["text"]) == ("comment", "Ben commented on Parking car")


def test_comments_are_validated(client, sign_in, publish):
    ben = sign_in(BEN)
    creation = publish(sign_in(ANA))

    assert client.post(comments_url(creation), json={"text": ""}, headers=ben).status_code == 422
    assert client.post(comments_url(creation), json={"text": "   "}, headers=ben).status_code == 422
    assert client.post(comments_url(creation), json={"text": "x" * 1001}, headers=ben).status_code == 422
    assert client.post(comments_url(creation), json={"text": "hi", "html": "<b>"}, headers=ben).status_code == 422
    assert client.get("/v1/creations/missing/comments").status_code == 404


def test_only_the_comment_author_or_a_moderator_deletes_it(client, sign_in, publish):
    ana, ben, mod = sign_in(ANA), sign_in(BEN), sign_in(MOD)
    creation = publish(ana)
    one = client.post(comments_url(creation), json={"text": "First"}, headers=ben).json()
    two = client.post(comments_url(creation), json={"text": "Second"}, headers=ben).json()

    refused = client.delete(f"{comments_url(creation)}/{one['id']}", headers=ana)
    assert (refused.status_code, refused.json()["code"]) == (403, "forbidden")
    assert [item["can_delete"] for item in client.get(comments_url(creation), headers=mod).json()["items"]] == [
        True,
        True,
    ]
    assert client.delete(f"{comments_url(creation)}/{one['id']}", headers=ben).status_code == 204
    assert client.delete(f"{comments_url(creation)}/{two['id']}", headers=mod).status_code == 204
    assert client.get(comments_url(creation)).json()["total"] == 0


def test_the_authors_privacy_setting_closes_comments(client, sign_in, publish):
    ana, ben = sign_in(ANA), sign_in(BEN)
    creation = publish(ana)
    client.post(comments_url(creation), json={"text": "Before"}, headers=ben)

    client.patch("/v1/me/privacy", json={"allow_comments": False}, headers=ana)

    refused = client.post(comments_url(creation), json={"text": "After"}, headers=ben)
    assert (refused.status_code, refused.json()["message"]) == (403, "The author turned comments off")
    page = client.get(comments_url(creation)).json()
    assert (page["open"], [item["text"] for item in page["items"]]) == (False, ["Before"])


def test_blocked_and_suspended_people_are_not_shown(client, sign_in, publish):
    ana, ben, cal, mod = sign_in(ANA), sign_in(BEN), sign_in(CAL), sign_in(MOD)
    creation = publish(ana)
    client.post(comments_url(creation), json={"text": "From Ben"}, headers=ben)
    client.post(comments_url(creation), json={"text": "From Cal"}, headers=cal)

    client.post("/v1/me/blocks", json={"handle": "ben"}, headers=cal)
    assert [item["text"] for item in client.get(comments_url(creation), headers=cal).json()["items"]] == ["From Cal"]

    spam = publish(cal, project_id="proj-2", title="Spam")
    client.post("/v1/moderation/decisions", json={"creation_id": spam["id"], "decision": "ban"}, headers=mod)
    assert [item["text"] for item in client.get(comments_url(creation)).json()["items"]] == ["From Ben"]


def test_reported_comments_reach_the_moderation_queue(client, sign_in, publish):
    ana, ben, mod = sign_in(ANA), sign_in(BEN), sign_in(MOD)
    creation = publish(ana)
    comment = client.post(comments_url(creation), json={"text": "Buy followers"}, headers=ben).json()
    report_url = f"{comments_url(creation)}/{comment['id']}/reports"

    assert client.post(report_url, json={"reason": "spam"}, headers=ben).status_code == 422
    assert client.post(report_url, json={"reason": "spam", "block_author": True}, headers=ana).status_code == 204

    queue = client.get("/v1/moderation/queue", params={"queue": "reports"}, headers=mod).json()
    assert [(item["id"], item["reason"], item["reports"]) for item in queue] == [(creation["id"], "comment: spam", 1)]
    assert client.get(comments_url(creation), headers=ana).json()["total"] == 0

    client.delete(f"{comments_url(creation)}/{comment['id']}", headers=mod)
    assert client.get("/v1/moderation/counts", headers=mod).json()["reports"] == 0


def test_comments_are_part_of_the_exported_data(client, sign_in, publish):
    ben = sign_in(BEN)
    creation = publish(sign_in(ANA))
    client.post(comments_url(creation), json={"text": "Mine"}, headers=ben)

    exported = client.get("/v1/me/export", headers=ben).json()
    assert [row["text"] for row in exported["comments"]] == ["Mine"]
