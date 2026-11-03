"""How a body's mesh is bound to its parts, for drawing only: every triangle follows one part (rigid binding), placed
the way the view fits a skin inside its collider (ADR 008). A part's coverage is the share of its skin that is
nearest to it; rebinding gives every triangle to the part it is nearest to. Physics never reads any of it."""

from dataclasses import dataclass

import mujoco
import numpy as np

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.operations import AddComponent, EditOperation, RemoveComponent, SetProperty
from icarus.contracts.project import Project
from icarus.contracts.properties import AssetValue
from icarus.contracts.rig import BoneWeight, SkinWeights
from icarus.design.compiler import compile_project
from icarus.design.components import view
from icarus.library.components import default_component
from icarus.projects.mesh_files import Mesh, read_mesh, write_glb
from icarus.projects.skin_files import SkinRejected
from icarus.projects.skins import SkinStore, UnknownSkin

# Below this coverage a part's skin is called loose.
LOOSE = 0.9
_COLOR = "#e8e2d6"


@dataclass(frozen=True)
class _Bone:
    obj: ObjectSpec
    geom: int
    # The part's collider as a segment with a radius, in its own frame.
    half: np.ndarray
    radius: float
    position: np.ndarray
    rotation: np.ndarray
    skin: str | None


def _segment(shape: str, size: tuple[float, float, float]) -> tuple[np.ndarray, float]:
    sx, sy, sz = (value / 2 for value in size)
    if shape in ("capsule", "cylinder"):
        return np.array([0.0, 0.0, max(sz - sx, 0.0)]), max(sx, 1e-3)
    if shape == "sphere":
        return np.zeros(3), max(sx, 1e-3)
    halves = np.array([sx, sy, sz])
    longest = int(np.argmax(halves))
    axis = np.zeros(3)
    axis[longest] = halves[longest] - float(np.delete(halves, longest).mean())
    return np.maximum(axis, 0.0), max(float(np.delete(halves, longest).mean()), 1e-3)


def _bones(project: Project, body_id: str | None) -> tuple[list[_Bone], str | None]:
    body = next((item for item in project.bodies if body_id in (None, item.id)), None)
    if body is None:
        return [], None
    compiled = compile_project(project)
    model = compiled.model
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    bones: list[_Bone] = []
    for obj in body.objects:
        mesh, physics = view(obj, "mesh"), view(obj, "physics_body")
        geom = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, obj.id)
        if mesh is None or physics is None or geom < 0:
            continue
        half, radius = _segment(mesh.text("shape"), mesh.vector("size"))
        skin = view(obj, "skin")
        asset = skin.text("asset") if skin else ""
        position, rotation = data.geom_xpos[geom].copy(), data.geom_xmat[geom].reshape(3, 3).copy()
        bones.append(_Bone(obj, geom, half, radius, position, rotation, asset or None))
    return bones, body.id


def _fitted(mesh: Mesh, size: tuple[float, float, float], fill: float) -> np.ndarray:
    """The skin's vertices where the view draws them in the part's frame: centered and scaled to fit its box."""
    low, high = mesh.bounds
    extent = high - low
    ratios = [side / span for side, span in zip(size, extent, strict=True) if span > 1e-9]
    scale = fill * min(ratios) if ratios else 1.0
    return (mesh.vertices - (low + high) / 2) * scale


def _distances(points: np.ndarray, bones: list[_Bone]) -> np.ndarray:
    """Each point's distance to each bone's collider segment, in that bone's radii."""
    columns = []
    for bone in bones:
        local = (points - bone.position) @ bone.rotation
        clamped = np.clip(local, -bone.half, bone.half)
        columns.append(np.linalg.norm(local - clamped, axis=1) / bone.radius)
    return np.stack(columns, axis=1)


def _skinned(skins: SkinStore, project_id: str, bones: list[_Bone]) -> list[tuple[int, Mesh]]:
    """Every bone's skin in world rest positions, by bone index."""
    placed: list[tuple[int, Mesh]] = []
    for index, bone in enumerate(bones):
        if bone.skin is None:
            continue
        try:
            path, _ = skins.content(project_id, bone.skin)
            mesh = read_mesh(path.name, path.read_bytes())
        except (UnknownSkin, SkinRejected, OSError):
            continue
        mesh_view, skin_view = view(bone.obj, "mesh"), view(bone.obj, "skin")
        assert mesh_view is not None and skin_view is not None
        local = _fitted(mesh, mesh_view.vector("size"), skin_view.number("fill"))
        placed.append((index, Mesh(local @ bone.rotation.T + bone.position, mesh.triangles)))
    return placed


def skin_weights(project: Project, skins: SkinStore, body_id: str | None = None) -> SkinWeights:
    """Each skinned part of the body with how many vertices follow it and how many of those are nearest to it."""
    bones, found = _bones(project, body_id)
    rows: list[BoneWeight] = []
    for index, mesh in _skinned(skins, project.id, bones):
        nearest = np.argmin(_distances(mesh.vertices, bones), axis=1)
        coverage = float(np.mean(nearest == index)) if len(nearest) else 0.0
        bone = bones[index]
        problem = None
        if coverage < LOOSE:
            others = np.bincount(nearest[nearest != index], minlength=len(bones))
            closer = bones[int(np.argmax(others))].obj.name
            problem = f"{round((1 - coverage) * 100)}% of its skin is nearer to {closer}"
        rows.append(
            BoneWeight(
                part=bone.obj.id, name=bone.obj.name, vertices=len(mesh.vertices), coverage=coverage, problem=problem
            )
        )
    return SkinWeights(body=found, bones=rows)


def rebind(project: Project, skins: SkinStore, body_id: str | None = None) -> list[EditOperation]:
    """The operations that give every triangle of the body's skin to the part it is nearest to; empty when every
    triangle already follows its nearest part."""
    bones, _ = _bones(project, body_id)
    placed = _skinned(skins, project.id, bones)
    if not placed:
        return []
    vertices = np.concatenate([mesh.vertices for _, mesh in placed])
    offsets = np.cumsum([0] + [len(mesh.vertices) for _, mesh in placed])
    triangles = np.concatenate([mesh.triangles + offsets[number] for number, (_, mesh) in enumerate(placed)])
    current = np.concatenate([np.full(len(mesh.triangles), index) for index, mesh in placed])
    owners = np.argmin(_distances(vertices[triangles].mean(axis=1), bones), axis=1)
    if np.array_equal(owners, current):
        return []
    operations: list[EditOperation] = []
    for index, bone in enumerate(bones):
        mine = triangles[owners == index]
        skin = next((component for component in bone.obj.components if component.kind == "skin"), None)
        if len(mine) < 4:
            if skin is not None and bone.skin is not None:
                operations.append(RemoveComponent(op="remove_component", object=bone.obj.id, component=skin.id))
            continue
        local = (vertices - bone.position) @ bone.rotation
        info = skins.add(project.id, f"{bone.obj.id}.glb", write_glb(Mesh(local, mine), _COLOR))
        if info.id == bone.skin:
            continue
        value = AssetValue(type="asset", value=info.id)
        if skin is None:
            component = default_component("skin", "skin")
            component.properties["asset"] = value
            operations.append(AddComponent(op="add_component", object=bone.obj.id, component=component))
        else:
            prop = SetProperty(op="set_property", object=bone.obj.id, component=skin.id, property="asset", value=value)
            operations.append(prop)
    return operations
