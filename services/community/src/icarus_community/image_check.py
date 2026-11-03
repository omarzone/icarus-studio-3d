import base64
import binascii
from dataclasses import dataclass

SIGNATURES: dict[str, tuple[bytes, str]] = {
    "png": (b"\x89PNG\r\n\x1a\n", "image/png"),
    "jpg": (b"\xff\xd8\xff", "image/jpeg"),
}
MEDIA_TYPES = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}


class ImageRejected(ValueError):
    pass


@dataclass(frozen=True)
class CheckedImage:
    data: bytes
    extension: str


def check_image(encoded: str, max_bytes: int) -> CheckedImage:
    """A PNG, JPEG or WebP picture sent as base64 or a data URL, recognised by its bytes rather than its name."""
    payload = encoded.split(",", 1)[1] if encoded.startswith("data:") else encoded
    try:
        data = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ImageRejected("The picture is not valid base64") from error
    if len(data) > max_bytes:
        raise ImageRejected(f"The picture is larger than {max_bytes // 1024} KB")
    for extension, (signature, _media) in SIGNATURES.items():
        if data.startswith(signature):
            return CheckedImage(data, extension)
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return CheckedImage(data, "webp")
    raise ImageRejected("The picture must be a PNG, JPEG or WebP image")
