"""An export of a project's revision: the files it holds, their real sizes, and writing them as one zip file."""

import csv
import io
import json
import os
import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

from icarus.contracts.build import ExportBrain, ExportChoice, ExportFile, ExportPlan, ExportResult, HardwareCheck
from icarus.contracts.project import ProjectState
from icarus.design.compiler import compile_project
from icarus.hardware.brain_export import brain_onnx, brain_spec
from icarus.hardware.project_brain import hardware_check, project_needs, trained_brain
from icarus.hardware.runtime_files import RUN_POLICY, readme
from icarus.hardware.urdf import body_urdf
from icarus.training.run_store import RunStore

NO_BRAIN = "No trained brain yet: train one to include brain.onnx, brain.json and run_policy.py"


class ExportRefused(ValueError):
    pass


@dataclass
class ExportBundle:
    name: str
    # Path inside the export → content and what it is for.
    files: dict[str, tuple[bytes, str]]
    brain: ExportBrain | None
    notes: list[str] = field(default_factory=list)

    def listing(self) -> list[ExportFile]:
        return [
            ExportFile(path=path, bytes=len(content), description=description)
            for path, (content, description) in self.files.items()
        ]

    def plan(self, choice: ExportChoice) -> ExportPlan:
        listing = self.listing()
        return ExportPlan(
            format=choice.format,
            options=choice.options,
            name=f"{self.name}.zip",
            files=listing,
            total_bytes=sum(item.bytes for item in listing),
            brain=self.brain,
            notes=self.notes,
        )


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "project"


def _history(runs: RunStore, run_id: str) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["kind", "step", "elapsed_s", "episode_return", "episode_length", "success_rate", "failure_rate"])
    for point in runs.folder(run_id).metrics():
        row = [point.kind, point.step, point.elapsed, point.episode_return, point.episode_length]
        writer.writerow([*row, point.success_rate, point.failure_rate])
    return buffer.getvalue().encode("utf-8")


def _parts(check: HardwareCheck) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["part", "count", "usd_each", "usd_total"])
    for part in check.parts:
        writer.writerow([part.name, part.count, f"{part.usd:.2f}", f"{part.usd * part.count:.2f}"])
    writer.writerow(["Total (approximate)", "", "", f"{sum(p.usd * p.count for p in check.parts):.2f}"])
    return buffer.getvalue().encode("utf-8")


def export_bundle(state: ProjectState, runs: RunStore, choice: ExportChoice) -> ExportBundle:
    project, revision = state.project, state.revision.number
    brain = trained_brain(state, runs)
    files: dict[str, tuple[bytes, str]] = {}
    notes: list[str] = []
    robot = choice.format in ("urdf", "package")
    if brain is None and (choice.format in ("onnx", "package") or {"spec", "runtime"} & set(choice.options)):
        notes.append(NO_BRAIN)
    spec = brain_spec(brain.project, brain.run_name, brain.step) if brain else None
    if brain and choice.format in ("onnx", "package"):
        files["brain.onnx"] = (brain_onnx(brain.checkpoint), "The trained brain as an ONNX graph")
    if robot or choice.format == "mjcf":
        compiled = compile_project(project)
        if robot and project.bodies:
            speeds = {need.joint: need.speed for need in project_needs(state, runs).motors if need.speed}
            urdf = body_urdf(project, compiled, speeds)
            files["robot.urdf"] = (urdf.xml.encode("utf-8"), f"The body as a URDF robot: {len(urdf.links)} links")
            notes += urdf.notes
        elif robot:
            notes.append("The project has no body, so there is no robot.urdf")
        if choice.format in ("mjcf", "package"):
            files["scene.xml"] = (compiled.mjcf.encode("utf-8"), "The body and its world as a MuJoCo model (MJCF)")
    if spec is not None and ("spec" in choice.options or "runtime" in choice.options):
        files["brain.json"] = (json.dumps(spec, indent=2).encode("utf-8"), "Every input and output of the brain")
    check = hardware_check(state, runs) if "parts" in choice.options or "runtime" in choice.options else None
    if check is not None and "parts" in choice.options:
        files["parts.csv"] = (_parts(check), f"Parts for {check.kit.name}, with approximate prices")
    if brain and "history" in choice.options:
        files["training.csv"] = (_history(runs, brain.run_id), f"Training and evaluation points of {brain.run_name}")
    if brain and "runtime" in choice.options:
        files["run_policy.py"] = (RUN_POLICY.encode("utf-8"), "Reference loop to run the brain; fill in two functions")
    info = brain.info(len(spec["inputs"]), len(spec["outputs"])) if brain and spec else None
    if "runtime" in choice.options:
        listed = [(path, description) for path, (_, description) in files.items()]
        listed.append(("README.md", "This file"))
        text = readme(project.name, revision, listed, info, spec, check, notes)
        files["README.md"] = (text.encode("utf-8"), "How to run the export, and the gap to real hardware")
    return ExportBundle(f"{slug(project.name)}-r{revision}", files, info, notes)


def _destination(path: str) -> Path:
    destination = Path(path)
    if not destination.is_absolute() or destination.suffix.lower() != ".zip":
        raise ExportRefused("Choose an absolute path to a .zip file")
    if not destination.parent.is_dir():
        raise ExportRefused("The folder for the export does not exist")
    if destination.is_dir():
        raise ExportRefused("That path is a folder, not a file")
    return destination


def write_zip(bundle: ExportBundle, path: str) -> ExportResult:
    """Write the export as `<name>/<file>` entries of one zip file, replacing it only once complete."""
    destination = _destination(path)
    partial = destination.with_name(f".{destination.name}.partial")
    try:
        with zipfile.ZipFile(partial, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name, (content, _) in bundle.files.items():
                archive.writestr(f"{bundle.name}/{name}", content)
        os.replace(partial, destination)
    except OSError as error:
        partial.unlink(missing_ok=True)
        raise ExportRefused(f"The export could not be written: {error.strerror or error}") from error
    listing = bundle.listing()
    return ExportResult(path=str(destination), files=listing, total_bytes=sum(item.bytes for item in listing))
