"""Outdoor layouts for vehicles: a parking lot and a grid of city blocks."""

import math
import random

from icarus.library.layout_params import CityBlock, ParkingLot
from icarus.library.layout_pieces import leafy_tree
from icarus.library.layout_site import FLOOR, PAINT, Rect, Site
from icarus.library.layout_surroundings import SIDEWALK, VERGE, LotFrame, surroundings

CAR_COLORS = ("#c8553d", "#2f5d8a", "#e8e8e8", "#2b2d31", "#9aa3ad", "#7a1f2b", "#3d6b4f", "#d6a23a")
BUILDING_COLORS = ("#c9c2b8", "#b7a99a", "#9fa8b3", "#d8cfc0", "#a39383", "#8c96a3")
ASPHALT, CONCRETE, LINE = "#33373e", "#b4b1aa", 0.12
CAR = (4.3, 1.8, 1.45)
CURB = (0.3, 0.15)
LAMP = (0.3, 0.3, 5.0)
STREET_LIGHT = (0.22, 0.22, 6.0)
CROSSING_DEPTH = 3.0
# Parked vehicles a mixed lot draws from, with how often each comes up and its length, width and height.
VEHICLES = (
    ("parked_car", 5, (4.3, 1.8, 1.45)),
    ("hatchback", 2, (3.9, 1.75, 1.5)),
    ("suv", 2, (4.7, 1.9, 1.75)),
    ("pickup", 2, (5.3, 2.0, 1.85)),
)


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
    around = params.surroundings
    # With surroundings the lot is paved curb to curb and the entry is a lane through the sidewalk.
    lot = Rect(-1.0, -CURB[0], length + aisle, top + CURB[0]) if around else None
    lane = Rect(-params.entry_length, aisle_y - aisle / 2, -1.0, aisle_y + aisle / 2)
    if lot is None:
        site.add(
            "floor",
            pavement,
            (length / 2 - params.entry_length / 2 + aisle / 2, top / 2),
            (length + params.entry_length + aisle, top + 1.2, FLOOR),
            name="Lot surface",
            color=ASPHALT,
        )
    else:
        for name, rect in (("Lot surface", lot), ("Entry lane surface", lane)):
            center = ((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2)
            size = (rect.x1 - rect.x0, rect.y1 - rect.y0, FLOOR)
            site.add("floor", pavement, center, size, name=name, color=ASPHALT)
    kinds = random.Random(f"{params.seed}-vehicles")

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
                # A row opening upward is entered driving down the page, and the other way round.
                site.goal_spot = (depth, width, -90.0 if rows[row][2] == 1 else 90.0)
            if number in kept or rng.random() >= params.occupancy:
                continue
            occupied.append(number)
            color = rng.choice(CAR_COLORS)
            kind, size = "parked_car", CAR
            if params.vehicles == "mixed":
                kind, _, size = kinds.choices(VEHICLES, weights=[item[1] for item in VEHICLES])[0]
            # A vehicle keeps half a metre free in its bay at least, whatever its kind.
            size = (min(size[0], depth - 0.5), min(size[1], width - 0.5), size[2])
            site.add(kind, cars, center, size, name=f"Parked vehicle in bay {number}", yaw=90, color=color)

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
                if not around:
                    site.add("lamp_post", lamps, (x, y), LAMP)
                    continue
                # Street lights reach their arm over the lot; those on a sidewalk stand on it.
                outside = y < 0 or y > top
                base = SIDEWALK if outside else CURB[1]
                place = (x, y - 0.3) if y < 0 else (x, y + 0.3) if y > top else (x, y)
                site.add("street_light", lamps, place, STREET_LIGHT, base=base, yaw=-90 if y > top else 90)

    entry = site.group("entry", "Entry lane", (-params.entry_length / 2, aisle_y))
    for side, y in (("left", aisle_y + aisle / 2), ("right", aisle_y - aisle / 2)):
        site.add(
            "marking",
            entry,
            (-params.entry_length / 2, y),
            (params.entry_length, LINE, PAINT),
            name=f"Entry {side} edge",
        )

    blocks: list[Rect] = []
    if params.buildings or (params.trees and not around):
        group = site.group("surroundings", "Surroundings", middle)
        # Past the far sidewalk and its grass when the lot has surroundings.
        far = top + CURB[0] + params.sidewalk_width + VERGE + 4.5 if around else top + 8
        if params.buildings:
            count_buildings = max(1, round(length / 12))
            span = length / count_buildings
            for index in range(count_buildings):
                height = rng.uniform(6, 15)
                spot = ((index + 0.5) * span, far)
                site.add("building", group, spot, (span - 2, 8, height), color=rng.choice(BUILDING_COLORS))
                blocks.append(Rect.around(spot, span - 2, 8))
        if params.trees and not around:
            for x in _spaced(length, 6):
                size = rng.uniform(1.2, 1.8)
                site.add("tree", group, (x, -3.0), (size, size, rng.uniform(4, 6)))
    laid: list[str] = []
    if lot is not None:
        if params.paint:
            _lot_paint(site, params, aisle_y, length, lane)
        frame = LotFrame(pavement=lot, lane=lane, aisle_y=aisle_y, entry_x=-params.entry_length)
        laid = surroundings(site, params, frame, blocks)
    site.notes = {
        "goal_bay": goal_bay,
        "occupied_bays": occupied,
        "free_bays": sorted(set(range(1, count + 1)) - set(occupied)),
        **({"surroundings": laid} if laid else {}),
    }
    return site


def _lot_paint(site: Site, params: ParkingLot, aisle_y: float, length: float, lane: Rect) -> None:
    """A P every few bays down the aisle, its top away from the entry, and an arrow on the entry lane pointing in."""
    paint = site.group("paint", "Road paint", (length / 2, aisle_y))
    every = max(2, round(12 / params.bay_width))
    for bay in range(every // 2, params.bays_per_row, every):
        site.add("parking_mark", paint, ((bay + 0.5) * params.bay_width, aisle_y), (1.6, 1.2, PAINT))
    if lane.x1 - lane.x0 > 4:
        site.add("road_arrow", paint, (lane.x1 - 1.8, aisle_y), (2.6, 0.9, PAINT), name="Entry arrow")


def _spaced(length: float, spacing: float) -> list[float]:
    """Evenly spaced places along a length, about spacing apart and never at its very ends."""
    count = max(1, round(length / spacing))
    return [(index + 0.5) * length / count for index in range(count)]


def city_block(params: CityBlock, prefix: str) -> Site:
    rng = random.Random(params.seed)
    trees = random.Random(f"{params.seed}-trees")
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
    # Dashed center lines run between intersections and stop short of the crossings.
    gap = street / 2 + (CROSSING_DEPTH + 1.0 if params.crossings else 0.5)
    for k in range(params.blocks_y + 1):
        for i in range(params.blocks_x):
            x0, x1 = i * pitch + gap, (i + 1) * pitch - gap
            site.add(
                "lane_dashes",
                streets,
                ((x0 + x1) / 2, k * pitch),
                (x1 - x0, LINE, PAINT),
                name=f"Center line east-west {k + 1}.{i + 1}",
            )
    for k in range(params.blocks_x + 1):
        for j in range(params.blocks_y):
            y0, y1 = j * pitch + gap, (j + 1) * pitch - gap
            site.add(
                "lane_dashes",
                streets,
                (k * pitch, (y0 + y1) / 2),
                (y1 - y0, LINE, PAINT),
                yaw=90,
                name=f"Center line north-south {k + 1}.{j + 1}",
            )
    if params.crossings:
        crossings = site.group("crossings", "Crossings", middle)
        reach = street / 2 + CROSSING_DEPTH / 2 + 0.3
        for i in range(params.blocks_x + 1):
            for j in range(params.blocks_y + 1):
                x, y = i * pitch, j * pitch
                if i < params.blocks_x:
                    site.add(
                        "crosswalk",
                        crossings,
                        (x + reach, y),
                        (CROSSING_DEPTH, street - 0.6, PAINT),
                        name=f"Crossing east of {i}.{j}",
                    )
                if j < params.blocks_y:
                    site.add(
                        "crosswalk",
                        crossings,
                        (x, y + reach),
                        (CROSSING_DEPTH, street - 0.6, PAINT),
                        yaw=90,
                        name=f"Crossing north of {i}.{j}",
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
                for cx, sx in ((x0 + inset, -1), (x0 + block - inset, 1)):
                    for cy, sy in ((y0 + inset, -1), (y0 + block - inset, 1)):
                        # The arm reaches out over the corner's streets.
                        yaw = math.degrees(math.atan2(sy, sx))
                        site.add("street_light", group, (cx, cy), STREET_LIGHT, base=CURB[1], yaw=yaw)
            if params.trees:
                for cx, cy in (
                    (center[0], y0 + inset),
                    (center[0], y0 + block - inset),
                    (x0 + inset, center[1]),
                    (x0 + block - inset, center[1]),
                ):
                    trunk, ornament = leafy_tree(trees, trees.uniform(4, 6.5))
                    site.add("tree", group, (cx, cy), trunk, base=CURB[1], ornament=ornament)
            if params.furniture:
                site.add("trash_bin", group, (x0 + inset, y0 + inset + 2.0), (0.55, 0.55, 0.95), base=CURB[1])
                site.add("fire_hydrant", group, (x0 + block - inset, y0 + inset + 2.0), (0.35, 0.35, 0.8), base=CURB[1])
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
