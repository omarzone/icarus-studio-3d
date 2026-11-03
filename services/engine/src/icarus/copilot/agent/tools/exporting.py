"""Getting the creation out from the chat: checking the body against real hardware and exporting robot files."""

from pathlib import Path

from pydantic import Field

from icarus.contracts.build import ExportChoice, ExportFormat, ExportOption
from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TurnScope
from icarus.copilot.agent.tools.inspect import compact
from icarus.copilot.step_words import step_said
from icarus.design.compile_error import CompileError
from icarus.library.hardware import KITS

EXPORTS = "exports"
ROWS_LISTED = 24


class CheckHardwareArgs(ToolArgs):
    kit: str | None = Field(
        default=None,
        max_length=64,
        description=f"Hardware kit to check against, one of {', '.join(KITS)}; none picks the kit that fits best.",
    )


def check_hardware(scope: TurnScope, args: CheckHardwareArgs) -> Observation:
    from icarus.hardware.project_brain import hardware_check

    if args.kit is not None and args.kit not in KITS:
        text = f"There is no kit `{args.kit}`. Kits: {', '.join(KITS)}"
        return Observation(text, ok=False, summary=step_said("hardware_kit_missing", scope.language))
    try:
        check = hardware_check(scope.state, scope.services.runs, args.kit)
    except (CompileError, ValueError) as error:
        return Observation(f"The body could not be checked: {error}", ok=False, summary=str(error)[:200])
    facts = {
        "kit": check.kit.model_dump(),
        "verdict": check.verdict,
        "measured_from": check.measured_from or "not measured: no trained brain, needs are the design's limits",
        "rows": [
            {"part": row.part, "status": row.status, "hardware": row.hardware, "gap": row.gap}
            for row in check.rows[:ROWS_LISTED]
        ],
        "parts_usd": round(sum(part.usd * part.count for part in check.parts)),
        "other_kits": [kit.id for kit in check.kits if kit.id != check.kit.id],
    }
    summary = step_said("hardware_checked", scope.language, kit=check.kit.name, verdict=check.verdict)
    return Observation(compact(facts), summary=summary)


CHECK_HARDWARE = Tool(
    name="check_hardware",
    description=(
        "Check the body's joints and sensors against a real hardware kit from the library (servos, motors, sensors "
        "with their rated torque, speed, travel and range). Says pass, warn or fail per joint and sensor with the "
        "gap between simulation and hardware, measured with the trained brain when there is one."
    ),
    args=CheckHardwareArgs,
    step="inspect",
    effect="read",
    run=check_hardware,
    per_turn=3,
    timeout_s=60,
)


class ExportArgs(ToolArgs):
    format: ExportFormat = Field(
        description="onnx: the trained brain; urdf: the robot description; mjcf: the MuJoCo model of body and world; "
        "package: all of them as a runtime package."
    )
    options: list[ExportOption] = Field(
        default=["spec", "runtime", "parts"],
        description="Extra files: spec (brain inputs and outputs), runtime (README and reference script), parts "
        "(parts list), history (training points).",
    )


def _destination(scope: TurnScope, name: str, format: str) -> Path:
    folder = scope.services.projects.root.parent / EXPORTS / scope.project_id
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{name}-{format}.zip"


def export_robot(scope: TurnScope, args: ExportArgs) -> Observation:
    from icarus.hardware.export_bundle import ExportRefused, export_bundle, write_zip

    choice = ExportChoice(format=args.format, options=args.options)
    try:
        bundle = export_bundle(scope.state, scope.services.runs, choice)
        result = write_zip(bundle, str(_destination(scope, bundle.name, args.format)))
    except (CompileError, ExportRefused, ValueError) as error:
        return Observation(f"The export failed: {error}", ok=False, summary=str(error)[:200])
    facts = {
        "zip": result.path,
        "files": [{"path": item.path, "bytes": item.bytes} for item in result.files],
        "notes": bundle.notes,
        "brain": bundle.brain.model_dump() if bundle.brain else "none: no trained brain yet",
        "download": "The Build workspace's Export brain dialog saves a copy anywhere the person chooses.",
    }
    scope.side_effects.append(f"Exported {len(result.files)} files to {result.path}.")
    summary = step_said("exported", scope.language, format=args.format.upper(), count=len(result.files))
    return Observation(compact(facts), summary=summary)


EXPORT_ROBOT = Tool(
    name="export_robot",
    description=(
        "Export the project's current revision as files: the trained brain as ONNX with its input and output spec, "
        "the body as URDF, the body and world as MuJoCo MJCF, a parts list and a runtime package with a README. "
        "Writes one zip file into the data folder's exports and returns its path and files. Only when the person "
        "asks to export, download or run the robot elsewhere."
    ),
    args=ExportArgs,
    step="export",
    effect="write",
    run=export_robot,
    per_turn=2,
    timeout_s=120,
)
