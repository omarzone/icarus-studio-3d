"""Outdoor layouts for vehicles: a parking lot and a grid of city blocks."""

import random

from icarus.library.layout_params import CityBlock, ParkingLot
from icarus.library.layout_site import FLOOR, PAINT, Site

CAR_COLORS = ("#c8553d", "#2f5d8a", "#e8e8e8", "#2b2d31", "#9aa3ad", "#7a1f2b", "#3d6b4f", "#d6a23a")
BUILDING_COLORS = ("#c9c2b8", "#b7a99a", "#9fa8b3", "#d8cfc0", "#a39383", "#8c96a3")
ASPHALT, CONCRETE, LINE = "#33373e", "#b4b1aa", 0.12
CAR = (4.3, 1.8, 1.45)
CURB = (0.3, 0.15)
LAMP = (0.3, 0.3, 5.0)


def _row_spans(params: ParkingLot) -> list[tuple[float, float, int]]:
    """Each row's y span and which way its bays open: +1 toward larger y, -1 toward smaller y."""
    depth, aisle, median = params.bay_depth, params.aisle_width, 2 * CURB[0]
    rows: list[tuple[float, float, int]] = []
    y = 0.0
    for index in range(params.rows):
        if index % 2 == 0:
            rows.append((y, y + depth, 1))
            y += depth + aisle
        else:
            rows.append((y, y + depth, -1))
            y += depth + median
    return rows


def parking_lot(params: ParkingLot, prefix: str) -> Site:
    rng = random.Random(params.seed)
    site = Site(prefix, "Parking lot")
    width, depth, aisle = params.bay_width, params.bay_depth, params.aisle_width
    length = params.bays_per_row * width
    rows = _row_spans(params)
    top = rows[-1][1] + (aisle if rows[-1][2] == 1 else 0)
    aisle_y = depth + aisle / 2
    site.start = (-params.entry_length / 2, aisle_y)
    middle = (length / 2, top / 2)

    pavement = site.group("pavement", "Pavement", middle)
    site.add(
        "floor",
        pavement,
        (length / 2 - params.entry_length / 2 + aisle / 2, top / 2),
        (length + params.entry_length + aisle, top + 1.2, FLOOR),
        name="Lot surface",
        color=ASPHALT,
    )

    count = params.rows * params.bays_per_row
    goal_bay = params.goal_bay or (params.free_bays[0] if params.free_bays else rng.randint(1, count))
    kept = {*params.free_bays, goal_bay}
    bays = site.group("bays", "Bay markings", middle)
    cars = site.group("cars", "Parked cars", middle)
    occupied: list[int] = []
    for row, (y0, y1, _) in enumerate(rows):
        for line in range(params.bays_per_row + 1):
            site.add(
                "marking",
                bays,
                (line * width, (y0 + y1) / 2),
                (LINE, depth, PAINT),
                name=f"Bay line {row + 1}.{line + 1}",
            )
        for bay in range(params.bays_per_row):
            number = row * params.bays_per_row + bay + 1
            center = ((bay + 0.5) * width, (y0 + y1) / 2)
            if number == goal_bay:
                site.goal, site.goal_radius, site.goal_name = center, min(1.2, width / 2 - 0.1), f"Goal bay {number}"
            if number in kept or rng.random() >= params.occupancy:
                continue
            occupied.append(number)
            site.add(
                "parked_car",
                cars,
                center,
                CAR,
                name=f"Parked car in bay {number}",
                yaw=90,
                color=rng.choice(CAR_COLORS),
            )

    curbs = site.group("curbs", "Curbs", middle)
    lamp_lines: list[float] = []
    for row, (y0, y1, opens) in enumerate(rows):
        back = y0 - CURB[0] / 2 if opens == 1 else y1 + CURB[0] / 2
        site.add("curb", curbs, (length / 2, back), (length, CURB[0], CURB[1]), name=f"Curb behind row {row + 1}")
        if opens == 1 and row == 0:
            lamp_lines.append(back - 0.5)
        elif opens == -1:
            # Back-to-back rows share one line of lamps on their median.
            lamp_lines.append(back + 0.5 if row == len(rows) - 1 else back + CURB[0] / 2)
    if params.lamps:
        lamps = site.group("lamps", "Lamp posts", middle)
        for y in lamp_lines:
            for x in _spaced(length, params.lamp_spacing):
                site.add("lamp_post", lamps, (x, y), LAMP)

    entry = site.group("entry", "Entry lane", (-params.entry_length / 2, aisle_y))
    for side, y in (("left", aisle_y + aisle / 2), ("right", aisle_y - aisle / 2)):
        site.add(
            "marking",
            entry,
            (-params.entry_length / 2, y),
            (params.entry_length, LINE, PAINT),
            name=f"Entry {side} edge",
        )

    if params.buildings or params.trees:
        around = site.group("surroundings", "Surroundings", middle)
        if params.buildings:
            count_buildings = max(1, round(length / 12))
            span = length / count_buildings
            for index in range(count_buildings):
                height = rng.uniform(6, 15)
                site.add(
                    "building",
                    around,
                    ((index + 0.5) * span, top + 8),
                    (span - 2, 8, height),
                    color=rng.choice(BUILDING_COLORS),
                )
        if params.trees:
            for x in _spaced(length, 6):
                size = rng.uniform(1.2, 1.8)
                site.add("tree", around, (x, -3.0), (size, size, rng.uniform(4, 6)))
    site.notes = {
        "goal_bay": goal_bay,
        "occupied_bays": occupied,
        "free_bays": sorted(set(range(1, count + 1)) - set(occupied)),
    }
    return site


