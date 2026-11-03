"""Indoor layouts: a furnished room with doorways and a warehouse of shelving rows."""

import math
import random

from icarus.library.layout_params import Room, Side, Warehouse
from icarus.library.layout_site import FLOOR, FloorPlan, LayoutError, Point, Rect, Site

WALL = 0.2
TRIES = 25
# Scatter keeps a little more room than the final check asks, so grid rounding never closes the way.
SLACK = 0.25
# Long side, short side, height, and whether it stands against a wall.
FURNITURE: dict[str, tuple[float, float, float, bool]] = {
    "table": (1.6, 0.9, 0.75, False),
    "sofa": (2.0, 0.9, 0.8, True),
    "cabinet": (1.0, 0.5, 1.8, True),
    "bed": (2.0, 1.6, 0.55, True),
}


def _walls(
    site: Site, group: str, width: float, depth: float, height: float, doors: dict[Side, float], thick: float
) -> None:
    """Four walls around [0, width] x [0, depth], each split around its doorway when it has one."""
    runs: dict[Side, tuple[Point, float, bool]] = {
        "south": ((width / 2, -thick / 2), width + 2 * thick, True),
        "north": ((width / 2, depth + thick / 2), width + 2 * thick, True),
        "west": ((-thick / 2, depth / 2), depth, False),
        "east": ((width + thick / 2, depth / 2), depth, False),
    }
    for side, (center, length, along_x) in runs.items():
        door = doors.get(side)
        pieces = [(-length / 2, length / 2)] if door is None else [(-length / 2, -door / 2), (door / 2, length / 2)]
        for index, (a, b) in enumerate(pieces):
            if b - a < 0.05:
                continue
            middle = (a + b) / 2
            spot = (center[0] + middle, center[1]) if along_x else (center[0], center[1] + middle)
            size = (b - a, thick, height) if along_x else (thick, b - a, height)
            name = f"{side.capitalize()} wall" if len(pieces) == 1 else f"{side.capitalize()} wall {index + 1}"
            site.add("wall", group, spot, size, name=name)


def _inside(side: Side, width: float, depth: float, inset: float) -> Point:
    return {
        "west": (inset, depth / 2),
        "east": (width - inset, depth / 2),
        "south": (width / 2, inset),
        "north": (width / 2, depth - inset),
    }[side]


def _opposite(side: Side) -> Side:
    pairs: dict[Side, Side] = {"west": "east", "east": "west", "south": "north", "north": "south"}
    return pairs[side]


def _clear_of(rect: Rect, spots: list[Point], distance: float) -> bool:
    return all(rect.distance_to(spot) >= distance for spot in spots)


def room(params: Room, prefix: str) -> Site:
    rng = random.Random(params.seed)
    site = Site(prefix, "Room")
    width, depth = params.width, params.depth
    center = (width / 2, depth / 2)
    doors: list[Side] = list(dict.fromkeys(params.doorways))
    inset = min(1.5, width / 4, depth / 4)
    first = doors[0] if doors else "west"
    last = doors[-1] if len(doors) > 1 else _opposite(first)
    site.start, site.goal = _inside(first, width, depth, inset), _inside(last, width, depth, inset)
    site.goal_radius, site.goal_name = 0.6, f"Goal by the {last} wall"
    floor = site.group("floor", "Floor", center)
    site.add("floor", floor, center, (width, depth, FLOOR), surface=params.floor, color="#a0785a")
    walls = site.group("walls", "Walls", center)
    _walls(site, walls, width, depth, params.wall_height, {side: params.door_width for side in doors}, WALL)
    plan = site.floor_plan(params.clearance + SLACK, Rect(-1.5, -1.5, width + 1.5, depth + 1.5))
    keep = [site.start, site.goal, *(_inside(side, width, depth, 0.6) for side in doors)]
    furniture = site.group("furniture", "Furniture", center)
    placed: list[Rect] = []
    for _ in range(round(params.furniture * width * depth / 8)):
        kind = rng.choice(list(FURNITURE))
        long, short, height, against = FURNITURE[kind]
        for _ in range(TRIES):
            spot, yaw = _furniture_spot(rng, width, depth, long, short, against)
            rect = Rect.around(spot, long, short, yaw)
            if not (rect.x0 >= 0 and rect.y0 >= 0 and rect.x1 <= width and rect.y1 <= depth):
                continue
            if any(rect.overlaps(other.grown(0.4)) for other in placed):
                continue
            if not _clear_of(rect, keep, params.clearance + 0.8) or not plan.keeps_open(rect, site.start, site.goal):
                continue
            placed.append(rect)
            site.add(kind, furniture, spot, (long, short, height), yaw=yaw)
            break
    site.notes = {"doorways": doors, "furniture": len(placed)}
    return site


