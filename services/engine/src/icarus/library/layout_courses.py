"""Layouts to get through: a maze, a forest or park, an obstacle course and steps up to platforms."""

import math
import random
from collections import deque

from icarus.library.layout_params import Forest, Maze, ObstacleCourse, TerrainSteps
from icarus.library.layout_pieces import leafy_tree
from icarus.library.layout_site import FLOOR, PAINT, LayoutError, Point, Rect, Site

Cell = tuple[int, int]
MAZE_WALL = 0.15
TRIES = 25


def _carve(rng: random.Random, columns: int, rows: int, start: Cell) -> set[frozenset[Cell]]:
    """A perfect maze by depth-first carving: exactly one way between any two cells."""
    passages: set[frozenset[Cell]] = set()
    seen, stack = {start}, [start]
    while stack:
        x, y = stack[-1]
        options = [
            cell
            for cell in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
            if 0 <= cell[0] < columns and 0 <= cell[1] < rows and cell not in seen
        ]
        if not options:
            stack.pop()
            continue
        nxt = rng.choice(options)
        passages.add(frozenset((stack[-1], nxt)))
        seen.add(nxt)
        stack.append(nxt)
    return passages


def cell_route(passages: set[frozenset[Cell]], start: Cell, goal: Cell) -> list[Cell] | None:
    """The shortest way through the maze's open passages, cell by cell, or None."""
    came: dict[Cell, Cell | None] = {start: None}
    queue = deque([start])
    while queue:
        current = queue.popleft()
        if current == goal:
            route: list[Cell] = []
            step: Cell | None = current
            while step is not None:
                route.append(step)
                step = came[step]
            return route[::-1]
        x, y = current
        for near in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if near not in came and frozenset((current, near)) in passages:
                came[near] = current
                queue.append(near)
    return None


def _runs(flags: list[bool]) -> list[tuple[int, int]]:
    """Consecutive true stretches as (first, last) indices, so a straight wall is one object."""
    runs: list[tuple[int, int]] = []
    begin: int | None = None
    for index, flag in enumerate([*flags, False]):
        if flag and begin is None:
            begin = index
        elif not flag and begin is not None:
            runs.append((begin, index - 1))
            begin = None
    return runs


def maze(params: Maze, prefix: str) -> Site:
    rng = random.Random(params.seed)
    columns, rows, size = params.cells_x, params.cells_y, params.cell_size
    start = params.start_cell or (0, 0)
    goal = params.goal_cell or (columns - 1, rows - 1)
    if start == goal:
        raise LayoutError("the start and goal cells are the same; a maze needs at least two cells between them")
    passages = _carve(rng, columns, rows, start)
    pairs = [pair for x in range(columns) for y in range(rows) for pair in (((x, y), (x + 1, y)), ((x, y), (x, y + 1)))]
    closed = [pair for pair in pairs if pair[1][0] < columns and pair[1][1] < rows and frozenset(pair) not in passages]
    rng.shuffle(closed)
    passages |= {frozenset(pair) for pair in closed[: round(params.loops * len(closed))]}
    route = cell_route(passages, start, goal)
    assert route is not None, "a carved maze always connects every cell"
    site = Site(prefix, "Maze" if rows > 1 else "Corridor")
    middle = (columns * size / 2, rows * size / 2)
    site.start = ((start[0] + 0.5) * size, (start[1] + 0.5) * size)
    site.goal = ((goal[0] + 0.5) * size, (goal[1] + 0.5) * size)
    site.goal_radius, site.goal_name = max(0.1, min(0.8, size / 2 - 0.3)), "Maze exit"
    site.add(
        "floor",
        site.group("floor", "Floor", middle),
        middle,
        (columns * size, rows * size, FLOOR),
        surface="concrete",
        color="#7b7f86",
    )
    walls = site.group("walls", "Walls", middle)
    for y in range(rows + 1):
        flags = [y in (0, rows) or frozenset(((x, y - 1), (x, y))) not in passages for x in range(columns)]
        for a, b in _runs(flags):
            length = (b - a + 1) * size + MAZE_WALL
            site.add("wall", walls, ((a + b + 1) * size / 2, y * size), (length, MAZE_WALL, params.wall_height))
    for x in range(columns + 1):
        flags = [x in (0, columns) or frozenset(((x - 1, y), (x, y))) not in passages for y in range(rows)]
        for a, b in _runs(flags):
            length = (b - a + 1) * size - MAZE_WALL
            site.add("wall", walls, (x * size, (a + b + 1) * size / 2), (MAZE_WALL, length, params.wall_height))
    site.notes = {"start_cell": list(start), "goal_cell": list(goal), "cells_on_route": len(route)}
    return site


