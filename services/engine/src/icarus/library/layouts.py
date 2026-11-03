"""Layout recipes: seeded, parameterized engine code that lays out a whole environment from library pieces as plain
create_object and set_property operations, with the path from the start to the goal checked open."""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.operations import CreateObject, EditOperation, SetProperty
from icarus.contracts.project import Project
from icarus.contracts.properties import ChoiceValue, NumberValue, PropertyValue, VectorValue
from icarus.library.layout_courses import forest, maze, obstacle_course, terrain_steps
from icarus.library.layout_interiors import room, warehouse
from icarus.library.layout_params import (
    AnyLayout,
    CityBlock,
    Forest,
    LayoutParams,
    Maze,
    ObstacleCourse,
    ParkingLot,
    Room,
    TerrainSteps,
    Warehouse,
)
from icarus.library.layout_site import LayoutError, Point, Site
from icarus.library.layout_streets import city_block, parking_lot
from icarus.library.parts import Part

__all__ = ["RECIPES", "Layout", "LayoutError", "LayoutParams", "expand_layout", "recipe_parameters"]


@dataclass(frozen=True)
class Recipe:
    id: str
    label: str
    # Ids of everything the recipe lays out start with it.
    prefix: str
    description: str
    params: type[BaseModel]
    build: Callable[[Any, str], Site]


RECIPES: dict[str, Recipe] = {
    recipe.id: recipe
    for recipe in (
        Recipe(
            "parking_lot",
            "Parking lot",
            "lot",
            "Rows of marked bays with parked cars in chosen bays and chosen bays left free, curbs, lamp posts on a "
            "grid, an entry lane where the start is, buildings and trees around; the goal is a free bay.",
            ParkingLot,
            parking_lot,
        ),
        Recipe(
            "room",
            "Room",
            "room",
            "A floored room with walls and doorways and furniture scattered so the way between the doors stays clear.",
            Room,
            room,
        ),
        Recipe(
            "maze",
            "Maze or corridor",
            "maze",
            "A seeded maze of walls with a guaranteed way from the start cell to the goal cell; one row of cells is a "
            "corridor.",
            Maze,
            maze,
        ),
        Recipe(
            "city_block",
            "City blocks",
            "city",
            "Streets with center lines, curbed sidewalks, buildings of varied heights, street lamps, trees and "
            "crossings; the start and goal are intersections.",
            CityBlock,
            city_block,
        ),
        Recipe(
            "warehouse",
            "Warehouse",
            "warehouse",
            "Walls with a loading door, rows of shelving with aisles between them and crates that never close the "
            "way to the goal aisle.",
            Warehouse,
            warehouse,
        ),
        Recipe(
            "forest",
            "Forest or park",
            "forest",
            "Seeded trees and rocks around a clear winding path from west to east; as a park, grass with benches and "
            "lamps along the path.",
            Forest,
            forest,
        ),
        Recipe(
            "obstacle_course",
            "Obstacle course",
            "course",
            "Walled lanes with barriers on alternating sides, optional humps to climb, and start and finish lines.",
            ObstacleCourse,
            obstacle_course,
        ),
        Recipe(
            "terrain_steps",
            "Steps and platforms",
            "steps",
            "Steps up to a platform and back down, or separate platforms with gaps, with rails along the sides.",
            TerrainSteps,
            terrain_steps,
        ),
    )
}


def recipe_parameters(recipe_id: str) -> dict[str, dict[str, Any]]:
    """Each parameter of a recipe with its default, range and meaning, as the model reads them."""
    schema = RECIPES[recipe_id].params.model_json_schema()
    keep = ("default", "minimum", "maximum", "description", "enum")
    out: dict[str, dict[str, Any]] = {}
    for name, field in schema["properties"].items():
        if name == "recipe":
            continue
        item = {key: field[key] for key in keep if key in field}
        if "items" in field and "enum" in field["items"]:
            item["options"] = field["items"]["enum"]
        out[name] = item
    return out


@dataclass(frozen=True)
class Layout:
    operations: list[EditOperation]
    site: Site
    origin: Point
    # Metres of the open way from the start to the goal at the asked clearance.
    path_m: float

    def world(self, point: Point) -> list[float]:
        return [round(self.origin[0] + point[0], 2), round(self.origin[1] + point[1], 2)]

    def summary(self) -> dict[str, Any]:
        groups = {obj.id: obj.name for obj in self.site.objects if obj.parent == self.site.prefix}
        counts = {name: sum(1 for obj in self.site.objects if obj.parent == gid) for gid, name in groups.items()}
        return {
            "root": self.site.prefix,
            "objects": len(self.site.objects),
            "groups": counts,
            "start": self.world(self.site.start),
            "goal": self.world(self.site.goal) if self.site.goal else None,
            "path_m": round(self.path_m, 1),
            **self.site.notes,
        }


def _prefix(project: Project | None, base: str) -> str:
    ids: set[str] = set()
    if project is not None:
        ids = {obj.id for obj in project.world.objects} | {obj.id for body in project.bodies for obj in body.objects}
    index = 1
    while True:
        prefix = base if index == 1 else f"{base}{index}"
        if not any(item == prefix or item.startswith(f"{prefix}_") for item in ids):
            return prefix
        index += 1


