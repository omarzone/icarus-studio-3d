from icarus.contracts.library import ComponentGroupName, ComponentKindSpec
from icarus.contracts.objects import ComponentSpec
from icarus.contracts.properties import PropertySchema
from icarus.contracts.scene import GEOM_FINISHES, GEOM_STYLES, GEOM_SURFACES
from icarus.library.decor_kinds import DECOR_KINDS
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
from icarus.library.vehicle_kinds import VEHICLE_KINDS

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
    "puddle, parked_car, pickup, hatchback and suv (box: a vehicle with its wheels), trunk and pole (cylinder), "
    "gate_post, bin, hydrant, planter, sidewalk (a slab with a curb edge), and paint without a collider: crosswalk, "
    "dashed_line, parking_mark (a P), road_arrow. What reaches past the shape, like a crown or a lamp's arm, is an "
    "ornament component"
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
    "several rays fan out across Spread, centered on it"
)
RAY_SPREAD_HINT = "Angle the rays fan across; 360 lays them evenly all the way around, behind included"
GOAL_SHAPE_HINT = (
    "Circle uses Radius; Rectangle uses Length along the spot's heading (the object's rotation around Z) and Width"
)
ENTRY_HINT = (
    "Which way the body must face once inside when Aligned within is under 180°: either way, nose in (facing the "
    "spot's heading) or back in (facing the opposite way)"
)
SKIN_HINT = (
    "Id of a glTF or GLB model stored with the project (from an import or a model attached in the chat); "
    "drawn scaled to fit inside the collider, never read by physics"
)
BEVEL_HINT = "Drawing only: rounds a box's edges by this radius inside its shape; the collider stays a sharp box"
GROUND_SIZE_HINT = (
    "Width, depth and thickness of the floor slab; its top stays at the object's height and bodies that drive or "
    "walk past an edge fall off"
)
SPAWN_MODES = ["auto", "fixed", "area", "anywhere", "random_point", "cycle_points"]
SPAWN_MODE_LABELS = {"anywhere": "Anywhere free on the map"}
SPAWN_MODE_HINT = (
    "Where each try starts. auto: navigation bodies start a little beside and behind where they stand, turned up to "
    "35°, others exactly where they stand. fixed: exactly here. area: anywhere in Area around here, turned within "
    "Heading range; an Area left at 0 × 0 starts anywhere free on the map. anywhere: a free place anywhere on the "
    "floor (the layout's drawn floor, else the ground slab), clear of every obstacle by the body's width, at least "
    "Away from goal beyond the goal zone and with a way to it, facing any direction unless Heading range limits the "
    "turn from this spawn point's heading. random_point or cycle_points: at one of the world's spawn points, picked "
    "at random or in turn, each with its own Area and Heading range. Training copies vary by their seed; "
    "evaluations repeat the same starts"
)
SPAWN_AREA_HINT = (
    "Width and depth of the rectangle around the spawn point a try may start in, along its heading; 0 × 0 with Start "
    "area uses the whole free map"
)
GOAL_DISTANCE_HINT = "Start anywhere: how far beyond the goal zone's edge a try starts at least"
RANDOM_HEADING_HINT = "Not with Start auto: each try may face any direction, whatever Heading range says"
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
            slider("bevel", "Rounded edges", 0, 0.5, 0.01, 0, unit="m", hint=BEVEL_HINT),
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
            number("spread", "Spread", "°", 0, 360, 60, hint=RAY_SPREAD_HINT),
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
        "spawn_point",
        "Spawn point",
        "spawn",
        "World",
        [
            choice("mode", "Start", SPAWN_MODES, "auto", hint=SPAWN_MODE_HINT, labels=SPAWN_MODE_LABELS),
            vector("area", "Area", "m", 0, 200, (0, 0, 0), hint=SPAWN_AREA_HINT),
            number(
                "heading_range",
                "Heading range",
                "°",
                0,
                180,
                0,
                hint="Each try turns the body up to this far; with Start anywhere 0 leaves the heading free",
            ),
            switch("random_heading", "Random heading", False, hint=RANDOM_HEADING_HINT),
            number("goal_distance", "Away from goal", "m", 0, 50, 3, hint=GOAL_DISTANCE_HINT),
        ],
        unique=True,
    ),
    _kind(
        "goal_zone",
        "Goal zone",
        "goal",
        "World",
        [
            number("radius", "Radius", "m", 0.1, 20, 1),
            choice("shape", "Shape", ["circle", "rectangle"], "circle", hint=GOAL_SHAPE_HINT),
            number("length", "Length", "m", 0.2, 50, 5),
            number("width", "Width", "m", 0.2, 50, 2.6),
            switch("fully_inside", "Fully inside", False, hint="On: the whole body must be inside, not its center"),
            number("align_within", "Aligned within", "°", 1, 180, 180, hint="180 leaves the heading free"),
            choice("entry", "Entry", ["either", "nose_in", "back_in"], "either", hint=ENTRY_HINT),
            number("stop_speed", "Stopped below", "m/s", 0.01, 5, 0.2, hint="The try succeeds only below this speed"),
        ],
        unique=True,
    ),
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
    # The world's floor as a slab with edges: bodies that leave it fall (see design/compiler.py).
    _kind(
        "ground",
        "Ground",
        "terrain",
        "World",
        [vector("size", "Size", "m", 0.05, 1000, (100, 100, 1), hint=GROUND_SIZE_HINT)],
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

COMPONENTS: dict[str, ComponentKindSpec] = {kind.kind: kind for kind in [*_KINDS, *VEHICLE_KINDS, *DECOR_KINDS]}


def component_kind(kind: str) -> ComponentKindSpec:
    try:
        return COMPONENTS[kind]
    except KeyError as error:
        raise UnknownKind(kind) from error


def default_component(kind: str, id: str) -> ComponentSpec:
    spec = component_kind(kind)
    return ComponentSpec(id=id, kind=kind, properties={prop.id: prop.default for prop in spec.properties})
