"""A layout while a recipe builds it: grouped objects in the layout's own frame, and the floor plan that checks the
path from the start to the goal stays open."""

import math
import re
from collections import deque
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from icarus.contracts.objects import ObjectSpec
from icarus.library.layout_pieces import LOOKS, element
from icarus.library.parts import Part

Point = tuple[float, float]
# Floor patches and paint sit a few millimetres proud of the ground so they never flicker against it.
FLOOR = 0.005
PAINT = 0.01
MAX_CELLS = 60_000


class LayoutError(ValueError):
    """Parameters that cannot make the layout, said so the person or the model can change them."""


@dataclass(frozen=True)
class Rect:
    x0: float
    y0: float
    x1: float
    y1: float

    @staticmethod
    def around(center: Point, width: float, depth: float, yaw: float = 0) -> "Rect":
        """The axis-aligned box that holds a footprint turned by yaw degrees."""
        turn = math.radians(yaw)
        half_x = (abs(math.cos(turn)) * width + abs(math.sin(turn)) * depth) / 2
        half_y = (abs(math.sin(turn)) * width + abs(math.cos(turn)) * depth) / 2
        return Rect(center[0] - half_x, center[1] - half_y, center[0] + half_x, center[1] + half_y)

    def grown(self, margin: float) -> "Rect":
        return Rect(self.x0 - margin, self.y0 - margin, self.x1 + margin, self.y1 + margin)

    def overlaps(self, other: "Rect") -> bool:
        return self.x0 < other.x1 and other.x0 < self.x1 and self.y0 < other.y1 and other.y0 < self.y1

    def distance_to(self, point: Point) -> float:
        dx = max(self.x0 - point[0], 0.0, point[0] - self.x1)
        dy = max(self.y0 - point[1], 0.0, point[1] - self.y1)
        return math.hypot(dx, dy)


class FloorPlan:
    """Which cells of the ground a body of a given half width can stand on, and whether two places connect."""

    def __init__(self, bounds: Rect, clearance: float):
        area = (bounds.x1 - bounds.x0) * (bounds.y1 - bounds.y0)
        self.cell = max(0.2, math.sqrt(area / MAX_CELLS))
        self.bounds = bounds
        self.clearance = clearance
        self.columns = max(1, math.ceil((bounds.x1 - bounds.x0) / self.cell))
        self.rows = max(1, math.ceil((bounds.y1 - bounds.y0) / self.cell))
        self.blocked = np.zeros((self.rows, self.columns), dtype=np.int32)
        self._path: set[tuple[int, int]] = set()

    def _slice(self, rect: Rect) -> tuple[slice, slice]:
        grown = rect.grown(self.clearance)
        c0 = max(0, math.floor((grown.x0 - self.bounds.x0) / self.cell))
        c1 = min(self.columns, math.ceil((grown.x1 - self.bounds.x0) / self.cell))
        r0 = max(0, math.floor((grown.y0 - self.bounds.y0) / self.cell))
        r1 = min(self.rows, math.ceil((grown.y1 - self.bounds.y0) / self.cell))
        return slice(r0, max(r0, r1)), slice(c0, max(c0, c1))

    def cell_of(self, point: Point) -> tuple[int, int]:
        column = min(self.columns - 1, max(0, int((point[0] - self.bounds.x0) / self.cell)))
        row = min(self.rows - 1, max(0, int((point[1] - self.bounds.y0) / self.cell)))
        return row, column

    def mark(self, rect: Rect, amount: int = 1) -> None:
        rows, columns = self._slice(rect)
        self.blocked[rows, columns] += amount

    def path(self, start: Point, goal: Point) -> list[tuple[int, int]] | None:
        """The cells of a shortest open path, or None; a start or goal inside an obstacle has none."""
        first, last = self.cell_of(start), self.cell_of(goal)
        if self.blocked[first] or self.blocked[last]:
            return None
        came: dict[tuple[int, int], tuple[int, int] | None] = {first: None}
        queue = deque([first])
        while queue:
            current = queue.popleft()
            if current == last:
                cells = []
                step: tuple[int, int] | None = current
                while step is not None:
                    cells.append(step)
                    step = came[step]
                return cells[::-1]
            row, column = current
            for near in ((row + 1, column), (row - 1, column), (row, column + 1), (row, column - 1)):
                if near in came or not (0 <= near[0] < self.rows and 0 <= near[1] < self.columns):
                    continue
                if self.blocked[near]:
                    continue
                came[near] = current
                queue.append(near)
        return None

    def keeps_open(self, rect: Rect, start: Point, goal: Point) -> bool:
        """Marks the rect when the path survives it; a rect off the last path found cannot close it."""
        rows, columns = self._slice(rect)
        touches = any(rows.start <= r < rows.stop and columns.start <= c < columns.stop for r, c in self._path)
        self.mark(rect)
        if self._path and not touches:
            return True
        found = self.path(start, goal)
        if found is None:
            self.mark(rect, -1)
            return False
        self._path = set(found)
        return True


