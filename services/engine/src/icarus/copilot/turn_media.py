import base64
from dataclasses import dataclass, field

from icarus.contracts.copilot import AttachmentInfo, SendMessage
from icarus.copilot.attachments import Attachment, AttachmentStore
from icarus.copilot.client import UserContent
from icarus.projects.skin_files import SkinRejected, read_skin
from icarus.projects.skins import skin_id

MAX_TURN_IMAGES = 8
# Characters of document text one message may carry, shared by all its documents.
DOCUMENT_BUDGET = 24_000
VIEW_LABEL = "a render of the current scene, taken by the app"


def _data_url(media_type: str, data: bytes) -> str:
    return f"data:{media_type};base64,{base64.b64encode(data).decode()}"


@dataclass
class TurnMedia:
    """What a message carries besides its words: pictures for the model to see and document text to read."""

    infos: list[AttachmentInfo] = field(default_factory=list)
    pictures: list[str] = field(default_factory=list)
    # Document text exactly as the model reads it, so numbers in it back the answer.
    documents: list[str] = field(default_factory=list)
    lines: list[str] = field(default_factory=list)
    left_out: int = 0

    def _picture(self, label: str, media_type: str, data: bytes) -> None:
        if len(self.pictures) >= MAX_TURN_IMAGES:
            self.left_out += 1
            return
        self.pictures.append(_data_url(media_type, data))
        self.lines.append(f"Picture {len(self.pictures)}: {label}")

    def _document(self, attachment: Attachment) -> None:
        name, text = attachment.info.name, attachment.text()
        if not text:
            self.lines.append(f"Document {name}: it has no readable text, so you cannot read it")
            return
        budget = DOCUMENT_BUDGET - sum(len(document) for document in self.documents)
        shown = text[: max(budget, 0)]
        cut = (
            f" (truncated: showing the first {len(shown)} of {len(text)} characters)" if len(shown) < len(text) else ""
        )
        self.documents.append(shown)
        self.lines.append(f"Document {name}{cut}:\n```\n{shown}\n```")

    def _model(self, attachment: Attachment) -> None:
        name, data = attachment.info.name, attachment.content()
        try:
            x, y, z = read_skin(data).bounds
        except SkinRejected as error:
            self.lines.append(f"3D model {name}: it cannot be drawn as a skin ({error})")
            return
        self.lines.append(
            f"3D model {name}: stored with the project as skin {skin_id(data)}, "
            f"{x:.3g} × {y:.3g} × {z:.3g} in its own units. To draw it over an object, add a skin component "
            "whose asset is that id; it is fitted inside the object's collider, which alone decides the physics, "
            "so size the mesh to match the model."
        )

    def add(self, attachment: Attachment) -> None:
        info = attachment.info
        self.infos.append(info)
        match info.kind:
            case "view":
                self._picture(VIEW_LABEL, info.media_type, attachment.content())
            case "image":
                self._picture(f"the person's reference image {info.name}", info.media_type, attachment.content())
            case "video":
                if not attachment.frame_types:
                    self.lines.append(f"Video {info.name}: it came without frames, so you cannot watch it")
                for index in range(len(attachment.frame_types)):
                    path, media_type = attachment.frame(index)
                    label = f"frame {index + 1} of {len(attachment.frame_types)} of the person's video {info.name}"
                    self._picture(label, media_type, path.read_bytes())
            case "document":
                self._document(attachment)
            case "model":
                self._model(attachment)

    def expect_views(self, count: int) -> None:
        """Scene renders the app takes only when it sends the message, counted as the pictures they will be."""
        for _ in range(count):
            self._picture(VIEW_LABEL, "image/jpeg", b"")

    def user_content(self, text: str) -> UserContent:
        """The person's turn: plain text, or text and pictures as content parts when it carries pictures."""
        lines = list(self.lines)
        if self.left_out:
            lines.append(f"{self.left_out} more pictures were left out: at most {MAX_TURN_IMAGES} fit in one message")
        written = f"{text}\n\nAttached to this message:\n" + "\n".join(lines) if lines else text
        if not self.pictures:
            return written
        pictures = [{"type": "image_url", "image_url": {"url": url}} for url in self.pictures]
        return [{"type": "text", "text": written}, *pictures]


def turn_media(store: AttachmentStore, project_id: str, message: SendMessage) -> TurnMedia:
    """Scene views first, then the person's attachments in the order they were added."""
    media = TurnMedia()
    for attachment in store.of_project(project_id, [*message.views, *message.attachments]):
        media.add(attachment)
    return media
