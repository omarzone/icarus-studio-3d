from icarus.contracts.library import ComponentGroupName, ComponentKindSpec
from icarus.contracts.objects import ComponentSpec
from icarus.contracts.properties import PropertySchema
from icarus.library.properties import (
    choice,
    color,
    count,
    listing,
    number,
    reference,
    slider,
    span,
    switch,
    vector,
)

SURFACES = ["asphalt", "grass", "ice", "rubber", "wood", "metal"]


class UnknownKind(KeyError):
    pass


def _kind(
    kind: str, label: str, icon: str, group: ComponentGroupName, properties: list[PropertySchema], *, unique: bool
) -> ComponentKindSpec:
    return ComponentKindSpec(kind=kind, label=label, icon=icon, group=group, properties=properties, unique=unique)


_KINDS = [
    _kind(
        "transform",
        "Transform",
        "transform",
        "Shape",
        [
            vector("position", "Position", "m", -1000, 1000, (0, 0, 0)),
            vector("rotation", "Rotation", "deg", -360, 360, (0, 0, 0), hint="Applied around X, then Y, then Z"),
            vector("scale", "Scale", None, 0.01, 100, (1, 1, 1)),
        ],
        unique=True,
    ),
    _kind(
        "mesh",
        "Mesh",
        "mesh",
        "Shape",
        [
            listing("shape", "Shape", ["box", "sphere", "capsule", "cylinder", "plane"], "box"),
            vector("size", "Size", "m", 0.001, 100, (1, 1, 1), hint="Full width, depth and height"),
        ],
        unique=True,
    ),
    _kind(
        "material",
        "Material",
        "material",
        "Shape",
        [color("color", "Color", "#8a8f98"), listing("surface", "Surface", SURFACES, "rubber")],
        unique=True,
    ),
    _kind(
        "light",
        "Light",
        "sun",
        "World",
        [
            choice("kind", "Kind", ["sun", "point"], "sun"),
            slider("intensity", "Intensity", 0, 5, 0.1, 1),
            color("color", "Color", "#ffffff"),
        ],
        unique=True,
    ),
    _kind(
        "physics_body",
        "Physics body",
        "physics",
        "Physics",
        [
            choice("mode", "Mode", ["static", "dynamic"], "dynamic"),
            number("mass", "Mass", "kg", 0.001, 10_000, 1),
            number("density", "Density", "kg/m³", 1, 20_000, 1000, expert=True),
        ],
        unique=True,
    ),
    _kind(
        "collider",
        "Collider",
        "collider",
        "Physics",
        [
            slider("friction", "Friction", 0, 2, 0.05, 0.8, randomizable=True),
            slider("restitution", "Bounciness", 0, 1, 0.05, 0, expert=True),
        ],
        unique=True,
    ),
    _kind(
        "joint",
        "Joint",
        "joint",
        "Physics",
        [
            choice("kind", "Kind", ["hinge", "slide", "ball", "fixed"], "hinge"),
            vector("axis", "Axis", None, -1, 1, (0, 1, 0)),
            span("limits", "Limits", "deg or m", -180, 180, (-90, 90)),
            vector("anchor", "Anchor", "m", -10, 10, (0, 0, 0), hint="Where the joint sits, from the object's center"),
            number("damping", "Damping", "N·s/m", 0, 100, 0.5, expert=True),
            reference("connects_to", "Connects to", "Object it hinges on; empty means its parent"),
        ],
        unique=True,
    ),
    _kind(
        "motor",
        "Motor",
        "motor",
        "Physics",
        [
            reference("joint", "Joint", "Object whose joint this motor drives; empty means this object"),
            choice("kind", "Kind", ["position", "torque"], "position"),
            number("max_force", "Max force", "N", 0, 10_000, 50),
            number("gear", "Gear", "×", 0.01, 1000, 1, expert=True),
        ],
        unique=True,
    ),
    _kind(
        "distance_ray",
        "Distance ray",
        "ray",
        "Senses",
        [number("range", "Range", "m", 0.05, 50, 5), count("count", "Rays", 1, 32, 5)],
        unique=True,
    ),
    _kind(
        "balance",
        "Balance",
        "balance",
        "Senses",
        [choice("includes", "Includes", ["accel+gyro", "gyro"], "accel+gyro")],
        unique=True,
    ),
    _kind("touch", "Touch", "touch", "Senses", [number("radius", "Radius", "m", 0.005, 1, 0.05)], unique=True),
    _kind(
        "spawn_point", "Spawn point", "spawn", "World", [switch("random_heading", "Random heading", False)], unique=True
    ),
    _kind("goal_zone", "Goal zone", "goal", "World", [number("radius", "Radius", "m", 0.1, 20, 1)], unique=True),
    _kind(
        "zone",
        "Zone",
        "zone",
        "World",
        [
            vector("size", "Size", "m", 0.1, 500, (4, 4, 1)),
            choice("effect", "Effect", ["none", "slow", "slippery"], "none"),
        ],
        unique=True,
    ),
    _kind(
        "surface",
        "Surface",
        "terrain",
        "World",
        [
            listing("kind", "Kind", SURFACES, "asphalt"),
            slider("friction", "Friction", 0, 2, 0.05, 1, randomizable=True),
        ],
        unique=True,
    ),
]

COMPONENTS: dict[str, ComponentKindSpec] = {kind.kind: kind for kind in _KINDS}


def component_kind(kind: str) -> ComponentKindSpec:
    try:
        return COMPONENTS[kind]
    except KeyError as error:
        raise UnknownKind(kind) from error


def default_component(kind: str, id: str) -> ComponentSpec:
    spec = component_kind(kind)
    return ComponentSpec(id=id, kind=kind, properties={prop.id: prop.default for prop in spec.properties})