def _spaced(length: float, spacing: float) -> list[float]:
    """Evenly spaced places along a length, about spacing apart and never at its very ends."""
    count = max(1, round(length / spacing))
    return [(index + 0.5) * length / count for index in range(count)]


def city_block(params: CityBlock, prefix: str) -> Site:
    rng = random.Random(params.seed)
    site = Site(prefix, "City blocks")
    street, walk, block = params.street_width, params.sidewalk_width, params.block_size
    pitch = block + street
    span_x, span_y = params.blocks_x * pitch, params.blocks_y * pitch
    middle = (span_x / 2, span_y / 2)
    goal = params.goal_intersection or (params.blocks_x, params.blocks_y)
    site.start = (0.0, 0.0)
    site.goal, site.goal_radius = (goal[0] * pitch, goal[1] * pitch), min(2.0, street / 2 - 0.5)
    site.goal_name = f"Goal at intersection {goal[0]}, {goal[1]}"

    streets = site.group("streets", "Streets", middle)
    site.add("floor", streets, middle, (span_x + street, span_y + street, FLOOR), name="Road surface", color=ASPHALT)
    for k in range(params.blocks_y + 1):
        site.add(
            "marking",
            streets,
            (span_x / 2, k * pitch),
            (span_x + street, LINE, PAINT),
            name=f"Center line east-west {k + 1}",
        )
    for k in range(params.blocks_x + 1):
        site.add(
            "marking",
            streets,
            (k * pitch, span_y / 2),
            (LINE, span_y + street, PAINT),
            name=f"Center line north-south {k + 1}",
        )
    if params.crossings:
        crossings = site.group("crossings", "Crossings", middle)
        stripes = [offset * street / 4 for offset in (-1.5, -0.5, 0.5, 1.5)]
        for i in range(params.blocks_x):
            for j in range(params.blocks_y + 1):
                x, y = i * pitch, j * pitch
                for stripe in stripes:
                    site.add(
                        "marking",
                        crossings,
                        (x + street / 2 + 1.5, y + stripe),
                        (2.5, 0.5, PAINT),
                        name=f"Crossing stripe {i}.{j}",
                    )

    for bx in range(params.blocks_x):
        for by in range(params.blocks_y):
            x0, y0 = bx * pitch + street / 2, by * pitch + street / 2
            center = (x0 + block / 2, y0 + block / 2)
            group = site.group(f"block_{bx + 1}_{by + 1}", f"Block {bx + 1}, {by + 1}", center)
            site.add(
                "floor", group, center, (block, block, CURB[1]), name="Sidewalk", color=CONCRETE, surface="concrete"
            )
            for side, (cx, cy, sx, sy) in {
                "south": (center[0], y0 + CURB[0] / 2, block, CURB[0]),
                "north": (center[0], y0 + block - CURB[0] / 2, block, CURB[0]),
                "west": (x0 + CURB[0] / 2, center[1], CURB[0], block - 2 * CURB[0]),
                "east": (x0 + block - CURB[0] / 2, center[1], CURB[0], block - 2 * CURB[0]),
            }.items():
                site.add("curb", group, (cx, cy), (sx, sy, CURB[1]), name=f"Curb {side}")
            _buildings(site, rng, group, params, (x0 + walk, y0 + walk), block - 2 * walk)
            inset = walk / 2
            if params.lamps:
                for cx in (x0 + inset, x0 + block - inset):
                    for cy in (y0 + inset, y0 + block - inset):
                        site.add("lamp_post", group, (cx, cy), LAMP)
            if params.trees:
                size = min(1.4, walk - 0.4)
                for cx, cy in (
                    (center[0], y0 + inset),
                    (center[0], y0 + block - inset),
                    (x0 + inset, center[1]),
                    (x0 + block - inset, center[1]),
                ):
                    site.add("tree", group, (cx, cy), (size, size, rng.uniform(4, 6.5)))
    return site


def _buildings(
    site: Site, rng: random.Random, group: str, params: CityBlock, corner: tuple[float, float], inner: float
) -> None:
    count, gap = params.buildings_per_side, 2.0
    size = (inner - gap * (count - 1)) / count
    for i in range(count):
        for j in range(count):
            # The middle of a large block stays a courtyard, as in real blocks.
            if 0 < i < count - 1 and 0 < j < count - 1:
                continue
            x = corner[0] + i * (size + gap) + size / 2
            y = corner[1] + j * (size + gap) + size / 2
            height = rng.uniform(params.min_height, params.max_height)
            site.add("building", group, (x, y), (size, size, height), color=rng.choice(BUILDING_COLORS))
