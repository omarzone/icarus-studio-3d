"""A body's rig: auto-rigging an imported mesh, its physics checks with their fixes, test poses and skin weights."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.copilot import MAX_ATTACHMENT_CHARS
from icarus.contracts.design import DesignReport
from icarus.contracts.scene import SceneDescription


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class AutoRigStart(_Model):
    """A mesh file to turn into a body: OBJ, STL, glTF or GLB, base64."""

    name: str = Field(min_length=1, max_length=200)
    data: str = Field(max_length=MAX_ATTACHMENT_CHARS)
    # Standing height in metres; None keeps the model's own when it reads as metres, else 1.7 m.
    height: float | None = Field(default=None, ge=0.2, le=5)


StepState = Literal["done", "running", "todo"]


class RigStep(_Model):
    text: str
    state: StepState


AutoRigState = Literal["running", "done", "failed", "stopped"]


class AutoRigStatus(_Model):
    """An auto-rig as it runs: the steps with the one running now, and the body it made once done."""

    task_id: str
    file: str
    state: AutoRigState
    steps: list[RigStep]
    percent: int = Field(ge=0, le=100)
    # What the fit found ("humanoid", or one rigid part when it found no limbs).
    shape: str | None = None
    body: str | None = None
    revision: int | None = None
    message: str | None = None


class RigFinding(_Model):
    """A problem in a body found by the rig audit, with whether the engine has a fix for it."""

    id: str
    part: str
    text: str
    fixable: bool


class PoseOption(_Model):
    id: str
    label: str


class RigCheck(_Model):
    """The design tests run now on the current revision, the rig audit and the test poses the body can take."""

    report: DesignReport
    findings: list[RigFinding]
    poses: list[PoseOption]


class RigFixResult(_Model):
    # The fixes applied, in words, and the revision that holds them; None when nothing needed fixing.
    applied: list[str]
    revision: int | None
    check: RigCheck


class PoseRequest(_Model):
    pose: str = Field(min_length=1, max_length=64)
    body: str | None = None


class PoseResult(_Model):
    """A test pose taken in MuJoCo: the joints set, whether parts overlap and whether the motors hold it."""

    pose: str
    label: str
    joints: int = Field(ge=0)
    overlaps: list[str]
    # Whether the body stayed up with its motors holding the pose for `seconds`, and how far the joints sagged.
    holds: bool
    seconds: float
    sag_degrees: float
    # The body as posed, for the view; the project never changes.
    scene: SceneDescription


class BoneWeight(_Model):
    part: str
    name: str
    vertices: int = Field(ge=0)
    # Share of the bone's skin inside its collider (with a margin); low coverage looks loose when it moves.
    coverage: float = Field(ge=0, le=1)
    problem: str | None = None


class SkinWeights(_Model):
    """How an auto-rigged body's mesh is bound to its parts; each vertex follows one part (rigid binding)."""

    body: str | None
    bones: list[BoneWeight]
