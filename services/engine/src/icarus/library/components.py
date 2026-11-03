from icarus.contracts.library import ComponentGroupName, ComponentKindSpec
from icarus.contracts.objects import ComponentSpec
from icarus.contracts.properties import PropertySchema
from icarus.contracts.scene import GEOM_FINISHES, GEOM_STYLES, GEOM_SURFACES
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
    text,
    vector,
)

# Furthest a randomized object may move per axis on each try, in metres.
POSITION_RANGE_MAX = 50.0

SURFACES = GEOM_SURFACES
# Friction is what the physics uses; the kind names the look, and these values and colors match each kind.
SURFACE_HINT = (
    "Friction and look: asphalt 1 dark grey, concrete 0.9 light grey, grass 0.6 green, snow 0.3 white, "
    "ice 0.05 pale blue, rubber 1.2 black, wood 0.7 brown, metal 0.5 steel"
)
# The style only changes the drawing, never the collider: the drawing stays inside the part's shape.
STYLE_HINT = (
    "How the part is drawn inside its shape: car_body (box: shell, cabin, windows, lights), wheel (cylinder: tire and "
    "rim), shell and joint (robot body and limbs), crate, wall, curb, post, cone, lamp_post, tree, ball, marking "
    "(paint on the ground, usually a static part without a collider), stairs, step, slab, pillar, planks, speed_bump, "
    "wheel_stop, barrier, fence, sign, building, house, garage, table, bench, shelf, bush, rock, barrel, crate_stack, "
    "puddle, parked_car (box: a car with its wheels)"
)
FINISH_HINT = (
    "Pattern on the faces, drawing only: brick, concrete, asphalt (with lane lines), wood planks, tiles, "
    "painted_metal, glass, grass, fabric, rubber; plain keeps the style's own look"
)
ADJUST_HINT = "Drawing only: 0.5 keeps the finish's own, lower for less, higher for more"
EMISSIVE_HINT = "Drawing only: glow in the part's color; lights a style's windows and lamp heads, else the whole part"
RAY_NAME_HINT = "How the brain and the senses name these rays, such as Front or Left; empty uses the part's name"
RAY_HEADING_HINT = (
    "Where the rays point around the part: 0 is straight ahead, above zero turns them left and below zero right; "
    "several rays fan 30° to each side of it"
)
SKIN_HINT = (
    "Id of a glTF or GLB model stored with the project (from an import or a model attached in the chat); "
    "drawn scaled to fit inside the collider, never read by physics"
)
SKY_PRESETS = ["day", "dusk", "night", "overcast", "custom"]
CLOCK_HINT = (
    "On: Clock time moves every sun light across the sky (Latitude sets how high it climbs) and, unless the preset is "
    "Custom, colors the sky for that hour; the light's own rotation is then ignored"
)


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
        [
            color("color", "Color", "#8a8f98"),
            listing("surface", "Surface", SURFACES, "rubber", hint=SURFACE_HINT),
            listing("style", "Style", GEOM_STYLES, "plain", hint=STYLE_HINT),
            slider("transparency", "Transparency", 0, 1, 0.05, 0, hint="Drawing only: sensors still see it"),
            slider("reflectance", "Reflectance", 0, 1, 0.05, 0, hint="Mirrors the sky; drawing only"),
            switch("cast_shadow", "Cast shadow", True),
            listing("finish", "Finish", GEOM_FINISHES, "plain", hint=FINISH_HINT),
            slider("roughness", "Roughness", 0, 1, 0.05, 0.5, hint=ADJUST_HINT),
            slider("metalness", "Metalness", 0, 1, 0.05, 0.5, hint=ADJUST_HINT),
            slider("emissive", "Glow", 0, 3, 0.1, 0, hint=EMISSIVE_HINT),
        ],
        unique=True,
    ),
    # A 3D model drawn over the part, fitted inside its collider; physics and training never read it (ADR 008).
    _kind(
        "skin",
        "Skin",
        "mesh",
        "Shape",
        [
            reference("asset", "Model", SKIN_HINT),
            slider("fill", "Fill", 0.1, 1, 0.05, 1, hint="How much of the collider the model fills; drawing only"),
            vector("offset", "Offset", "m", -10, 10, (0, 0, 0), hint="Shifts the model; it never leaves the collider"),
            vector("rotation", "Rotation", "deg", -360, 360, (0, 0, 0), hint="Turns the model before it is fitted"),
        ],
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
            switch("shadows", "Shadows", True, hint="Only the first sun with shadows on casts them"),
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
            choice(
                "kind",
                "Kind",
                ["hinge", "slide", "ball", "fixed"],
                "hinge",
                hint="Ball turns freely on every axis: on a sphere with limits (-180, 180) and no motor it is a caster",
            ),
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
        [
            text("name", "Name", hint=RAY_NAME_HINT),
            number("heading", "Heading", "°", -180, 180, 0, hint=RAY_HEADING_HINT),
            number("range", "Range", "m", 0.05, 50, 5),
            count("count", "Rays", 1, 32, 5),
            number("tilt", "Tilt", "°", -60, 30, 0, hint="Below zero the rays look down, to see low obstacles"),
        ],
        unique=False,
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
            choice(
                "effect",
                "Effect",
                ["none", "slow", "slippery"],
                "none",
                hint="Lays a thin floor patch at the zone's height: slippery grips like ice, slow resists rolling like "
                "mud (wheels and balls); place the zone on the ground",
            ),
        ],
        unique=True,
    ),
    _kind(
        "surface",
        "Surface",
        "terrain",
        "World",
        [
            listing("kind", "Kind", SURFACES, "asphalt", hint=f"{SURFACE_HINT}; set Friction to match the kind"),
            slider("friction", "Friction", 0, 2, 0.05, 1, randomizable=True),
        ],
        unique=True,
    ),
    # How the world looks around it; one per world and never part of the physics (see design/sky.py).
    _kind(
        "sky",
        "Sky",
        "sky",
        "World",
        [
            choice("preset", "Preset", SKY_PRESETS, "day"),
            color("top", "Top color", "#5f8fc4", hint="Used when the preset is Custom"),
            color("horizon", "Horizon color", "#e4ecef", hint="Used when the preset is Custom"),
            slider("ambient", "Ambient light", 0, 2, 0.05, 1),
            color("ambient_color", "Ambient color", "#ffffff", hint="Tint of the light the sky adds everywhere"),
            slider("fog", "Fog", 0, 1, 0.05, 0),
            switch("use_clock", "Time of day", False, hint=CLOCK_HINT),
            slider("clock_time", "Clock time", 0, 24, 0.25, 14, unit="h"),
            slider("latitude", "Latitude", -66, 66, 1, 42, unit="°", expert=True),
            slider("sun_size", "Sun size", 0, 30, 1, 0, unit="°", hint="The sun's disc on the sky; 0 hides it"),
            slider("glare", "Glare", 0, 1, 0.05, 0, hint="Glow around the sun"),
            slider("haze", "Haze", 0, 1, 0.05, 0, hint="Whitens the sky near the horizon"),
            slider("stars", "Stars", 0, 1, 0.05, 0, hint="Show once the sky is dark"),
            slider("clouds", "Cloud cover", 0, 1, 0.05, 0),
            slider("cloud_density", "Cloud density", 0, 1, 0.05, 0.7),
            color("cloud_color", "Cloud color", "#ffffff"),
            switch("shadows", "Shadows", True),
            slider("shadow_softness", "Shadow softness", 0, 1, 0.05, 0.5),
            slider("exposure", "Exposure", -3, 3, 0.1, 0, hint="1 doubles the light, -1 halves it"),
            slider("brightness", "Brightness", -1, 1, 0.05, 0, hint="Color grading of the image; 0 keeps it"),
            slider("contrast", "Contrast", -1, 1, 0.05, 0),
            slider("saturation", "Saturation", -1, 1, 0.05, 0, hint="-1 is black and white"),
            color("tint", "Tint", "#ffffff", hint="The image is multiplied by it; white keeps it"),
        ],
        unique=True,
    ),
    # What changes between training copies and on every try; world objects only (see sim/variation.py).
    _kind(
        "randomize",
        "Randomize per copy",
        "shuffle",
        "Learning",
        [
            vector(
                "position_range",
                "Position range",
                "m",
                0,
                POSITION_RANGE_MAX,
                (0, 0, 0),
                hint="Each try moves the object up to this far either way on X and Y, and only up on Z",
            ),
            number(
                "rotation_range", "Rotation range", "deg", 0, 180, 0, hint="Each try turns it up to this far either way"
            ),
            switch("color", "Vary color", False, hint="Each try shifts its material color a little"),
            slider("friction_spread", "Friction spread", 0, 50, 5, 0, unit="%"),
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
