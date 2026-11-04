"""Auto-rig: turn an imported mesh into a body. The mesh is fitted with a skeleton (projects/rig_fit.py), each limb
becomes a physics part sized from the mesh, every part wears the piece of the mesh that follows it (rigid binding,
look only), and the body replaces the project's own through one batch of edit operations, design-tested like any
other."""

import base64
import binascii
import re
import threading
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import PurePath

from icarus.contracts.objects import ComponentSpec
from icarus.contracts.operations import (
    AddBody,
    CreateObject,
    EditOperation,
    OperationBatch,
    RemoveBody,
    RemoveRewardTerm,
    SetRewardTerm,
    SetTaskFamily,
)
from icarus.contracts.project import Project
from icarus.contracts.properties import AssetValue
from icarus.contracts.rig import AutoRigStart, AutoRigStatus, RigStep
from icarus.contracts.specs import BodySpec, RewardTermSpec
from icarus.library.components import default_component
from icarus.library.rewards import term_fits
from icarus.projects.document import all_objects
from icarus.projects.mesh_files import read_mesh, write_glb
from icarus.projects.rig_fit import fit_rig
from icarus.projects.rig_parts import SHELL, build_parts, part_mesh, rigid_part
from icarus.projects.skin_files import SkinRejected
from icarus.projects.skins import SkinStore
from icarus.projects.store import ProjectStore, RejectedBatch

Check = Callable[[], None]
# What a walking body is paid for, as the vault's humanoid.
WALK = (
    ("forward_progress", 1.0),
    ("stay_upright", 0.2),
    ("energy_cost", -0.001),
    ("fall_penalty", -10.0),
    ("feet_air_time", 0.5),
)
STEPS = (
    "Read the model",
    "Detect the body shape",
    "Place bones and joints",
    "Bind the skin to the parts",
    "Estimate masses and motor strength",
    "Stand-up physics test",
)


class AutoRigRefused(ValueError):
    """An auto-rig that cannot start, with a sentence a person can read."""


def _decode(data: str) -> bytes:
    try:
        return base64.b64decode("".join(data.split()), validate=True)
    except (binascii.Error, ValueError) as error:
        raise SkinRejected("The model is not valid base64") from error


def _label(name: str) -> str:
    stem = PurePath(name).stem.replace("_", " ").replace("-", " ").strip()
    return (stem[:1].upper() + stem[1:])[:80] or "Imported body"


def new_body_id(label: str, project: Project) -> str:
    taken = {body.id for body in project.bodies} | {obj.id for obj in all_objects(project)}
    base = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")[:40] or "body"
    candidate, number = f"{base}_body", 2
    while candidate in taken:
        candidate, number = f"{base}_body_{number}", number + 1
    return candidate


def spawn_spot(project: Project) -> tuple[float, float]:
    for obj in project.world.objects:
        kinds = {component.kind: component for component in obj.components}
        position = kinds["transform"].properties.get("position") if "transform" in kinds else None
        if "spawn_point" in kinds and position is not None and position.type == "vector":
            return position.value[0], position.value[1]
    return 0.0, 0.0


def _skin(asset: str) -> ComponentSpec:
    component = default_component("skin", "skin")
    component.properties["asset"] = AssetValue(type="asset", value=asset)
    return component


def walking_task(project: Project) -> list[EditOperation]:
    """A walking task for a project whose task cannot drive a body, keeping an imitation or locomotion one."""
    if project.task.family in ("locomotion", "imitation"):
        return []
    operations: list[EditOperation] = [SetTaskFamily(op="set_task_family", family="locomotion")]
    operations += [
        RemoveRewardTerm(op="remove_reward_term", term=term.term)
        for term in project.task.rewards
        if not term_fits(term.term, "locomotion")
    ]
    operations += [
        SetRewardTerm(op="set_reward_term", term=RewardTermSpec(term=term, weight=weight)) for term, weight in WALK
    ]
    return operations


class AutoRigBoard:
    """The latest auto-rig of each project, as it runs; kept in memory by the API process."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._status: dict[str, AutoRigStatus] = {}

    def begin(self, project_id: str, task_id: str, file: str) -> AutoRigStatus:
        steps = [RigStep(text=text, state="running" if index == 0 else "todo") for index, text in enumerate(STEPS)]
        status = AutoRigStatus(task_id=task_id, file=file, state="running", steps=steps, percent=0)
        with self._lock:
            self._status[project_id] = status
        return status

    def get(self, project_id: str) -> AutoRigStatus | None:
        with self._lock:
            return self._status.get(project_id)

    def update(self, project_id: str, **changes: object) -> None:
        with self._lock:
            current = self._status.get(project_id)
            if current is not None:
                self._status[project_id] = current.model_copy(update=changes)

    def step(self, project_id: str, index: int, text: str | None = None) -> None:
        """Steps before `index` are done, `index` runs now; its words may say what it found."""
        with self._lock:
            current = self._status.get(project_id)
            if current is None:
                return
            steps = []
            for number, step in enumerate(current.steps):
                state = "done" if number < index else "running" if number == index else "todo"
                steps.append(RigStep(text=text if number == index - 1 and text else step.text, state=state))
            percent = round(100 * index / len(steps))
            self._status[project_id] = current.model_copy(update={"steps": steps, "percent": percent})


Report = Callable[[int, str], None]


@dataclass(frozen=True)
class RigBuild:
    """The operations that make an imported mesh the project's body, and what the fit found."""

    operations: list[EditOperation]
    body_id: str
    label: str
    humanoid: bool
    parts: int


