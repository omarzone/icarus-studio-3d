"""Floor plates the task watches (design/plates.py, sim/plates.py), digital displays that show engine values
(sim/displays.py), cartoon eyes and ornaments; displays, eyes and ornaments are look-only."""

from icarus.contracts.decor import DISPLAY_FORMATS, DISPLAY_SOURCES, DISPLAY_STYLES, EYES_LOOKS, PLATE_ROLES
from icarus.contracts.library import ComponentKindSpec
from icarus.contracts.scene import ORNAMENT_STYLES
from icarus.library.properties import choice, color, count, listing, number, reference, slider, switch, text, vector

ROLE_HINT = (
    "Pressure sinks under weight, Target is a goal to step on, Start is a striped pad to start from (never a goal), "
    "Custom is any other place to step on; every plate but a start pad counts for the plate rewards when the world "
    "has no target plate"
)
PLATE_SIZE_HINT = "Width, depth and thickness; a circle uses the width as its diameter. It lies on the floor"
TRIGGER_HINT = (
    "Touch: what it watches pushes on the plate with at least Press force (MuJoCo contacts). Center: what it "
    "watches has its center over the plate"
)
WATCH_HINT = "Agent: the body. Object: the world object set in Object. Anything: any moving body"
ORDER_HINT = "Its place when the plates must be reached in order (1 first); 0 leaves it out of the order"
SOURCE_HINT = (
    "episode_time (s), step (control steps this try), try (tries of this copy), training_steps (the brain's "
    "training steps: live run, replayed checkpoint or Play's brain), successes, reward (this try's return), "
    "goal_distance (m), goal_progress (0 to 1 of the way to the goal), sensor (one reading, see Sensor), plates "
    "(plates reached this try) or fixed (shows Text)"
)
FORMAT_HINT = "Integer, Decimal (with Decimals), Time as mm:ss, or Text for a fixed value"
SENSOR_HINT = "A sensor reading id as Play lists it, or an object id: its first sensor"
ORNAMENT_STYLE_HINT = (
    "crown_round, crown_cone and crown_oval are tree crowns of leaves; lamp_arm is an arm along +X with a glowing "
    "head at its end; gate_arm is a striped barrier boom along +X; sign_plate is a sign face with a P; shrubs are "
    "plants for a planter"
)
ORNAMENT_SIZE_HINT = (
    "Length (X), width (Y) and height (Z) it is drawn at, past the part's collider if need be; drawing only, nothing "
    "collides with it and sensors look through it"
)
ORNAMENT_OFFSET_HINT = "From the part's center to the ornament's center, in the part's own axes"
LOOK_HINT = "Ahead keeps them still; Movement follows the way the body moves; Goal follows the goal zone"

DECOR_KINDS = [
    ComponentKindSpec(
        kind="plate",
        label="Floor plate",
        icon="target",
        group="World",
        unique=True,
        properties=[
            choice("role", "Role", PLATE_ROLES, "target", hint=ROLE_HINT),
            choice("shape", "Shape", ["rectangle", "circle"], "rectangle"),
            vector("size", "Size", "m", 0.005, 50, (1.2, 1.2, 0.02), hint=PLATE_SIZE_HINT),
            choice("trigger", "Trigger", ["touch", "center"], "touch", hint=TRIGGER_HINT),
            choice("watch", "Watches", ["agent", "object", "anything"], "agent", hint=WATCH_HINT),
            reference("object", "Object", "The object it watches when Watches is Object"),
            number("press_force", "Press force", "N", 0, 10_000, 5, hint="Least push that counts as a press"),
            count("order", "Order", 0, 32, 0, hint=ORDER_HINT),
            color("color", "Color", "#34c759"),
            slider("sink", "Sink", 0, 0.05, 0.005, 0.01, unit="m", expert=True, hint="Drawing only, while pressed"),
        ],
    ),
    ComponentKindSpec(
        kind="display",
        label="Display",
        icon="lines",
        group="Shape",
        unique=True,
        properties=[
            listing("source", "Shows", DISPLAY_SOURCES, "episode_time", hint=SOURCE_HINT),
            choice("format", "Format", DISPLAY_FORMATS, "time", hint=FORMAT_HINT),
            count("decimals", "Decimals", 0, 3, 1),
            text("label", "Label", hint="Shown before the value, such as TIME or GEN"),
            text("text", "Text", hint="The value shown when Shows is Fixed"),
            text("sensor", "Sensor", hint=SENSOR_HINT),
            choice("style", "Style", DISPLAY_STYLES, "panel", hint="Panel shows digits; Bar fills up to Full scale"),
            number("full_scale", "Full scale", None, 0.001, 1_000_000, 1, hint="The value a bar shows full"),
            vector(
                "offset",
                "Offset",
                "m",
                -10,
                10,
                (0, 0, 0),
                hint="From the part's center, in its own axes (in world axes when it faces the camera)",
            ),
            number("heading", "Heading", "°", -180, 180, 0, hint="Which way the panel faces; 0 is the part's +X"),
            number("width", "Width", "m", 0.1, 20, 1),
            switch("billboard", "Face the camera", False),
            color("color", "Color", "#ff3b30"),
        ],
    ),
    ComponentKindSpec(
        kind="eyes",
        label="Eyes",
        icon="eye",
        group="Shape",
        unique=True,
        properties=[
            number("size", "Size", "m", 0.01, 1, 0.08, hint="Each eye's diameter"),
            number("spacing", "Spacing", "m", 0.01, 2, 0.12, hint="Between the eyes' centers"),
            number("height", "Height", "m", -2, 2, 0.05, hint="Up from the part's center"),
            number("facing", "Facing", "°", -180, 180, 0, hint="Which side of the part they sit on; 0 is its +X"),
            color("color", "Pupil color", "#111111"),
            color("white", "Eye color", "#ffffff"),
            number("blink_interval", "Blink every", "s", 0.5, 30, 3),
            slider("blink_jitter", "Blink randomness", 0, 1, 0.05, 0.5),
            choice("look", "Look", EYES_LOOKS, "ahead", hint=LOOK_HINT),
        ],
    ),
    ComponentKindSpec(
        kind="ornament",
        label="Ornament",
        icon="terrain",
        group="Shape",
        unique=False,
        properties=[
            choice("style", "Style", ORNAMENT_STYLES, "crown_round", hint=ORNAMENT_STYLE_HINT),
            vector("size", "Size", "m", 0.02, 30, (3, 3, 3), hint=ORNAMENT_SIZE_HINT),
            vector("offset", "Offset", "m", -30, 30, (0, 0, 2), hint=ORNAMENT_OFFSET_HINT),
            vector("rotation", "Rotation", "deg", -360, 360, (0, 0, 0), hint="Turns it around its own center"),
            color("color", "Color", "#4f8a3c"),
            color("accent", "Accent", "#f2f2f2", hint="A boom's stripes, a sign's P, a lamp's light, flowers"),
            slider("emissive", "Glow", 0, 3, 0.1, 0, hint="Drawing only: makes a lamp head glow brighter"),
        ],
    ),
]
