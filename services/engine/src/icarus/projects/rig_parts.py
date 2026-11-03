"""The physical body an auto-rig builds from a fitted skeleton: the humanoid of the body vault's layout with every
limb measured on the mesh, standing at rest with its arms down, and each part's piece of the mesh in its own frame."""

import math
from dataclasses import dataclass

import numpy as np

from icarus.library.parts import Part, Raw, hinge, motor, solid
from icarus.projects.mesh_files import Mesh
from icarus.projects.rig_fit import RigFit, Segment

DENSITY = 985.0
SHELL = "#e8e2d6"
JOINT = "#8b9098"
FOOT = "#2b2d31"
# The vault humanoid these forces hold up, in kg, and its motors in N·m: they scale with mass to the 4/3.
_VAULT_MASS = 52.0
_FORCES = {"chest": 100, "head": 20, "upper_arm": 60, "forearm": 40, "thigh": 150, "shin": 150, "foot": 60}
_LIMITS = {
    "chest": (-30, 45),
    "head": (-30, 30),
    "upper_arm": (-90, 90),
    "forearm": (-120, 0),
    "thigh": (-60, 60),
    "shin": (0, 120),
    "foot": (-45, 45),
}
# Space kept between parts that hang side by side, in metres, so nothing touches at rest.
_GAP = 0.012
_LIMBS = ("upper_arm", "forearm", "thigh", "shin")


@dataclass(frozen=True)
class BuiltPart:
    part: Part
    segment: str
    # Rotation from the part's frame to the mesh's and the mesh point at the part's center.
    frame: np.ndarray
    center: np.ndarray


def _radius(fit: RigFit, index: int, low: float, high: float) -> float:
    segment = fit.segments[index]
    owned = fit.mesh.triangles[fit.owners == index]
    if len(owned) == 0:
        return low
    points = fit.mesh.vertices[np.unique(owned)]
    axis = segment.end - segment.start
    length = float(np.dot(axis, axis)) or 1.0
    along = np.clip((points - segment.start) @ axis / length, 0.0, 1.0)
    distances = np.linalg.norm(points - (segment.start + along[:, None] * axis), axis=1)
    return float(np.clip(np.percentile(distances, 80), low, high))


def _extent(fit: RigFit, index: int, axis: int, low: float, high: float) -> float:
    owned = fit.mesh.triangles[fit.owners == index]
    if len(owned) == 0:
        return low
    values = fit.mesh.vertices[np.unique(owned), axis]
    return float(np.clip(np.percentile(values, 95) - np.percentile(values, 5), low, high))


def limb_frame(segment: Segment) -> np.ndarray:
    """Columns are the part's x, y and z in the mesh: z runs from the far end back to the joint."""
    z = segment.start - segment.end
    z = z / (np.linalg.norm(z) or 1.0)
    x = np.array([1.0, 0.0, 0.0]) - z[0] * z
    if np.linalg.norm(x) < 1e-6:
        x = np.cross(np.array([0.0, 1.0, 0.0]), z)
    x /= np.linalg.norm(x)
    return np.column_stack([x, np.cross(z, x), z])


def _capsule_size(radius: float, length: float) -> tuple[float, float, float]:
    return (round(2 * radius, 4), round(2 * radius, 4), round(length, 4))


def _mass(volume: float) -> float:
    return round(max(DENSITY * volume, 0.2), 3)


def _capsule_volume(radius: float, length: float) -> float:
    return math.pi * radius**2 * length + 4 / 3 * math.pi * radius**3


