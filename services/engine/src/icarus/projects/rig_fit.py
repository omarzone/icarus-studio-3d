"""A deterministic geometric fit of a humanoid skeleton to a standing mesh: it reads the legs, the crotch, the
torso width and where the arms reach from horizontal slices of the vertices, and places the joints with body
proportions where the mesh does not say. It does not find fingers, toes, a tail or bent poses, and treats any mesh
without two separate legs as one rigid part."""

from dataclasses import dataclass

import numpy as np

from icarus.projects.mesh_files import Mesh

# A model whose height reads as metres within this range keeps its size; anything else stands this tall.
METRES = (0.2, 5.0)
DEFAULT_HEIGHT = 1.7
_BIN = 0.01
# Shares of the height where proportions place what slices cannot see.
_SHOULDER = 0.81
_NECK = 0.86
_ANKLE = 0.045
_WAIST_ABOVE_CROTCH = 0.12
_LEG_BAND = (0.12, 0.32)
_FEW_ARM_VERTICES = 0.005
_SAMPLES = 20_000
# Radius each segment is expected to have, as a share of the height, to weigh how far a vertex is from it.
_PRIOR_RADIUS = {
    "pelvis": 0.09,
    "chest": 0.1,
    "head": 0.06,
    "upper_arm": 0.028,
    "forearm": 0.024,
    "thigh": 0.045,
    "shin": 0.035,
    "foot": 0.03,
}


@dataclass(frozen=True)
class Segment:
    name: str
    # Proximal and distal joint positions on the normalized mesh (feet at z = 0, facing +x, left at +y).
    start: np.ndarray
    end: np.ndarray
    kind: str


@dataclass(frozen=True)
class RigFit:
    """A standing mesh normalized to the engine's frame, with its skeleton when it has one."""

    mesh: Mesh
    height: float
    humanoid: bool
    segments: list[Segment]
    # The segment each triangle follows, by index into `segments`; empty for one rigid part.
    owners: np.ndarray
    # Half the width of the torso, and the lateral distance of each hip and shoulder.
    torso_half_width: float = 0.0
    hip_y: float = 0.0
    shoulder_y: float = 0.0