@dataclass
class Site:
    """The objects a recipe lays out, grouped by area under one root, in the layout's own frame (metres)."""

    prefix: str
    title: str
    start: Point = (0.0, 0.0)
    goal: Point | None = None
    goal_radius: float = 1.0
    goal_height: float = 0.0
    goal_name: str = "Goal"
    objects: list[ObjectSpec] = field(default_factory=list)
    footprints: list[Rect] = field(default_factory=list)
    notes: dict[str, Any] = field(default_factory=dict)
    _centers: dict[str, Point] = field(default_factory=dict)
    _counts: dict[str, int] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.objects.append(Part(self.prefix, self.title, None, {"transform": {}}).spec())
        self._centers[self.prefix] = (0.0, 0.0)

    def group(self, key: str, name: str, center: Point = (0.0, 0.0)) -> str:
        """A transform-only object that holds one area, so the area moves and hides as one."""
        group_id = self._id(key)
        position = (center[0], center[1], 0.0)
        self.objects.append(Part(group_id, name, self.prefix, {"transform": {"position": position}}).spec())
        self._centers[group_id] = center
        return group_id

    def _id(self, key: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", "_", key.lower()).strip("_")
        return f"{self.prefix}_{slug}"[:64]

    def add(
        self,
        kind: str,
        group: str,
        center: Point,
        size: tuple[float, float, float],
        *,
        name: str | None = None,
        base: float = 0.0,
        yaw: float = 0.0,
        tilt: float = 0.0,
        color: str | None = None,
        surface: str | None = None,
        blocks: bool | None = None,
    ) -> str:
        """One element with its bottom at base; blocks says whether the path check must go around it."""
        look = LOOKS[kind]
        count = self._counts[kind] = self._counts.get(kind, 0) + 1
        object_id = self._id(f"{kind}_{count}")
        origin = self._centers[group]
        position = (center[0] - origin[0], center[1] - origin[1], base + size[2] / 2)
        label = name or f"{look.label} {count}"
        self.objects.append(
            element(
                kind,
                object_id,
                label,
                group,
                position,
                size,
                rotation=(0, tilt, yaw),
                color=color,
                surface=surface,
            )
        )
        if look.solid if blocks is None else blocks:
            self.footprints.append(Rect.around(center, size[0], size[1], yaw))
        return object_id

    def bounds(self, margin: float = 3.0) -> Rect:
        points = [self.start, *([self.goal] if self.goal else [])]
        xs = [x for rect in self.footprints for x in (rect.x0, rect.x1)] + [p[0] for p in points]
        ys = [y for rect in self.footprints for y in (rect.y0, rect.y1)] + [p[1] for p in points]
        return Rect(min(xs) - margin, min(ys) - margin, max(xs) + margin, max(ys) + margin)

    def floor_plan(self, clearance: float, bounds: Rect | None = None) -> FloorPlan:
        plan = FloorPlan(bounds or self.bounds(), clearance)
        for rect in self.footprints:
            plan.mark(rect)
        return plan
