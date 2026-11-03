from dataclasses import dataclass

from icarus.contracts.library import TemplateInfo
from icarus.contracts.operations import AddBody, CreateObject, EditOperation, SetRewardTerm, SetTaskFamily
from icarus.contracts.specs import BodySpec, RewardTermSpec, TaskFamily
from icarus.library.parts import Part, Raw, hinge, motor, solid
from icarus.library.rewards import REWARD_TERMS
from icarus.library.vehicle_templates import lot_markings, motorcycle, parking_car

__all__ = ["TEMPLATES", "Part", "Raw", "UnknownTemplate", "solid", "template_operations"]


class UnknownTemplate(KeyError):
    pass


SHELL = "#f1f1f1"
JOINT = "#8b9098"


def _world(sky: str) -> list[Part]:
    return [
        Part(
            "ground",
            "Ground",
            None,
            {
                "transform": {},
                "mesh": {"shape": "plane", "size": (100, 100, 0.1)},
                "material": {"color": "#3a3f47", "surface": "asphalt"},
                "physics_body": {"mode": "static"},
                "surface": {"kind": "asphalt"},
            },
        ),
        Part("sun", "Sun", None, {"transform": {"position": (0, 0, 10)}, "light": {"kind": "sun"}}),
        Part("spawn", "Spawn point", None, {"transform": {}, "spawn_point": {}}),
        Part("sky", "Sky", None, {"sky": {"preset": sky}}),
    ]


def _leg(side: str, y: float, parent: str, top: float) -> list[Part]:
    return [
        solid(
            f"thigh_{side}",
            f"{side.capitalize()} thigh",
            parent,
            (0, y, top),
            "capsule",
            (0.09, 0.09, 0.4),
            5,
            JOINT,
            extra={"joint": hinge((0, 1, 0), (-60, 60), (0, 0, 0.2)), "motor": motor("position", 150)},
            style="joint",
        ),
        solid(
            f"shin_{side}",
            f"{side.capitalize()} shin",
            f"thigh_{side}",
            (0, 0, -0.4),
            "capsule",
            (0.08, 0.08, 0.4),
            3,
            JOINT,
            extra={"joint": hinge((0, 1, 0), (0, 120), (0, 0, 0.2)), "motor": motor("position", 150)},
            style="joint",
        ),
        solid(
            f"foot_{side}",
            f"{side.capitalize()} foot",
            f"shin_{side}",
            (0.04, 0, -0.22),
            "box",
            (0.22, 0.1, 0.04),
            1,
            "#2b2d31",
            extra={
                "joint": hinge((0, 1, 0), (-45, 45), (-0.04, 0, 0.02)),
                "motor": motor("position", 60),
                "touch": {"radius": 0.06},
            },
            style="shell",
        ),
    ]


def _walker() -> list[Part]:
    torso = solid(
        "torso", "Torso", None, (0, 0, 1.0), "box", (0.3, 0.3, 0.4), 10, SHELL, extra={"balance": {}}, style="shell"
    )
    return [torso, *_leg("left", 0.12, "torso", -0.35), *_leg("right", -0.12, "torso", -0.35)]


def _humanoid() -> list[Part]:
    parts = [
        solid(
            "pelvis",
            "Pelvis",
            None,
            (0, 0, 1.0),
            "box",
            (0.25, 0.3, 0.2),
            8,
            SHELL,
            extra={"balance": {}},
            style="shell",
        ),
        solid(
            "chest",
            "Chest",
            "pelvis",
            (0, 0, 0.35),
            "box",
            (0.25, 0.3, 0.45),
            15,
            SHELL,
            extra={"joint": hinge((0, 1, 0), (-30, 45), (0, 0, -0.2)), "motor": motor("position", 100)},
            style="shell",
        ),
        solid(
            "head",
            "Head",
            "chest",
            (0, 0, 0.38),
            "sphere",
            (0.22, 0.22, 0.22),
            4,
            SHELL,
            extra={"joint": hinge((0, 1, 0), (-30, 30), (0, 0, -0.1)), "motor": motor("position", 20)},
            style="shell",
        ),
    ]
    for side, y in (("left", 0.25), ("right", -0.25)):
        parts += [
            solid(
                f"upper_arm_{side}",
                f"{side.capitalize()} upper arm",
                "chest",
                (0, y, 0.05),
                "capsule",
                (0.08, 0.08, 0.3),
                2,
                JOINT,
                extra={"joint": hinge((0, 1, 0), (-90, 90), (0, 0, 0.15)), "motor": motor("position", 60)},
                style="joint",
            ),
            solid(
                f"forearm_{side}",
                f"{side.capitalize()} forearm",
                f"upper_arm_{side}",
                (0, 0, -0.32),
                "capsule",
                (0.07, 0.07, 0.28),
                1.5,
                JOINT,
                extra={"joint": hinge((0, 1, 0), (-120, 0), (0, 0, 0.14)), "motor": motor("position", 40)},
                style="joint",
            ),
        ]
    return parts + _leg("left", 0.09, "pelvis", -0.35) + _leg("right", -0.09, "pelvis", -0.35)


