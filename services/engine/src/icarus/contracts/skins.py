from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.copilot import MAX_ATTACHMENT_CHARS

Vector3 = tuple[float, float, float]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class SkinInfo(_Model):
    """A glTF or GLB model stored in a project to draw over a collider (ADR 008)."""

    id: str
    name: str
    format: Literal["glb", "gltf"]
    # Bytes of the stored file.
    size: int = Field(ge=0)
    # Full extents of the model in its own units, on the engine's axes (X, Y, Z-up).
    bounds: Vector3
    triangles: int = Field(ge=0)


class SkinImport(_Model):
    """A model file the person picked: stored as a skin and placed in the world as a collider that wears it."""

    name: str = Field(min_length=1, max_length=200)
    # The file itself, base64.
    data: str = Field(max_length=MAX_ATTACHMENT_CHARS)
    # Where the object goes: "world" or a body id, and its position in metres.
    target: str = "world"
    position: Vector3 = (0, 0, 0)
    collider: Literal["box", "capsule"] = "box"
    # Dynamic objects get their mass from the density and the collider's volume.
    mode: Literal["dynamic", "static"] = "dynamic"
    density: float = Field(default=500, ge=1, le=20_000)
    # Longest side in metres; None keeps the model's own size when it reads as metres, else makes it 1 m.
    length: float | None = Field(default=None, ge=0.01, le=200)


class SkinImported(_Model):
    skin: SkinInfo
    # The object made to wear it, and the revision that added it.
    object: str
    revision: int
