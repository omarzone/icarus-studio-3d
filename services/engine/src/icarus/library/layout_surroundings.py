"""What stands around a parking lot: ground instead of bare floor, raised sidewalks, streets with dashed center lines
and zebra crossings, barrier gates at the entry, trees on grass strips and street furniture.

Everything here keeps out of the lot and the entry lane, so the way from the start to the goal stays as the lot has
it; trees' crowns, lamps' arms and gates' booms are ornaments, which nothing ever touches.
"""

import random
from dataclasses import dataclass

from icarus.library.layout_params import ParkingLot
from icarus.library.layout_pieces import leafy_tree
from icarus.library.layout_site import FLOOR, PAINT, Rect, Site, uncovered

ASPHALT = "#33373e"
GROUND_COLORS = {"grass": ("#5f8f45", "grass"), "concrete": ("#a9a69f", "concrete")}
# A raised sidewalk's height, as high as the lot's curbs.
SIDEWALK = 0.15
# Grass between a sidewalk and a street, where the trees stand.
VERGE = 3.0
# Ground laid past the farthest street or building.
APRON = 8.0
STREET_LINE = 0.15
CROSSING = 3.0


@dataclass(frozen=True)
class LotFrame:
    """The lot as the recipe laid it out: its paved rectangle (curb to curb), its entry lane and its far edge."""

    pavement: Rect
    lane: Rect
    aisle_y: float
    # The street side of the entry lane, where the start lane meets the west street.
    entry_x: float


