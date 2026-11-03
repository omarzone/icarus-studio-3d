"""A whole scene planned from words or a reference picture, and the corrections a comparison asks for.

The plan is data the model writes; the engine turns it into ordinary edit operations, so every placed thing stays an
editable object. What cannot be placed is reported, never dropped silently."""

import math
from dataclasses import dataclass, field
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.operations import CreateObject, DeleteObject, EditOperation, SetProperty
from icarus.contracts.project import Project
from icarus.contracts.properties import PropertyValue
from icarus.contracts.scene import GeomFinish
from icarus.copilot.building.copies import Ids
from icarus.copilot.building.frames import Placement, placed, wrapped
from icarus.copilot.building.part_plan import COLOR, PLAN_ID, CompoundObject, compound_operations, compound_problems
from icarus.copilot.scratch_plan import PlanLayout, Surface
from icarus.design.components import view
from icarus.design.surfaces import SURFACE_FRICTION
from icarus.library.components import component_kind
from icarus.library.layouts import LayoutError, LayoutParams, expand_layout
from icarus.library.parts import Part, Raw
from icarus.library.pieces import PIECES

Vector3 = tuple[float, float, float]
MAX_PIECES, MAX_OBJECTS, MAX_LAMPS = 60, 12, 6
# A camera lower than this, in metres, sees the ground from below.
LOWEST_CAMERA = 0.1
_LAYOUT: TypeAdapter[LayoutParams] = TypeAdapter(LayoutParams)
_VALUE: TypeAdapter[PropertyValue] = TypeAdapter(PropertyValue)
# Kept when a plan replaces the scene: what every world needs and what the task reads.
KEPT_KINDS = frozenset({"surface", "light", "sky", "spawn_point", "goal_zone"})