def build_parts(fit: RigFit) -> list[BuiltPart]:
    """Every part of the fitted humanoid with its joint, motor and senses, standing on z = 0."""
    tall = fit.height
    index = {segment.name: number for number, segment in enumerate(fit.segments)}
    seg = {segment.name: segment for segment in fit.segments}

    def length(name: str) -> float:
        return float(np.linalg.norm(seg[name].end - seg[name].start))

    radius = {
        kind: max(_radius(fit, index[f"{kind}_left"], 0.012 * tall, 0.08 * tall), 0.012)
        for kind in ("upper_arm", "forearm", "thigh", "shin")
    }
    limb = {kind: max(length(f"{kind}_left"), 2.2 * radius[kind]) for kind in radius}
    pelvis_height = length("pelvis")
    chest_height = length("chest")
    head_size = _extent(fit, index["head"], 2, 0.08 * tall, 0.2 * tall)
    foot_height = max(float(seg["foot_left"].start[2]), 0.02)
    foot_length = max(float(np.linalg.norm(seg["foot_left"].end[:2] - seg["foot_left"].start[:2])) * 2, 0.08 * tall)
    foot_width = max(2 * _radius(fit, index["foot_left"], 0.02 * tall, 0.05 * tall), 0.04)
    hip_y = max(fit.hip_y, radius["thigh"] + _GAP / 2)
    chest_half = _extent(fit, index["chest"], 1, 0.1 * tall, 0.3 * tall) / 2
    pelvis_half = _extent(fit, index["pelvis"], 1, 0.1 * tall, 0.3 * tall) / 2
    pelvis_half = max(pelvis_half, hip_y)
    shoulder_y = max(fit.shoulder_y, chest_half + radius["upper_arm"] + _GAP, pelvis_half + radius["forearm"] + _GAP)
    shoulder_y = max(shoulder_y, hip_y + radius["thigh"] + radius["forearm"] + _GAP)
    depth = {name: _extent(fit, index[name], 0, 0.08 * tall, 0.25 * tall) for name in ("pelvis", "chest")}
    total = (
        DENSITY * (2 * pelvis_half * depth["pelvis"] * pelvis_height + 2 * chest_half * depth["chest"] * chest_height)
        + DENSITY * 4 / 3 * math.pi * (head_size / 2) ** 3
        + 2 * DENSITY * sum(_capsule_volume(radius[kind], limb[kind]) for kind in radius)
    )
    scale = (max(total, 1.0) / _VAULT_MASS) ** (4 / 3)

    def joint(kind: str, anchor: tuple[float, float, float]) -> dict[str, dict[str, Raw]]:
        force = round(max(_FORCES[kind] * scale, 2.0), 1)
        return {"joint": hinge((0, 1, 0), _LIMITS[kind], anchor), "motor": motor("position", force)}

    crotch = limb["thigh"] + limb["shin"] + foot_height
    pelvis_z = crotch + pelvis_height / 2
    upright = np.eye(3)
    built: list[BuiltPart] = []
    pelvis_size = (round(depth["pelvis"], 4), round(2 * pelvis_half, 4), round(pelvis_height, 4))
    pelvis_mass = _mass(pelvis_size[0] * pelvis_size[1] * pelvis_size[2])
    pelvis = solid(
        "pelvis", "Pelvis", None, (0, 0, round(pelvis_z, 4)), "box", pelvis_size, pelvis_mass, SHELL,
        extra={"balance": {}}, style="shell",
    )  # fmt: skip
    built.append(BuiltPart(pelvis, "pelvis", upright, (seg["pelvis"].start + seg["pelvis"].end) / 2))
    chest_size = (round(depth["chest"], 4), round(2 * chest_half, 4), round(chest_height, 4))
    chest_offset = (pelvis_height + chest_height) / 2
    chest = solid(
        "chest", "Chest", "pelvis", (0, 0, round(chest_offset, 4)), "box", chest_size,
        _mass(chest_size[0] * chest_size[1] * chest_size[2]), SHELL,
        extra=joint("chest", (0, 0, round(-chest_height / 2, 4))), style="shell",
    )  # fmt: skip
    built.append(BuiltPart(chest, "chest", upright, (seg["chest"].start + seg["chest"].end) / 2))
    head_radius = head_size / 2
    head = solid(
        "head", "Head", "chest", (0, 0, round(chest_height / 2 + head_radius, 4)), "sphere",
        (round(head_size, 4), round(head_size, 4), round(head_size, 4)), _mass(4 / 3 * math.pi * head_radius**3), SHELL,
        extra=joint("head", (0, 0, round(-head_radius, 4))), style="shell",
    )  # fmt: skip
    built.append(BuiltPart(head, "head", upright, seg["head"].start + np.array([0, 0, head_radius])))
    shoulder_z = chest_height / 2 - 0.05 * tall
    for side, sign, label in (("left", 1.0, "Left"), ("right", -1.0, "Right")):
        upper, fore = limb["upper_arm"], limb["forearm"]
        arm = solid(
            f"upper_arm_{side}", f"{label} upper arm", "chest",
            (0, round(sign * shoulder_y, 4), round(shoulder_z - upper / 2, 4)), "capsule",
            _capsule_size(radius["upper_arm"], upper),
            _mass(_capsule_volume(radius["upper_arm"], upper)), JOINT,
            extra=joint("upper_arm", (0, 0, round(upper / 2, 4))), style="joint",
        )  # fmt: skip
        forearm = solid(
            f"forearm_{side}", f"{label} forearm", arm.id, (0, 0, round(-(upper + fore) / 2, 4)), "capsule",
            _capsule_size(radius["forearm"], fore),
            _mass(_capsule_volume(radius["forearm"], fore)), JOINT,
            extra=joint("forearm", (0, 0, round(fore / 2, 4))), style="joint",
        )  # fmt: skip
        thigh_length, shin_length = limb["thigh"], limb["shin"]
        thigh = solid(
            f"thigh_{side}", f"{label} thigh", "pelvis",
            (0, round(sign * hip_y, 4), round(-pelvis_height / 2 - thigh_length / 2, 4)), "capsule",
            _capsule_size(radius["thigh"], thigh_length),
            _mass(_capsule_volume(radius["thigh"], thigh_length)), JOINT,
            extra=joint("thigh", (0, 0, round(thigh_length / 2, 4))), style="joint",
        )  # fmt: skip
        shin = solid(
            f"shin_{side}", f"{label} shin", thigh.id, (0, 0, round(-(thigh_length + shin_length) / 2, 4)),
            "capsule", _capsule_size(radius["shin"], shin_length),
            _mass(_capsule_volume(radius["shin"], shin_length)), JOINT,
            extra=joint("shin", (0, 0, round(shin_length / 2, 4))), style="joint",
        )  # fmt: skip
        forward = round(foot_length * 0.2, 4)
        foot_extra = joint("foot", (-forward, 0, round(foot_height / 2, 4)))
        foot_extra["touch"] = {"radius": round(max(foot_width, 0.03), 4)}
        foot = solid(
            f"foot_{side}", f"{label} foot", shin.id, (forward, 0, round(-shin_length / 2 - foot_height / 2, 4)),
            "box", (round(foot_length, 4), round(foot_width, 4), round(foot_height, 4)),
            _mass(foot_length * foot_width * foot_height), FOOT, extra=foot_extra, style="shell",
        )  # fmt: skip
        for part, kind in ((arm, "upper_arm"), (forearm, "forearm"), (thigh, "thigh"), (shin, "shin")):
            segment = seg[f"{kind}_{side}"]
            built.append(BuiltPart(part, segment.name, limb_frame(segment), (segment.start + segment.end) / 2))
        foot_segment = seg[f"foot_{side}"]
        built.append(BuiltPart(foot, foot_segment.name, upright, (foot_segment.start + foot_segment.end) / 2))
    return built


def part_mesh(fit: RigFit, segment_index: int, built: BuiltPart) -> Mesh | None:
    """The triangles that follow this part, in the part's own frame; None when too few follow it to draw."""
    triangles = fit.mesh.triangles[fit.owners == segment_index]
    if len(triangles) < 4:
        return None
    local = (fit.mesh.vertices - built.center) @ built.frame
    return Mesh(local, triangles)


def rigid_part(fit: RigFit) -> Part:
    """The whole mesh as one box part standing on z = 0, when the fit found no limbs."""
    low, high = fit.mesh.bounds
    size = tuple(round(max(float(value), 0.02), 4) for value in high - low)
    volume = size[0] * size[1] * size[2]
    center = (low + high) / 2
    position = (round(float(center[0]), 4), round(float(center[1]), 4), round(size[2] / 2, 4))
    return solid("model", "Model", None, position, "box", (size[0], size[1], size[2]), _mass(volume * 0.5), SHELL)