def _marker(project: Project | None, kind: str) -> tuple[ObjectSpec, dict[str, str]] | None:
    """The first object carrying a component kind, with its component ids by kind; the simulation reads that one."""
    objects = [*project.world.objects, *(obj for body in project.bodies for obj in body.objects)] if project else []
    for obj in objects:
        kinds = {component.kind: component.id for component in obj.components}
        if kind in kinds:
            return obj, kinds
    return None


def _start_anchor(project: Project | None) -> Point:
    """Where the layout's start lands by default: under the body, else at the spawn point, else the origin."""
    bodies = project.bodies if project else []
    roots = [obj for obj in bodies[0].objects if obj.parent is None] if bodies else []
    candidates = [obj for obj in roots if any(item.kind == "mesh" for item in obj.components)]
    found = _marker(project, "spawn_point")
    for obj in [*candidates, *([found[0]] if found else [])]:
        transform = next((item for item in obj.components if item.kind == "transform"), None)
        position = transform.properties.get("position") if transform else None
        if isinstance(position, VectorValue):
            return position.value[0], position.value[1]
    return 0.0, 0.0


def _set(obj: str, component: str, prop: str, value: PropertyValue) -> SetProperty:
    return SetProperty(op="set_property", object=obj, component=component, property=prop, value=value)


def _markers(project: Project | None, site: Site, origin: Point, params: AnyLayout) -> list[EditOperation]:
    operations: list[EditOperation] = []
    if params.spawn:
        spot = (origin[0] + site.start[0], origin[1] + site.start[1], 0.0)
        found = _marker(project, "spawn_point")
        if found and "transform" in found[1]:
            operations.append(
                _set(found[0].id, found[1]["transform"], "position", VectorValue(type="vector", value=spot))
            )
        elif found is None:
            part = Part(
                f"{site.prefix}_spawn", "Spawn point", None, {"transform": {"position": spot}, "spawn_point": {}}
            )
            operations.append(CreateObject(op="create_object", target="world", object=part.spec()))
    if params.goal and site.goal:
        spot = (origin[0] + site.goal[0], origin[1] + site.goal[1], site.goal_height)
        found = _marker(project, "goal_zone")
        if found and "transform" in found[1]:
            obj, ids = found
            operations.append(_set(obj.id, ids["transform"], "position", VectorValue(type="vector", value=spot)))
            radius = NumberValue(type="number", value=site.goal_radius)
            operations.append(_set(obj.id, ids["goal_zone"], "radius", radius))
            operations += _spot(obj.id, ids, site)
        elif found is None:
            components = {"transform": {"position": spot}, "goal_zone": {"radius": site.goal_radius}}
            part = Part(f"{site.prefix}_goal", site.goal_name, None, components)
            operations.append(CreateObject(op="create_object", target="world", object=part.spec()))
            operations += _spot(part.id, {"transform": "transform", "goal_zone": "goal_zone"}, site)
    return operations


def _spot(obj: str, ids: dict[str, str], site: Site) -> list[EditOperation]:
    """A bay's goal as a rectangle the bay's size, turned to the bay; its success rules stay as the goal had them."""
    if site.goal_spot is None:
        return []
    length, width, heading = site.goal_spot
    return [
        _set(obj, ids["goal_zone"], "shape", ChoiceValue(type="choice", value="rectangle")),
        _set(obj, ids["goal_zone"], "length", NumberValue(type="number", value=length)),
        _set(obj, ids["goal_zone"], "width", NumberValue(type="number", value=width)),
        _set(obj, ids["transform"], "rotation", VectorValue(type="vector", value=(0, 0, heading))),
    ]


def expand_layout(params: AnyLayout, project: Project | None, start_at: Point | None = None) -> Layout:
    """The operations that lay a recipe out in this project, or LayoutError when its way cannot stay open.

    The layout's start lands at start_at, by default under the project's body (or its spawn point), so the body
    starts where the layout expects it."""
    recipe = RECIPES[params.recipe]
    site = recipe.build(params, _prefix(project, recipe.prefix))
    goal = site.goal or site.start
    plan = site.floor_plan(params.clearance, site.bounds(max(3.0, 2 * params.clearance + 1)))
    cells = plan.path(site.start, goal)
    if cells is None:
        raise LayoutError(
            f"No open way from the start to the goal keeps {params.clearance:g} m of clearance: "
            "lower the density, widen the passages or lower clearance"
        )
    anchor = start_at or _start_anchor(project)
    where = (anchor[0] - site.start[0], anchor[1] - site.start[1])
    root = Part(site.prefix, site.title, None, {"transform": {"position": (where[0], where[1], 0.0)}}).spec()
    objects = [root, *site.objects[1:]]
    operations: list[EditOperation] = [CreateObject(op="create_object", target="world", object=obj) for obj in objects]
    operations += _markers(project, site, where, params)
    return Layout(operations, site, where, len(cells) * plan.cell)
