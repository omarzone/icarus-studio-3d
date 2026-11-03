"""Floor plates the task watches (design/plates.py, sim/plates.py), digital displays that show engine values
(sim/displays.py) and cartoon eyes; displays and eyes are look-only."""

from icarus.contracts.decor import DISPLAY_FORMATS, DISPLAY_SOURCES, DISPLAY_STYLES, EYES_LOOKS, PLATE_ROLES
from icarus.contracts.library import ComponentKindSpec
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
]