def _segment_distance(point: Point, a: Point, b: Point) -> float:
    ax, ay = b[0] - a[0], b[1] - a[1]
    length = ax * ax + ay * ay
    t = 0.0 if length == 0 else max(0.0, min(1.0, ((point[0] - a[0]) * ax + (point[1] - a[1]) * ay) / length))
    return math.hypot(point[0] - a[0] - t * ax, point[1] - a[1] - t * ay)


def _route_distance(point: Point, route: list[Point]) -> float:
    return min(_segment_distance(point, a, b) for a, b in zip(route, route[1:], strict=False))


def forest(params: Forest, prefix: str) -> Site:
    rng = random.Random(params.seed)
    width, depth = params.size_x, params.size_y
    route: list[Point] = [(0.0, depth / 2)]
    route += [(width * k / (params.bends + 1), rng.uniform(0.25, 0.75) * depth) for k in range(1, params.bends + 1)]
    route.append((width, rng.uniform(0.3, 0.7) * depth))
    (ax, ay), (bx, by) = route[-2], route[-1]
    share = (width - 2 - ax) / (bx - ax)
    site = Site(prefix, "Park" if params.park else "Forest")
    site.start, site.goal = route[0], (width - 2, ay + share * (by - ay))
    site.goal_radius, site.goal_name = min(1.2, params.path_width / 2), "End of the path"
    middle = (width / 2, depth / 2)
    ground = site.group("ground", "Ground", middle)
    site.add(
        "floor", ground, middle, (width, depth, FLOOR), surface="grass", color="#5b8a45" if params.park else "#3e5f2e"
    )
    path = site.group("path", "Path", middle)
    for index, (a, b) in enumerate(zip(route, route[1:], strict=False)):
        length = math.hypot(b[0] - a[0], b[1] - a[1]) + params.path_width
        yaw = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
        center = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        color = "#c9bfae" if params.park else "#8c7456"
        site.add(
            "floor",
            path,
            center,
            (length, params.path_width, FLOOR),
            base=FLOOR * (1 + index % 2),
            yaw=yaw,
            color=color,
            name=f"Path {index + 1}",
        )
    band = params.path_width / 2
    keep = [site.start, site.goal]
    placed: list[Rect] = []
    plants = site.group("trees", "Trees and rocks", middle)
    tree_count = round(params.trees * width * depth / (40 if params.park else 14))
    rock_count = round(params.rocks * width * depth / 40)
    for kind, count in (("tree", tree_count), ("rock", rock_count)):
        for _ in range(count):
            for _ in range(TRIES):
                size = rng.uniform(0.9, 1.7) if kind == "tree" else rng.uniform(0.5, 1.4)
                spot = (rng.uniform(size, width - size), rng.uniform(size, depth - size))
                yaw = 0.0 if kind == "tree" else rng.uniform(0, 90)
                rect = Rect.around(spot, size, size * (1 if kind == "tree" else 0.8), yaw)
                if _route_distance(spot, route) < band + size + params.clearance * 0.5:
                    continue
                if any(rect.overlaps(other.grown(0.3)) for other in placed) or any(
                    rect.distance_to(p) < params.clearance + 1.5 for p in keep
                ):
                    continue
                placed.append(rect)
                if kind == "tree":
                    trunk, ornament = leafy_tree(rng, rng.uniform(4, 8))
                    site.add(kind, plants, spot, trunk, ornament=ornament)
                else:
                    site.add(kind, plants, spot, (size, size * 0.8, size * rng.uniform(0.4, 0.8)), yaw=yaw)
                break
    if params.park:
        _park_furniture(site, route, band)
    site.notes = {"trees_and_rocks": len(placed), "route": [[round(x, 2), round(y, 2)] for x, y in route]}
    return site