class _Plan(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SceneCamera(_Plan):
    """Where the reference picture was taken from, estimated so a render can be compared with it."""

    lookat: Vector3
    distance_m: float = Field(ge=0.5, le=200)
    azimuth_deg: float = Field(ge=-360, le=360, description="0 looks along +x, 90 along +y.")
    elevation_deg: float = Field(
        ge=-89, le=89, description="Below zero looks down from above, as almost every photo does (e.g. -20)."
    )
    fov_deg: float = Field(ge=10, le=120)

    def height(self) -> float:
        """How high the camera stands above the ground."""
        return self.lookat[2] - self.distance_m * math.sin(math.radians(self.elevation_deg))

    def above_ground(self) -> "SceneCamera":
        """The same view from above the ground: a camera under the ground looks up at the scene upside down."""
        if self.height() >= LOWEST_CAMERA:
            return self
        turned = self.model_copy(update={"elevation_deg": -abs(self.elevation_deg)})
        if turned.height() >= LOWEST_CAMERA:
            return turned
        drop = (LOWEST_CAMERA - self.lookat[2]) / self.distance_m
        return turned.model_copy(update={"elevation_deg": -math.degrees(math.asin(min(drop, 0.99)))})


class SceneSky(_Plan):
    preset: Literal["day", "dusk", "night", "overcast", "custom"]
    clock_time: float | None = Field(ge=0, le=24, description="Hour of day for the sun; null keeps the preset's.")
    clouds: float = Field(ge=0, le=1)
    haze: float = Field(ge=0, le=1)
    fog: float = Field(ge=0, le=1)
    ambient: float = Field(ge=0, le=2)
    top: str | None = Field(pattern=COLOR, description="Sky colors, used only with preset custom.")
    horizon: str | None = Field(pattern=COLOR)


class SceneGround(_Plan):
    surface: Surface
    color: str = Field(pattern=COLOR)
    finish: GeomFinish


class SceneSun(_Plan):
    intensity: float = Field(ge=0, le=5)
    color: str = Field(pattern=COLOR)


class ScenePiece(_Plan):
    """A ready-made library piece placed in the scene, resting on the ground unless lifted."""

    id: str = Field(pattern=PLAN_ID)
    piece: str = Field(description="A library piece id.")
    name: str = Field(min_length=1, max_length=60)
    position: tuple[float, float] = Field(description="World x, y of its center.")
    lift_m: float = Field(default=0, ge=0, le=50, description="Height of its bottom above the ground.")
    heading_deg: float = Field(default=0, ge=-360, le=360)
    size: Vector3 | None = Field(default=None, description="Full size in metres; null keeps the piece's own.")
    color: str | None = Field(default=None, pattern=COLOR)
    finish: GeomFinish | None = None


class SceneLamp(_Plan):
    id: str = Field(pattern=PLAN_ID)
    name: str = Field(min_length=1, max_length=60)
    position: Vector3
    intensity: float = Field(ge=0, le=5)
    color: str = Field(pattern=COLOR)


class ScenePlan(_Plan):
    place: str = Field(min_length=1, max_length=300, description="What the scene is, in one sentence.")
    scale_anchor: str = Field(min_length=1, max_length=200, description="What sets the scale, with its size.")
    palette: list[str] = Field(min_length=2, max_length=8)
    camera: SceneCamera
    ground: SceneGround
    sky: SceneSky
    sun: SceneSun
    layout: PlanLayout | None = Field(description="A layout recipe when the place is clearly one of them.")
    pieces: list[ScenePiece] = Field(max_length=MAX_PIECES)
    objects: list[CompoundObject] = Field(max_length=MAX_OBJECTS, description="Things no piece fits, built of parts.")
    lamps: list[SceneLamp] = Field(max_length=MAX_LAMPS)
    left_out: list[str] = Field(max_length=12, description="Things in the reference this plan cannot express.")


class Move(_Plan):
    action: Literal["move"]
    item: str
    position: Vector3 = Field(description="New x, y and lift (pieces) or origin (objects) in the world.")
    heading_deg: float | None = Field(default=None, ge=-360, le=360)


class Resize(_Plan):
    action: Literal["resize"]
    item: str
    factor: float = Field(gt=0.1, le=10, description="Uniform scale of the whole item.")


class Restyle(_Plan):
    action: Literal["restyle"]
    item: str
    part: str | None = Field(default=None, description="One part of an object; null for the whole item.")
    color: str | None = Field(default=None, pattern=COLOR)
    finish: GeomFinish | None = None
    roughness: float | None = Field(default=None, ge=0, le=1)
    metalness: float | None = Field(default=None, ge=0, le=1)
    emissive: float | None = Field(default=None, ge=0, le=3)


class Remove(_Plan):
    action: Literal["remove"]
    item: str
    part: str | None = Field(default=None, description="One part of an object and the parts on it; null for the item.")


class AddPiece(_Plan):
    action: Literal["add_piece"]
    piece: ScenePiece


class AddObject(_Plan):
    action: Literal["add_object"]
    object: CompoundObject


class SetLook(_Plan):
    """New ground, sky, sun or camera; null keeps the current one."""

    action: Literal["set_look"]
    ground: SceneGround | None = None
    sky: SceneSky | None = None
    sun: SceneSun | None = None
    camera: SceneCamera | None = None


Correction = Annotated[Move | Resize | Restyle | Remove | AddPiece | AddObject | SetLook, Field(discriminator="action")]


@dataclass
class Assembly:
    # The scene's look, the clearing and the layout, which every item builds on.
    base: list[EditOperation]
    # Plan item id → the operations that build it, so an item that breaks the design can be left out alone.
    items: dict[str, list[EditOperation]] = field(default_factory=dict)
    not_placed: list[str] = field(default_factory=list)

    @property
    def operations(self) -> list[EditOperation]:
        return [*self.base, *(op for operations in self.items.values() for op in operations)]


def _value(kind: str, prop: str, raw: Raw) -> PropertyValue:
    schema = next(item for item in component_kind(kind).properties if item.id == prop)
    return _VALUE.validate_python({"type": schema.type, "value": raw})


def _owner(project: Project, kind: str, test=lambda component: True) -> tuple[str, str] | None:
    """The first world object with a component of this kind, and that component's id."""
    for obj in project.world.objects:
        for component in obj.components:
            if component.kind == kind and test(view(obj, kind)):
                return obj.id, component.id
    return None


def _sets(owner: tuple[str, str] | None, kind: str, values: dict[str, Raw]) -> list[EditOperation]:
    if owner is None:
        return []
    obj, component = owner
    return [
        SetProperty(op="set_property", object=obj, component=component, property=prop, value=_value(kind, prop, raw))
        for prop, raw in values.items()
    ]


def look_operations(project: Project, plan: ScenePlan) -> tuple[list[EditOperation], list[str]]:
    """Ground, sun and sky set on the objects the world already has; a missing sky is created."""
    ground, sky, sun = plan.ground, plan.sky, plan.sun
    missing: list[str] = []
    surface = _owner(project, "surface")
    material = _component_of(project, surface[0], "material") if surface else None
    if surface is None:
        missing.append("ground: this world has no ground to restyle")
    operations = _sets(surface, "surface", {"kind": ground.surface, "friction": SURFACE_FRICTION[ground.surface]})
    operations += _sets(
        material, "material", {"surface": ground.surface, "color": ground.color, "finish": ground.finish}
    )
    sun_owner = _owner(project, "light", lambda light: light is not None and light.text("kind") == "sun")
    operations += _sets(sun_owner, "light", {"intensity": sun.intensity, "color": sun.color})
    if sun_owner is None:
        missing.append("sun: this world has no sun light to set")
    values: dict[str, Raw] = {"preset": sky.preset, "clouds": sky.clouds, "haze": sky.haze, "fog": sky.fog}
    values |= {"ambient": sky.ambient, "use_clock": sky.clock_time is not None}
    if sky.clock_time is not None:
        values["clock_time"] = sky.clock_time
    if sky.preset == "custom":
        values |= {key: color for key, color in (("top", sky.top), ("horizon", sky.horizon)) if color}
    sky_owner = _owner(project, "sky")
    if sky_owner is None:
        sky_part = Part("sky", "Sky", None, {"sky": values})
        operations.append(CreateObject(op="create_object", target="world", object=sky_part.spec()))
    else:
        operations += _sets(sky_owner, "sky", values)
    return operations, missing


def _component_of(project: Project, object_id: str, kind: str) -> tuple[str, str] | None:
    obj = next(item for item in project.world.objects if item.id == object_id)
    found = next((component.id for component in obj.components if component.kind == kind), None)
    return (object_id, found) if found else None


def piece_size(piece: ScenePiece) -> Vector3 | None:
    """The size the piece takes: the plan's, else the library piece's own; None for an unknown piece."""
    info = PIECES.get(piece.piece)
    if info is None:
        return None
    mesh = view(info.object, "mesh")
    return piece.size or (mesh.vector("size") if mesh else (1.0, 1.0, 1.0))


def piece_object(piece: ScenePiece, object_id: str) -> ObjectSpec | str:
    """The library piece as a new world object at the plan's place and size, or why it cannot be."""
    info, size = PIECES.get(piece.piece), piece_size(piece)
    if info is None or size is None:
        return f"{piece.name}: there is no library piece `{piece.piece}`"
    if not all(0.001 <= value <= 100 for value in size):
        return f"{piece.name}: each size must be between 0.001 and 100 m, not {list(size)}"
    source = info.object
    mesh = view(source, "mesh")
    transform = view(source, "transform")
    shape = mesh.text("shape") if mesh else "box"
    height = size[0] if shape == "sphere" else size[2]
    turn = transform.vector("rotation") if transform else (0.0, 0.0, 0.0)
    components = []
    for component in source.components:
        properties = dict(component.properties)
        if component.kind == "mesh":
            properties["size"] = _value("mesh", "size", size)
        if component.kind == "material":
            properties |= {"color": _value("material", "color", piece.color)} if piece.color else {}
            properties |= {"finish": _value("material", "finish", piece.finish)} if piece.finish else {}
        components.append(component.model_copy(update={"properties": properties}))
    built = ObjectSpec(id=object_id, name=piece.name, parent=None, components=components)
    where = Placement(
        (piece.position[0], piece.position[1], piece.lift_m + height / 2),
        wrapped((turn[0], turn[1], turn[2] + piece.heading_deg)),
        transform.vector("scale") if transform else (1.0, 1.0, 1.0),
    )
    return placed(built, where)


def _lamp(lamp: SceneLamp, object_id: str) -> ObjectSpec:
    light: dict[str, Raw] = {"kind": "point", "intensity": lamp.intensity, "color": lamp.color}
    return Part(object_id, lamp.name, None, {"transform": {"position": lamp.position}, "light": light}).spec()


def clearing_operations(project: Project) -> list[EditOperation]:
    """Deletes the world's top-level objects except the ground, lights, sky, spawn and goal."""
    return [
        DeleteObject(op="delete_object", object=obj.id)
        for obj in project.world.objects
        if obj.parent is None and not {component.kind for component in obj.components} & KEPT_KINDS
    ]


def scene_operations(project: Project, plan: ScenePlan, clear: bool = False) -> Assembly:
    """The plan as edit operations on top of the project, with each item's own operations and what was left out."""
    operations, missing = look_operations(project, plan)
    assembly = Assembly([*clearing_operations(project), *operations] if clear else operations)
    assembly.not_placed += missing + [f"{thing}: not expressible in this plan" for thing in plan.left_out]
    ids = Ids(project)
    if plan.layout:
        try:
            layout = expand_layout(
                _LAYOUT.validate_python({"recipe": plan.layout.recipe, "seed": plan.layout.seed}), project
            )
        except LayoutError as error:
            assembly.not_placed.append(f"layout {plan.layout.recipe}: {error}")
        else:
            assembly.base += layout.operations
            ids.taken |= {op.object.id for op in layout.operations if isinstance(op, CreateObject)}
    for piece in plan.pieces:
        built = piece_object(piece, piece.id if piece.id not in ids.taken else ids.fresh(piece.id))
        if isinstance(built, str):
            assembly.not_placed.append(built)
            continue
        ids.taken.add(built.id)
        assembly.items[piece.id] = [CreateObject(op="create_object", target="world", object=built)]
    for compound in plan.objects:
        problems = compound_problems(compound)
        if problems:
            assembly.not_placed.append(f"{compound.name}: {'; '.join(problems)}")
            continue
        assembly.items[compound.id] = compound_operations(project, compound, ids)
    for lamp in plan.lamps:
        lamp_id = lamp.id if lamp.id not in ids.taken else ids.fresh(lamp.id)
        ids.taken.add(lamp_id)
        assembly.items[lamp.id] = [CreateObject(op="create_object", target="world", object=_lamp(lamp, lamp_id))]
    return assembly