def normalized(mesh: Mesh, height: float | None) -> tuple[Mesh, float]:
    """The mesh turned so its wider side runs left to right (facing +x), scaled to its standing height and standing on
    z = 0, centered over the origin."""
    vertices = mesh.vertices.copy()
    extent = vertices.max(axis=0) - vertices.min(axis=0)
    if extent[0] > extent[1]:
        # Its wider side runs along x, so it faces along y; a quarter turn makes it face +x.
        vertices = vertices[:, [1, 0, 2]] * np.array([-1.0, 1.0, 1.0])
    raw = float(vertices[:, 2].max() - vertices[:, 2].min())
    target = height if height is not None else (raw if METRES[0] <= raw <= METRES[1] else DEFAULT_HEIGHT)
    vertices *= target / raw if raw > 0 else 1.0
    low, high = vertices.min(axis=0), vertices.max(axis=0)
    vertices -= np.array([(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, low[2]])
    return Mesh(vertices, mesh.triangles), target


def _runs(values: np.ndarray, height: float) -> list[tuple[float, float]]:
    """Occupied stretches of a coordinate, sliced in bins of 1% of the height."""
    if len(values) == 0:
        return []
    step = _BIN * height
    bins = np.unique(np.floor(values / step).astype(int))
    runs: list[tuple[float, float]] = []
    start = previous = int(bins[0])
    for current in (int(item) for item in bins[1:]):
        if current > previous + 1:
            runs.append((start * step, (previous + 1) * step))
            start = current
        previous = current
    runs.append((start * step, (previous + 1) * step))
    return runs


def _band(vertices: np.ndarray, low: float, high: float) -> np.ndarray:
    return vertices[(vertices[:, 2] >= low) & (vertices[:, 2] < high), 1]


def _legs(vertices: np.ndarray, height: float) -> tuple[float, float] | None:
    """The lateral middle of the left and right leg, when the lower body splits into two."""
    runs = _runs(_band(vertices, _LEG_BAND[0] * height, _LEG_BAND[1] * height), height)
    left = [run for run in runs if run[0] > 0]
    right = [run for run in runs if run[1] < 0]
    if not left or not right or any(run[0] <= 0 <= run[1] for run in runs):
        return None
    widest = max(left, key=lambda run: run[1] - run[0]), max(right, key=lambda run: run[1] - run[0])
    return (widest[0][0] + widest[0][1]) / 2, (widest[1][0] + widest[1][1]) / 2


def _crotch(vertices: np.ndarray, height: float) -> float:
    """The lowest height where the body is one piece across the middle."""
    for share in np.arange(_LEG_BAND[1], 0.65, _BIN):
        runs = _runs(_band(vertices, share * height, (share + _BIN) * height), height)
        if any(run[0] <= 0 <= run[1] for run in runs):
            return float(share * height)
    return 0.48 * height


def _torso_half_width(vertices: np.ndarray, crotch: float, height: float) -> float:
    middle = crotch + 0.5 * (_SHOULDER * height - crotch)
    runs = _runs(_band(vertices, middle - _BIN * height, middle + _BIN * height), height)
    center = next((run for run in runs if run[0] <= 0 <= run[1]), None)
    half = max(abs(center[0]), abs(center[1])) if center else 0.12 * height
    return float(np.clip(half, 0.07 * height, 0.14 * height))


def _hand(vertices: np.ndarray, shoulder: np.ndarray, side: float, crotch: float, torso: float) -> np.ndarray:
    """Where the arm on one side reaches farthest from its shoulder; at the hip beside the body when it hides."""
    arm = vertices[(vertices[:, 2] > crotch) & (side * vertices[:, 1] > torso)]
    if len(arm) < _FEW_ARM_VERTICES * len(vertices):
        return np.array([0.0, side * (torso + 0.03 * shoulder[2] / _SHOULDER), crotch])
    return arm[int(np.argmax(np.linalg.norm(arm - shoulder, axis=1)))]


def _distance(points: np.ndarray, segment: Segment) -> np.ndarray:
    axis = segment.end - segment.start
    length = float(np.dot(axis, axis))
    if length < 1e-12:
        return np.linalg.norm(points - segment.start, axis=1)
    along = np.clip((points - segment.start) @ axis / length, 0.0, 1.0)
    return np.linalg.norm(points - (segment.start + along[:, None] * axis), axis=1)


def assign(points: np.ndarray, segments: list[Segment], radii: list[float]) -> np.ndarray:
    """Each point follows the segment it is nearest to, measured in that segment's radii."""
    weighed = np.stack([_distance(points, segment) / radius for segment, radius in zip(segments, radii, strict=True)])
    return np.argmin(weighed, axis=0)


def _skeleton(height: float, crotch: float, hips: tuple[float, float], torso: float, hands: list[np.ndarray]):
    point = np.array
    shoulder_z, neck_z, ankle_z = _SHOULDER * height, _NECK * height, _ANKLE * height
    waist_z = crotch + _WAIST_ABOVE_CROTCH * height
    shoulder_y = torso * 0.92
    segments = [
        Segment("pelvis", point([0, 0, crotch]), point([0, 0, waist_z]), "pelvis"),
        Segment("chest", point([0, 0, waist_z]), point([0, 0, neck_z]), "chest"),
        Segment("head", point([0, 0, neck_z]), point([0, 0, height]), "head"),
    ]
    for side, sign, hand in (("left", 1.0, hands[0]), ("right", -1.0, hands[1])):
        shoulder = point([0, sign * shoulder_y, shoulder_z])
        elbow = (shoulder + hand) / 2
        segments += [
            Segment(f"upper_arm_{side}", shoulder, elbow, "upper_arm"),
            Segment(f"forearm_{side}", elbow, hand, "forearm"),
        ]
    for side, hip_y in (("left", hips[0]), ("right", hips[1])):
        hip = point([0, hip_y, crotch])
        ankle = point([0, hip_y, ankle_z])
        knee = (hip + ankle) / 2
        toe = point([0.06 * height, hip_y, 0])
        segments += [
            Segment(f"thigh_{side}", hip, knee, "thigh"),
            Segment(f"shin_{side}", knee, ankle, "shin"),
            Segment(f"foot_{side}", ankle, toe, "foot"),
        ]
    return segments, shoulder_y


def surface_points(mesh: Mesh, count: int = _SAMPLES) -> np.ndarray:
    """Points spread evenly over the surface by area, the same every time, so big flat triangles count by size."""
    corners = mesh.vertices[mesh.triangles]
    areas = np.linalg.norm(np.cross(corners[:, 1] - corners[:, 0], corners[:, 2] - corners[:, 0]), axis=1)
    total = float(areas.sum())
    if total <= 0:
        return mesh.vertices
    generator = np.random.default_rng(0)
    chosen = generator.choice(len(areas), size=count, p=areas / total)
    a, b = generator.random(count), generator.random(count)
    flip = a + b > 1
    a[flip], b[flip] = 1 - a[flip], 1 - b[flip]
    picked = corners[chosen]
    points = picked[:, 0] + a[:, None] * (picked[:, 1] - picked[:, 0]) + b[:, None] * (picked[:, 2] - picked[:, 0])
    return np.concatenate([points, mesh.vertices])


def fit_rig(mesh: Mesh, height: float | None = None) -> RigFit:
    """Normalize the mesh and fit a humanoid skeleton when it has two legs; otherwise one rigid part."""
    standing, tall = normalized(mesh, height)
    vertices = surface_points(standing)
    hips = _legs(vertices, tall)
    if hips is None:
        return RigFit(standing, tall, False, [], np.zeros(0, dtype=np.int64))
    crotch = float(np.clip(_crotch(vertices, tall), 0.3 * tall, 0.6 * tall))
    torso = _torso_half_width(vertices, crotch, tall)
    shoulders = [np.array([0.0, sign * torso * 0.92, _SHOULDER * tall]) for sign in (1.0, -1.0)]
    hands = [_hand(vertices, shoulders[0], 1.0, crotch, torso), _hand(vertices, shoulders[1], -1.0, crotch, torso)]
    segments, shoulder_y = _skeleton(tall, crotch, hips, torso, hands)
    centroids = standing.vertices[standing.triangles].mean(axis=1)
    owners = assign(centroids, segments, [_PRIOR_RADIUS[segment.kind] * tall for segment in segments])
    hip_y = float(min(abs(hips[0]), abs(hips[1])))
    return RigFit(standing, tall, True, segments, owners, torso, hip_y, shoulder_y)
