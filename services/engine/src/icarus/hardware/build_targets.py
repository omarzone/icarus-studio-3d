"""What a project's revision can be built into, with the real facts shown under each target."""

from icarus.contracts.build import BuildTarget
from icarus.contracts.project import ProjectState
from icarus.design.components import view
from icarus.hardware.brain_export import brain_onnx
from icarus.hardware.project_brain import hardware_check, trained_brain
from icarus.training.run_store import RunStore


def _size(count: int) -> str:
    value, unit = float(count), "B"
    for next_unit in ("KB", "MB", "GB"):
        if value < 1000:
            break
        value, unit = value / 1000, next_unit
    return f"{value:.1f} {unit}" if value < 10 and unit != "B" else f"{value:.0f} {unit}"


def build_targets(state: ProjectState, runs: RunStore) -> list[BuildTarget]:
    project = state.project
    brain = trained_brain(state, runs)
    targets = [BuildTarget(kind="community", detail="Publish so others can remix it")]
    brain_detail = f"ONNX file · {_size(len(brain_onnx(brain.checkpoint)))}" if brain else "Robot files · URDF, MJCF"
    targets.append(BuildTarget(kind="export-brain", detail=brain_detail))
    if not project.bodies:
        return targets
    check = hardware_check(state, runs)
    total = sum(part.usd * part.count for part in check.parts)
    targets.append(BuildTarget(kind="hardware", detail=f"Parts list · about ${total:,.0f}"))
    targets.append(
        BuildTarget(kind="game", detail="ONNX for Unity Sentis or Godot" if brain else "Needs a trained brain")
    )
    if not any(view(obj, "vehicle") for obj in project.bodies[0].objects):
        targets.append(BuildTarget(kind="animation", detail="JSON · BVH (for dancers)"))
    return targets
