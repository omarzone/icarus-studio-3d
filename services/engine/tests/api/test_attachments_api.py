import base64

import pytest
from fastapi.testclient import TestClient

from icarus.api.app import create_app

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32


def encoded(data: bytes) -> str:
    return base64.b64encode(data).decode()


@pytest.fixture
def client(tmp_path) -> TestClient:
    return TestClient(create_app(tmp_path))


@pytest.fixture
def project_id(client) -> str:
    return client.post("/projects", json={"name": "Parking", "template": "parking_car"}).json()["project"]["id"]


def upload(client: TestClient, project_id: str, **fields):
    body = {"name": "reference.png", "media_type": "image/png", "kind": "image", "data": encoded(PNG)} | fields
    return client.post(f"/projects/{project_id}/attachments", json=body)


def test_an_uploaded_image_is_served_back_with_its_media_type(client, project_id):
    created = upload(client, project_id)
    assert created.status_code == 201
    info = created.json()
    assert info["kind"] == "image" and info["name"] == "reference.png" and info["size"] == len(PNG)
    served = client.get(f"/attachments/{info['id']}/content")
    assert served.status_code == 200
    assert served.content == PNG and served.headers["content-type"] == "image/png"


def test_a_video_keeps_its_frames(client, project_id):
    video = {"name": "clip.mp4", "media_type": "video/mp4", "kind": "video", "data": encoded(b"\x00\x00\x00\x18ftyp")}
    info = upload(client, project_id, **video, frames=[encoded(JPEG), encoded(PNG)]).json()
    first, second = (client.get(f"/attachments/{info['id']}/frames/{n}") for n in (0, 1))
    assert first.content == JPEG and first.headers["content-type"] == "image/jpeg"
    assert second.content == PNG and second.headers["content-type"] == "image/png"
    assert client.get(f"/attachments/{info['id']}/frames/2").status_code == 404


@pytest.mark.parametrize(
    "fields",
    [
        {"data": "not base64!"},
        {"media_type": "application/x-msdownload", "kind": "document"},
        {"media_type": "video/mp4", "kind": "image"},
        {"media_type": "image/png", "kind": "video"},
        {"media_type": "image/svg+xml", "data": encoded(b"<svg></svg>")},
        {"media_type": "video/mp4", "kind": "video", "frames": [encoded(b"not a picture")]},
        {"frames": [encoded(JPEG)]},
    ],
    ids=["bad-base64", "executable", "video-as-image", "image-as-video", "not-raster", "bad-frame", "image-frames"],
)
def test_uploads_that_do_not_fit_their_kind_are_rejected(client, project_id, fields):
    assert upload(client, project_id, **fields).status_code == 422


def test_files_over_the_size_cap_are_rejected(client, project_id, monkeypatch):
    from icarus.copilot import attachments

    monkeypatch.setattr(attachments, "MAX_BYTES", len(PNG) - 1)
    assert upload(client, project_id).status_code == 422


def test_unknown_projects_and_attachments_are_not_found(client, project_id):
    assert upload(client, "0123456789ab").status_code == 404
    assert client.get(f"/attachments/{project_id}-0000000000/content").status_code == 404
    assert client.get("/attachments/..%2F..%2Fsecrets/content").status_code == 404


def test_a_document_is_stored_with_its_text(client, project_id):
    document = {"name": "notes.md", "media_type": "text/markdown", "kind": "document", "data": encoded(b"# Notes")}
    info = upload(client, project_id, **document).json()
    served = client.get(f"/attachments/{info['id']}/content")
    assert served.content == b"# Notes" and served.headers["content-type"].startswith("text/markdown")


def test_deleting_a_project_removes_its_attachments(client, project_id):
    info = upload(client, project_id).json()
    assert client.delete(f"/projects/{project_id}").status_code == 204
    assert client.get(f"/attachments/{info['id']}/content").status_code == 404