@dataclass(frozen=True)
class _Template:
    info: TemplateInfo
    body: tuple[str, str] | None
    parts: list[Part]
    rewards: list[str]
    sky: str
    # World parts the template adds beyond ground, sun, spawn and sky.
    dressing: tuple[Part, ...] = ()


def _template(id: str, label: str, description: str, family: TaskFamily) -> TemplateInfo:
    return TemplateInfo(id=id, label=label, description=description, family=family)


def _templates() -> dict[str, _Template]:
    return {
        "empty_world": _Template(
            _template("empty_world", "Empty world", "Ground, light, sky and a spawn point.", "none"),
            None,
            [],
            [],
            "day",
        ),
        "parking_car": _Template(
            _template(
                "parking_car", "Parking car", "A car with steering and drive wheels and a parking spot.", "navigation"
            ),
            ("car_body", "Car"),
            parking_car(),
            [
                "reach_goal",
                "progress_to_goal",
                "spot_alignment",
                "gentle_arrival",
                "collision_penalty",
                "time_penalty",
            ],
            "day",
            tuple(lot_markings()),
        ),
        "motorcycle": _Template(
            _template(
                "motorcycle",
                "Motorcycle",
                "Two wheels in line with a steered fork and a driven rear wheel; its brain must learn to balance.",
                "navigation",
            ),
            ("motorcycle_body", "Motorcycle"),
            motorcycle(),
            ["reach_goal", "progress_to_goal", "stay_upright", "fall_penalty", "time_penalty"],
            "day",
        ),
        "walker_robot": _Template(
            _template("walker_robot", "Walker robot", "A torso on two jointed legs that learns to walk.", "locomotion"),
            ("walker_body", "Walker"),
            _walker(),
            ["forward_progress", "stay_upright", "energy_cost", "fall_penalty"],
            "overcast",
        ),
        "humanoid": _Template(
            _template(
                "humanoid", "Humanoid", "A humanoid with twelve motors and balance and foot sensors.", "locomotion"
            ),
            ("humanoid_body", "Humanoid"),
            _humanoid(),
            ["forward_progress", "stay_upright", "energy_cost", "fall_penalty"],
            "dusk",
        ),
    }


TEMPLATES: dict[str, TemplateInfo] = {id: template.info for id, template in _templates().items()}


def template_operations(template_id: str) -> list[EditOperation]:
    """The edit operations that build a template on an empty project."""
    template = _templates().get(template_id)
    if template is None:
        raise UnknownTemplate(template_id)
    operations: list[EditOperation] = [
        CreateObject(op="create_object", target="world", object=part.spec())
        for part in [*_world(template.sky), *template.dressing]
    ]
    if template.body:
        body_id, body_name = template.body
        operations.append(AddBody(op="add_body", body=BodySpec(id=body_id, name=body_name, objects=[])))
        operations += [CreateObject(op="create_object", target=body_id, object=part.spec()) for part in template.parts]
    if template.info.family != "none":
        operations.append(SetTaskFamily(op="set_task_family", family=template.info.family))
    for term in template.rewards:
        weight = REWARD_TERMS[term].default_weight
        operations.append(SetRewardTerm(op="set_reward_term", term=RewardTermSpec(term=term, weight=weight)))
    return operations