def _ignore(step: int, text: str) -> None:
    return None


def build_rig(
    project: Project,
    skins: SkinStore,
    name: str,
    data: bytes,
    height: float | None = None,
    check: Check = lambda: None,
    report: Report = _ignore,
) -> RigBuild:
    """Fit the mesh, build its parts, keep each part's piece of the mesh as a skin and return the operations that
    replace the project's body with it; nothing in the project changes until they are applied."""
    if project.agents:
        raise AutoRigRefused("Auto-rig replaces the project's body; a project with several agents keeps its own")
    mesh = read_mesh(name, data)
    label = _label(name)
    report(1, f"Read {name} · {len(mesh.triangles):,} triangles")
    check()
    fit = fit_rig(mesh, height)
    report(2, f"Detect the body shape · {'humanoid' if fit.humanoid else 'one rigid part (no separate legs found)'}")
    check()
    built = build_parts(fit) if fit.humanoid else []
    report(3, f"Place {len(built)} bones and joints" if built else "One part, no joints")
    check()
    parts = [item.part for item in built] if built else [rigid_part(fit)]
    stem = PurePath(name).stem
    if built:
        index = {segment.name: number for number, segment in enumerate(fit.segments)}
        for item in built:
            piece = part_mesh(fit, index[item.segment], item)
            if piece is not None:
                info = skins.add(project.id, f"{stem}-{item.part.id}.glb", write_glb(piece, SHELL))
                item.part.components["skin"] = {"asset": info.id}
            check()
    else:
        info = skins.add(project.id, f"{stem}.glb", write_glb(fit.mesh, SHELL))
        parts[0].components["skin"] = {"asset": info.id}
    report(4, "Bind the skin to the parts · each vertex follows one part")
    check()
    body_id = new_body_id(label, project)
    x, y = spawn_spot(project)
    objects = []
    for part in parts:
        spec = part.spec()
        if part.parent is None:
            transform = next(component for component in spec.components if component.kind == "transform")
            position = transform.properties["position"]
            if position.type == "vector":
                position.value = (position.value[0] + x, position.value[1] + y, position.value[2])
        objects.append(spec.model_copy(update={"id": f"{body_id}_{spec.id}", "parent": _parent(spec.parent, body_id)}))
    objects = [_renamed_links(obj, body_id) for obj in objects]
    report(5, f"Estimate masses and motor strength · {sum(_mass(obj) for obj in objects):.1f} kg")
    check()
    operations: list[EditOperation] = [RemoveBody(op="remove_body", body=body.id) for body in project.bodies]
    operations.append(AddBody(op="add_body", body=BodySpec(id=body_id, name=label, objects=[])))
    operations += [CreateObject(op="create_object", target=body_id, object=obj) for obj in objects]
    operations += walking_task(project)
    return RigBuild(operations, body_id, label, fit.humanoid, len(objects))


def auto_rig(
    store: ProjectStore,
    skins: SkinStore,
    board: AutoRigBoard,
    project_id: str,
    request: AutoRigStart,
    check: Check,
) -> AutoRigStatus:
    """Fit, build and add the body in one revision, reporting each step on the board; `check` raises to cancel."""
    project = store.state(project_id).project

    def report(step: int, text: str) -> None:
        board.step(project_id, step, text)
        if step == 2:
            board.update(project_id, shape="humanoid" if "humanoid" in text else "rigid")

    build = build_rig(project, skins, request.name, _decode(request.data), request.height, check, report)
    batch = OperationBatch(operations=build.operations, summary=f"Auto-rigged {build.label}")
    try:
        state = store.apply(project_id, batch)
    except RejectedBatch as rejected:
        reasons = "; ".join(issue.message for issue in rejected.issues) or "The physics tests failed"
        raise AutoRigRefused(f"The rigged body did not pass its physics tests: {reasons}") from rejected
    board.step(project_id, len(STEPS), "Stand-up physics test · passed")
    board.update(project_id, state="done", percent=100, body=build.body_id, revision=state.revision.number)
    status = board.get(project_id)
    assert status is not None
    return status


def _parent(parent: str | None, body_id: str) -> str | None:
    return f"{body_id}_{parent}" if parent else None


def _renamed_links(obj, body_id: str):
    """Motors and joints name other parts by id; the body's prefix goes on those too."""
    for component in obj.components:
        for key in ("joint", "connects_to"):
            value = component.properties.get(key) if component.kind in ("motor", "joint") else None
            if isinstance(value, AssetValue) and value.value:
                value.value = f"{body_id}_{value.value}"
    return obj


def _mass(obj) -> float:
    physics = next((component for component in obj.components if component.kind == "physics_body"), None)
    mass = physics.properties.get("mass") if physics else None
    return float(mass.value) if mass is not None and mass.type == "number" else 0.0