def surroundings(site: Site, params: ParkingLot, frame: LotFrame, buildings: list[Rect]) -> list[str]:
    """Lays out the lot's surroundings and returns what it laid out, for the summary."""
    rng = random.Random(f"{params.seed}-surroundings")
    walk, street = params.sidewalk_width, params.street_width
    lot, lane = frame.pavement, frame.lane
    center = ((lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2)
    laid: list[str] = []

    walks = site.group("sidewalks", "Sidewalks", center)
    rings = [
        Rect(lot.x0 - walk, lot.y0 - walk, lot.x1 + walk, lot.y0),
        Rect(lot.x0 - walk, lot.y1, lot.x1 + walk, lot.y1 + walk),
        Rect(lot.x1, lot.y0, lot.x1 + walk, lot.y1),
        Rect(lot.x0 - walk, lot.y0, lot.x0, lane.y0),
        Rect(lot.x0 - walk, lane.y1, lot.x0, lot.y1),
    ]
    for index, ring in enumerate(rings):
        if ring.x1 - ring.x0 > 0.2 and ring.y1 - ring.y0 > 0.2:
            _slab(site, walks, "sidewalk", ring, SIDEWALK, f"Sidewalk {index + 1}")
    laid.append("sidewalks")

    floors = [lot, lane, *rings]
    south_edge = lot.y0 - walk - VERGE
    west_edge = frame.entry_x
    streets = site.group("streets", "Streets", center)
    north_end = max([lot.y1 + walk + VERGE, *(b.y1 + 2 for b in buildings)])
    east_end = lot.x1 + walk + VERGE
    if params.streets >= 1:
        south_end = south_edge - (street if params.streets >= 2 else VERGE)
        road = Rect(west_edge - street, south_end, west_edge, north_end)
        _slab(site, streets, "floor", road, FLOOR, "West street", color=ASPHALT, surface="asphalt")
        floors.append(road)
        middle = west_edge - street / 2
        crossings = [frame.aisle_y - lane_half(frame) - 2.5, frame.aisle_y + lane_half(frame) + 2.5]
        for y in crossings:
            site.add("crosswalk", streets, (middle, y), (CROSSING, street - 0.8, PAINT), yaw=90, name="West crossing")
        spans = [(road.y0 + (street if params.streets >= 2 else 0) + 1, crossings[0] - CROSSING / 2 - 1)]
        spans.append((crossings[1] + CROSSING / 2 + 1, road.y1 - 1))
        for y0, y1 in spans:
            if y1 - y0 > 3:
                site.add(
                    "lane_dashes",
                    streets,
                    (middle, (y0 + y1) / 2),
                    (y1 - y0, STREET_LINE, PAINT),
                    yaw=90,
                    name="West center line",
                )
        laid.append("west street")
    if params.streets >= 2:
        road = Rect(west_edge, south_edge - street, east_end, south_edge)
        _slab(site, streets, "floor", road, FLOOR, "South street", color=ASPHALT, surface="asphalt")
        floors.append(road)
        middle = south_edge - street / 2
        crossing_x = west_edge + CROSSING / 2 + 0.5
        site.add("crosswalk", streets, (crossing_x, middle), (CROSSING, street - 0.8, PAINT), name="South crossing")
        x0, x1 = crossing_x + CROSSING / 2 + 1, road.x1 - 1
        site.add(
            "lane_dashes", streets, ((x0 + x1) / 2, middle), (x1 - x0, STREET_LINE, PAINT), name="South center line"
        )
        laid.append("south street")

    if params.gates:
        gates = site.group("entry_gates", "Entry gates", (lot.x0 - walk / 2, frame.aisle_y))
        for side, y in (("south", lane.y0 - 0.4), ("north", lane.y1 + 0.4)):
            site.add(
                "barrier_gate",
                gates,
                (lot.x0 - walk / 2, y),
                (0.45, 0.45, 1.1),
                base=SIDEWALK,
                name=f"Barrier gate {side}",
            )
        site.add(
            "parking_sign",
            gates,
            (lot.x0 - walk / 2, lane.y1 + 1.4),
            (0.08, 0.08, 2.4),
            base=SIDEWALK,
            name="Parking sign",
        )
        site.add(
            "crosswalk",
            gates,
            (lot.x0 - walk / 2, frame.aisle_y),
            (walk, lane.y1 - lane.y0, PAINT),
            name="Entry crossing",
        )
        laid.append("barrier gates")

    outer = Rect(
        west_edge - (street if params.streets >= 1 else 0) - APRON,
        south_edge - (street if params.streets >= 2 else 0) - APRON,
        east_end + APRON,
        north_end + APRON,
    )
    color, surface = GROUND_COLORS[params.ground]
    ground = site.group("ground", "Ground", center)
    for index, patch in enumerate(uncovered(outer, floors)):
        _slab(site, ground, "grass", patch, FLOOR, f"Ground {index + 1}", color=color, surface=surface)
    laid.append(f"{params.ground} ground")

    if params.trees:
        trees = site.group("trees", "Trees", center)
        verges = [
            Rect(lot.x0 - walk, lot.y0 - walk - VERGE, lot.x1 + walk, lot.y0 - walk),
            Rect(lot.x1 + walk, lot.y0 - walk, lot.x1 + walk + VERGE, lot.y1 + walk),
            Rect(lot.x0 - walk, lot.y1 + walk, lot.x1 + walk, lot.y1 + walk + VERGE),
        ]
        for verge in verges:
            _tree_row(site, rng, trees, verge, avoid=lane.grown(1.5))
        west = Rect(frame.entry_x, lot.y0 - walk, lot.x0 - walk, lot.y1 + walk)
        if west.x1 - west.x0 >= 2.0:
            _tree_row(site, rng, trees, west, avoid=lane.grown(2.5))
        laid.append("trees")

    _furniture(site, frame, walk)
    laid.append("street furniture")
    return laid


def lane_half(frame: LotFrame) -> float:
    return (frame.lane.y1 - frame.lane.y0) / 2


def _slab(
    site: Site,
    group: str,
    kind: str,
    rect: Rect,
    height: float,
    name: str,
    *,
    color: str | None = None,
    surface: str | None = None,
) -> None:
    center = ((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2)
    size = (rect.x1 - rect.x0, rect.y1 - rect.y0, height)
    site.add(kind, group, center, size, name=name, color=color, surface=surface)


def _tree_row(site: Site, rng: random.Random, group: str, strip: Rect, avoid: Rect) -> None:
    """Trees down the middle of a grass strip, about 7 m apart, never in front of the entry."""
    across_x = strip.x1 - strip.x0 < strip.y1 - strip.y0
    length = (strip.y1 - strip.y0) if across_x else (strip.x1 - strip.x0)
    count = max(1, round(length / 7))
    for index in range(count):
        t = (index + 0.5) / count
        spot = (
            ((strip.x0 + strip.x1) / 2, strip.y0 + t * length)
            if across_x
            else (strip.x0 + t * length, (strip.y0 + strip.y1) / 2)
        )
        if avoid.distance_to(spot) < 0.5:
            continue
        trunk, ornament = leafy_tree(rng, rng.uniform(4.5, 7.0))
        site.add("tree", group, spot, trunk, ornament=ornament)


def _furniture(site: Site, frame: LotFrame, walk: float) -> None:
    """A litter bin and a fire hydrant by the entry and planters with benches along the far sidewalk."""
    lot = frame.pavement
    group = site.group("street_furniture", "Street furniture", ((lot.x0 + lot.x1) / 2, lot.y1 + walk / 2))
    edge = lot.x0 - walk / 2
    site.add("trash_bin", group, (edge, frame.lane.y0 - 1.6), (0.55, 0.55, 0.95), base=SIDEWALK)
    site.add("fire_hydrant", group, (edge, frame.lane.y0 - 3.0), (0.35, 0.35, 0.8), base=SIDEWALK)
    length = lot.x1 - lot.x0
    count = max(1, round(length / 14))
    for index in range(count):
        x = lot.x0 + (index + 0.5) * length / count + 3.5
        if x > lot.x1 - 2:
            continue
        y = lot.y1 + walk * 0.62
        site.add("planter", group, (x, y), (1.6, 0.8, 0.5), base=SIDEWALK)
        site.add("bench", group, (x + 2.2, y), (1.6, 0.5, 0.45), base=SIDEWALK, yaw=180)