def _furniture_spot(
    rng: random.Random, width: float, depth: float, long: float, short: float, against: bool
) -> tuple[Point, float]:
    if not against:
        return (rng.uniform(long / 2, width - long / 2), rng.uniform(long / 2, depth - long / 2)), rng.choice(
            (0.0, 90.0)
        )
    side = rng.choice(("west", "east", "south", "north"))
    gap = short / 2 + 0.05
    if side in ("south", "north"):
        y = gap if side == "south" else depth - gap
        return (rng.uniform(long / 2, width - long / 2), y), 0.0
    x = gap if side == "west" else width - gap
    return (x, rng.uniform(long / 2, depth - long / 2)), 90.0


SHELF_DEPTH = 1.0
FRONT, BACK, SPLIT = 5.0, 3.0, 14.0


def warehouse(params: Warehouse, prefix: str) -> Site:
    rng = random.Random(params.seed)
    site = Site(prefix, "Warehouse")
    width, depth, rows = params.width, params.depth, params.shelf_rows
    fits = math.floor((depth - params.aisle_width) / (SHELF_DEPTH + params.aisle_width))
    if rows > fits:
        raise LayoutError(f"{rows} shelving rows with {params.aisle_width:g} m aisles need more depth; {fits} fit")
    aisle = (depth - rows * SHELF_DEPTH) / (rows + 1)
    aisles = rows + 1
    goal_aisle = params.goal_aisle or rng.randint(1, aisles)
    if goal_aisle > aisles:
        raise LayoutError(f"there are {aisles} aisles; aisle {goal_aisle} does not exist")
    center = (width / 2, depth / 2)
    x0, x1 = FRONT, width - BACK
    if x1 - x0 < 2:
        raise LayoutError("the warehouse is too short for shelving between its cross aisles")
    aisle_y = [index * (aisle + SHELF_DEPTH) + aisle / 2 for index in range(aisles)]
    site.start = (2.5, depth / 2)
    site.goal = (x1 - 1.5, aisle_y[goal_aisle - 1])
    site.goal_radius, site.goal_name = min(1.0, aisle / 2 - 0.1), f"Goal at the end of aisle {goal_aisle}"
    site.add(
        "floor",
        site.group("floor", "Floor", center),
        center,
        (width, depth, FLOOR),
        surface="concrete",
        color="#8f9196",
    )
    _walls(
        site, site.group("walls", "Walls", center), width, depth, params.wall_height, {"west": params.door_width}, 0.3
    )
    shelving = site.group("shelving", "Shelving", center)
    spans = [(x0, x1)] if x1 - x0 <= SPLIT else [(x0, (x0 + x1) / 2 - 1), ((x0 + x1) / 2 + 1, x1)]
    for row in range(rows):
        y = (row + 1) * aisle + (row + 0.5) * SHELF_DEPTH
        for index, (a, b) in enumerate(spans):
            label = f"Shelving row {row + 1}" if len(spans) == 1 else f"Shelving row {row + 1}.{index + 1}"
            site.add("shelf", shelving, ((a + b) / 2, y), (b - a, SHELF_DEPTH, params.shelf_height), name=label)
    plan: FloorPlan = site.floor_plan(params.clearance + SLACK, Rect(-1.5, -1.5, width + 1.5, depth + 1.5))
    crates = site.group("crates", "Crates", center)
    stacks: list[Rect] = []
    for _ in range(round(params.crates * aisles * (x1 - x0) / 6)):
        for _ in range(TRIES):
            y_mid = rng.choice(aisle_y)
            y = y_mid + rng.choice((-1, 1)) * (aisle / 2 - 0.55)
            spot = (rng.uniform(x0 + 0.5, x1 - 0.5), y)
            rect = Rect.around(spot, 1.0, 1.0)
            if any(rect.overlaps(other.grown(0.3)) for other in stacks):
                continue
            if not _clear_of(rect, [site.start, site.goal], params.clearance + 1.0):
                continue
            if not plan.keeps_open(rect, site.start, site.goal):
                continue
            site.add("crate", crates, spot, (1.0, 1.0, 1.0))
            if rng.random() < 0.4:
                site.add("crate", crates, spot, (0.9, 0.9, 0.9), base=1.0, blocks=False)
            stacks.append(rect)
            break
    site.notes = {"aisles": aisles, "goal_aisle": goal_aisle, "crate_stacks": len(stacks)}
    return site
