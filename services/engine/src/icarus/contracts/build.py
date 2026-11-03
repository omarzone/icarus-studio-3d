from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


BuildTargetKind = Literal["community", "export-brain", "hardware", "game", "animation"]
# What an export holds: the trained brain, the robot description, the MuJoCo model, or all of them as a runtime package.
ExportFormat = Literal["onnx", "urdf", "mjcf", "package"]
# Extra files: the brain's observation and action spec, a README with a reference script, the parts list, training.
ExportOption = Literal["spec", "runtime", "parts", "history"]
HardwareStatus = Literal["pass", "warn", "fail", "skipped"]
HardwareVerdict = Literal["pass", "warn", "fail"]


class BuildTarget(_Model):
    kind: BuildTargetKind
    # Short facts under the target name ("ONNX file · 1.2 MB", "Parts list · about $189").
    detail: str = Field(max_length=80)


class ExportChoice(_Model):
    format: ExportFormat = "package"
    options: list[ExportOption] = Field(default_factory=lambda: ["spec", "runtime", "parts"])


class ExportRequest(ExportChoice):
    # The zip file the person chose in the save dialog: an absolute path ending in .zip whose folder exists.
    destination: str = Field(min_length=1, max_length=4096)


class ExportFile(_Model):
    path: str = Field(max_length=200)
    bytes: int = Field(ge=0)
    # What the file is for, in words.
    description: str = Field(max_length=200)


class ExportBrain(_Model):
    """The trained brain an export carries: the best checkpoint of the newest ended run of the revision."""

    run_id: str
    run_name: str
    step: int = Field(ge=0)
    inputs: int = Field(ge=0)
    outputs: int = Field(ge=0)
    rate_hz: float = Field(gt=0)


class ExportPlan(_Model):
    """The files an export writes, with their real sizes, before anything is written."""

    format: ExportFormat
    options: list[ExportOption]
    # Suggested zip file name ("park-pilot-r3.zip").
    name: str
    files: list[ExportFile]
    total_bytes: int = Field(ge=0)
    brain: ExportBrain | None
    # What is left out or approximated, and why ("No trained brain yet: brain.onnx is not included").
    notes: list[str] = []


class ExportResult(_Model):
    path: str
    files: list[ExportFile]
    total_bytes: int = Field(ge=0)


class HardwareCheckRequest(_Model):
    # A kit from the library; None picks the kit that fits the body best.
    kit: str | None = Field(default=None, max_length=64)
    # Rows the person chose to leave out of the verdict, by row id.
    skipped: list[str] = Field(default_factory=list, max_length=200)


class HardwareKitInfo(_Model):
    id: str
    name: str
    # The computer that runs the brain on the device ("Raspberry Pi 5").
    board: str


class HardwareRow(_Model):
    """One joint or sensor of the body checked against the part of the kit that would play it."""

    id: str
    # The body's joint or sensor, by name.
    part: str
    kind: Literal["joint", "sensor"]
    # What the kit's part must do: drive, steering, joint, distance, balance or touch.
    role: str
    # The kit's part for it; None when the kit has none.
    hardware: str | None
    # What the body asks of it and what the hardware gives, in `unit`; None when not measured or not rated.
    need: float | None
    limit: float | None
    unit: str
    # need / limit for the bar, 0 when either is missing.
    fraction: float = Field(ge=0)
    status: HardwareStatus
    # The need was measured by running the trained brain, not taken from the design's limits.
    measured: bool
    # The gap between simulation and hardware for this row, in words.
    gap: str = Field(max_length=400)


class HardwarePart(_Model):
    name: str
    count: int = Field(ge=1)
    # Approximate price of one, in US dollars.
    usd: float = Field(ge=0)


class HardwareProblem(_Model):
    title: str
    fix: str


class HardwareCheck(_Model):
    """The body's joints and sensors checked against a hardware kit, with an honest verdict."""

    project_id: str
    revision: int = Field(ge=1)
    kit: HardwareKitInfo
    # Every kit of the library, to check against another.
    kits: list[HardwareKitInfo]
    rows: list[HardwareRow]
    verdict: HardwareVerdict
    problem: HardwareProblem | None
    parts: list[HardwarePart]
    safety: list[str]
    # Where measured needs come from ("Run 3 at step 312,000, one evaluation episode"); None without a trained brain.
    measured_from: str | None