def _park_furniture(site: Site, route: list[Point], band: float) -> None:
    """Benches on one side of the path and lamps on the other, never inside its band."""
    group = site.group(
        "park", "Benches and lamps", ((route[0][0] + route[-1][0]) / 2, (route[0][1] + route[-1][1]) / 2)
    )
    for a, b in zip(route, route[1:], strict=False):
        length = math.hypot(b[0] - a[0], b[1] - a[1])
        along = ((b[0] - a[0]) / length, (b[1] - a[1]) / length)
        left = (-along[1], along[0])
        yaw = math.degrees(math.atan2(along[1], along[0]))
        for kind, side, every, size in (("bench", 1, 10.0, (1.6, 0.5, 0.45)), ("lamp_post", -1, 12.0, (0.3, 0.3, 4.0))):
            offset = band + 0.8
            for k in range(1, int(length // every) + 1):
                t = k * every - every / 2
                spot = (a[0] + along[0] * t + side * left[0] * offset, a[1] + along[1] * t + side * left[1] * offset)
                if _route_distance(spot, route) < band + 0.5:
                    continue
                site.add(kind, group, spot, size, yaw=yaw if kind == "bench" else 0.0)


def obstacle_course(params: ObstacleCourse, prefix: str) -> Site:
    rng = random.Random(params.seed)
    lane, wall, length = params.lane_width, 0.2, params.length
    pitch = lane + wall
    total = params.lanes * pitch - wall
    middle = (length / 2, total / 2)
    site = Site(prefix, "Obstacle course")
    site.start, site.goal = (2.5, lane / 2), (length - 2, lane / 2)
    site.goal_radius, site.goal_name = min(1.2, lane / 2 - 0.1), "Finish"
    site.lanes = [((2.5, k * pitch + lane / 2), (length - 2, k * pitch + lane / 2)) for k in range(params.lanes)]
    track = site.group("track", "Track", middle)
    site.add("floor", track, middle, (length, total, FLOOR), color="#3b3f46")
    site.add("marking", track, (1.0, total / 2), (0.3, total, PAINT), name="Start line")
    site.add("marking", track, (length - 1.0, total / 2), (0.3, total, PAINT), name="Finish line")
    sides = site.group("sides", "Lane walls", middle)
    for k in range(params.lanes + 1):
        y = k * pitch - wall / 2
        label = "Outer wall" if k in (0, params.lanes) else f"Lane divider {k}"
        site.add("wall", sides, (length / 2, y), (length, wall, params.side_height), name=label)
    count = round(params.barriers * (length - 14) / 5)
    across = min(lane * 0.6, lane - 2 * params.clearance - 0.3)
    obstacles = site.group("obstacles", "Barriers", middle)
    slots = [8 + (index + 0.5) * (length - 14) / count for index in range(count)] if count else []
    if across >= 0.3:
        for k in range(params.lanes):
            side = rng.choice((0, 1))
            for x in slots:
                edge = k * pitch + (across / 2 if side == 0 else lane - across / 2)
                site.add("barrier", obstacles, (x + rng.uniform(-0.8, 0.8), edge), (0.4, across, 0.8))
                side = 1 - side
    if params.ramps:
        humps = site.group("humps", "Humps", middle)
        gaps = [(a + b) / 2 for a, b in zip([6.0, *slots], [*slots, length - 4], strict=False)][1::2] or [length / 2]
        for x in gaps:
            _hump(site, humps, x, total / 2, total, params.ramp_height)
    site.notes = {"barriers_per_lane": len(slots) if across >= 0.3 else 0}
    return site


def _hump(site: Site, group: str, x: float, y: float, width: float, height: float) -> None:
    slope = math.radians(12)
    run = height / math.tan(slope)
    plank = height / math.sin(slope)
    site.add("ramp", group, (x, y), (1.0, width, height), name="Hump top", blocks=False)
    for sign, label in ((-1, "Hump up"), (1, "Hump down")):
        center = (x + sign * (0.5 + run / 2), y)
        site.add(
            "ramp",
            group,
            center,
            (plank, width, 0.04),
            base=height / 2 - 0.02,
            tilt=12 * sign,
            name=label,
            blocks=False,
        )


def terrain_steps(params: TerrainSteps, prefix: str) -> Site:
    site = Site(prefix, "Steps")
    rise, run, width = params.step_height, params.step_depth, params.width
    x = 3.0
    group = site.group("steps", "Steps")
    for k in range(1, params.steps + 1):
        site.add("step", group, (x + run / 2, 0.0), (run, width, k * rise), name=f"Step up {k}", blocks=False)
        x += run + params.gap
    top = params.steps * rise
    site.add(
        "step",
        group,
        (x + params.platform_length / 2, 0.0),
        (params.platform_length, width, top),
        name="Top platform",
        blocks=False,
    )
    platform_middle = x + params.platform_length / 2
    x += params.platform_length + params.gap
    if params.descend:
        for k in range(params.steps, 0, -1):
            site.add(
                "step",
                group,
                (x + run / 2, 0.0),
                (run, width, k * rise),
                name=f"Step down {params.steps - k + 1}",
                blocks=False,
            )
            x += run + params.gap
        site.goal, site.goal_name = (x + 2.0, 0.0), "Past the steps"
    else:
        site.goal, site.goal_name, site.goal_height = (platform_middle, 0.0), "Top platform", top
    site.goal_radius = min(1.0, width / 2)
    site.start = (0.0, 0.0)
    if params.rails:
        rails = site.group("rails", "Rails")
        end = x + (2.0 if params.descend else 0.0)
        for side, y in (("left", width / 2 + 0.1), ("right", -width / 2 - 0.1)):
            site.add("wall", rails, ((2.0 + end) / 2, y), (end - 2.0, 0.2, top + 0.5), name=f"Rail {side}")
    site.notes = {"top_height": round(top, 3)}
    return site
