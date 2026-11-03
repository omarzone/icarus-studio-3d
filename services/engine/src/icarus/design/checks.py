import time
from collections.abc import Callable
from typing import Literal

import mujoco
import numpy as np

from icarus.contracts.design import DesignCheck, DesignReport
from icarus.contracts.project import Project
from icarus.design.compiler import CompiledModel, CompileError, compile_project
from icarus.design.reachable import reachable
from icarus.design.vehicle import BRAKE_SUFFIX
from icarus.projects.document import all_objects
from icarus.projects.validation import validate_project

Status = Literal["pass", "fail", "skip"]
CheckId = Literal["structure", "compiles", "reachable", "settles", "actuators", "sensors"]
Outcome = tuple[Status, str]

SETTLE_SECONDS = 1.5
MAX_SPEED = 20.0
LOWEST_Z = -1.0
DRIVE_SECONDS = 0.3
DRIVE_POINT = 0.75
MIN_JOINT_MOVE = 1e-3

LABELS: dict[CheckId, str] = {
    "structure": "Structure",
    "compiles": "Compiles",
    "reachable": "Goal and start are clear",
    "settles": "Settles at rest",
    "actuators": "Motors move their joints",
    "sensors": "Sensors read finite values",
}


def _unstable(data) -> bool:
    return not (np.all(np.isfinite(data.qpos)) and np.all(np.isfinite(data.qvel))) or bool(
        data.warning[mujoco.mjtWarning.mjWARN_BADQACC].number
    )


def _settles(compiled: CompiledModel, names: dict[str, str]) -> Outcome:
    model = compiled.model
    data = mujoco.MjData(model)
    for _ in range(int(SETTLE_SECONDS / model.opt.timestep)):
        mujoco.mj_step(model, data)
        if _unstable(data):
            return "fail", "The design blows up at rest: the physics engine produced invalid motion"
    speeds = np.linalg.norm(data.cvel[:, 3:], axis=1)
    if speeds.size and speeds.max() > MAX_SPEED:
        body = names.get(model.body(int(speeds.argmax())).name, "A part")
        return "fail", f"{body} is still moving at {speeds.max():.0f} m/s after {SETTLE_SECONDS:g} s at rest"
    lowest = int(data.xpos[:, 2].argmin())
    if data.xpos[lowest, 2] < LOWEST_Z:
        body = names.get(model.body(lowest).name, "A part")
        return "fail", f"{body} fell off the ground or through it; move it over the ground or widen the ground"
    return "pass", f"Everything is still after {SETTLE_SECONDS:g} s"


def _drive(model, controls: np.ndarray):
    data = mujoco.MjData(model)
    for _ in range(int(DRIVE_SECONDS / model.opt.timestep)):
        data.ctrl[:] = controls
        mujoco.mj_step(model, data)
    return data


def _actuators(compiled: CompiledModel, names: dict[str, str]) -> Outcome:
    model = compiled.model
    if model.nu == 0:
        return "skip", "This design has no motors"
    baseline = _drive(model, np.zeros(model.nu))
    stuck: list[str] = []
    for index in range(model.nu):
        if model.actuator(index).name.endswith(BRAKE_SUFFIX):
            continue
        low, high = model.actuator_ctrlrange[index]
        controls = np.zeros(model.nu)
        controls[index] = low + DRIVE_POINT * (high - low)
        driven = _drive(model, controls)
        address = model.jnt_qposadr[model.actuator_trnid[index, 0]]
        moved = abs(driven.qpos[address] - baseline.qpos[address])
        if _unstable(driven) or not np.isfinite(moved) or moved < MIN_JOINT_MOVE:
            owner: str = model.actuator(index).name.split(":")[0]
            stuck.append(names.get(owner, owner))
    if stuck:
        return "fail", f"Motor on {', '.join(stuck)} does not move its joint"
    return "pass", f"All {model.nu} motors move their joints"


def _sensors(compiled: CompiledModel, _: dict[str, str]) -> Outcome:
    model = compiled.model
    if model.nsensor == 0:
        return "skip", "This design has no sensors"
    data = mujoco.MjData(model)
    mujoco.mj_step(model, data)
    if not np.all(np.isfinite(data.sensordata)):
        return "fail", "A sensor returned an invalid reading"
    return "pass", f"All {model.nsensor} sensors read finite values"


PHYSICS: list[tuple[CheckId, Callable[[CompiledModel, dict[str, str]], Outcome]]] = [
    ("settles", _settles),
    ("actuators", _actuators),
    ("sensors", _sensors),
]


def design_report(project: Project) -> tuple[DesignReport, CompiledModel | None]:
    """Validate, compile and physically test a candidate project; later checks skip after a failure."""
    started = time.perf_counter()
    checks: list[DesignCheck] = []

    def add(check: CheckId, status: Status, detail: str) -> None:
        checks.append(DesignCheck(id=check, label=LABELS[check], status=status, detail=detail))

    def finish(compiled: CompiledModel | None) -> tuple[DesignReport, CompiledModel | None]:
        for check in LABELS:
            if check not in {item.id for item in checks}:
                add(check, "skip", "Skipped after an earlier failure")
        ok = all(item.status != "fail" for item in checks)
        report = DesignReport(ok=ok, checks=checks, duration_ms=(time.perf_counter() - started) * 1000)
        return report, compiled if ok else None

    issues = validate_project(project)
    if issues:
        add("structure", "fail", "; ".join(issue.message for issue in issues))
        return finish(None)
    add("structure", "pass", "Every part, property and reference is valid")
    try:
        compiled = compile_project(project)
    except CompileError as error:
        add("compiles", "fail", error.reason)
        return finish(None)
    add("compiles", "pass", f"{compiled.model.nbody - 1} parts, {compiled.model.njnt} joints")
    try:
        status, detail = reachable(project, compiled)
    except (mujoco.FatalError, ValueError) as error:
        status, detail = "fail", f"The physics engine stopped: {str(error).strip().splitlines()[0]}"
    add("reachable", status, detail)
    if status == "fail":
        return finish(compiled)
    names = {obj.id: obj.name for obj in all_objects(project)}
    for check, run in PHYSICS:
        try:
            status, detail = run(compiled, names)
        except (mujoco.FatalError, ValueError) as error:
            status, detail = "fail", f"The physics engine stopped: {str(error).strip().splitlines()[0]}"
        add(check, status, detail)
        if status == "fail":
            return finish(compiled)
    return finish(compiled)
