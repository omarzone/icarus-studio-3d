from dataclasses import dataclass, field

from pydantic import TypeAdapter

from icarus.contracts.library import TemplateInfo
from icarus.contracts.objects import ComponentSpec, ObjectSpec
from icarus.contracts.operations import AddBody, CreateObject, EditOperation, SetRewardTerm, SetTaskFamily
from icarus.contracts.properties import PropertyValue
from icarus.contracts.specs import BodySpec, RewardTermSpec, TaskFamily
from icarus.library.components import component_kind, default_component
from icarus.library.rewards import REWARD_TERMS

_VALUE = TypeAdapter(PropertyValue)

Raw = float | int | bool | str | tuple[float, ...]


class UnknownTemplate(KeyError):
    pass


def _component(kind: str, overrides: dict[str, Raw]) -> ComponentSpec:
    component = default_component(kind, kind)
    schemas = {schema.id: schema for schema in component_kind(kind).properties}
    for prop, raw in overrides.items():
        schema = schemas[prop]
        if schema.type == "range" and isinstance(raw, tuple):
            component.properties[prop] = _VALUE.validate_python({"type": "range", "low": raw[0], "high": raw[1]})
        else:
            component.properties[prop] = _VALUE.validate_python({"type": schema.type, "value": raw})
    return component


@dataclass
class Part:
    id: str
    name: str
    parent: str | None
    components: dict[str, dict[str, Raw]] = field(default_factory=dict)

    def spec(self) -> ObjectSpec:
        return ObjectSpec(
            id=self.id,
            name=self.name,
            parent=self.parent,
            components=[_component(kind, overrides) for kind, overrides in self.components.items()],
        )


def solid(
    id: str,
    name: str,
    parent: str | None,
    position: tuple[float, float, float],
    shape: str,
    size: tuple[float, float, float],
    mass: float,
    color: str,
    *,
    rotation: tuple[float, float, float] = (0, 0, 0),
    extra: dict[str, dict[str, Raw]] | None = None,
) -> Part:
    components: dict[str, dict[str, Raw]] = {
        "transform": {"position": position, "rotation": rotation},
        "mesh": {"shape": shape, "size": size},
        "material": {"color": color},
        "physics_body": {"mode": "dynamic", "mass": mass},
        "collider": {},
    }
    return Part(id, name, parent, components | (extra or {}))


def _hinge(axis: tuple[float, float, float], limits: tuple[float, float], anchor=(0.0, 0.0, 0.0)) -> dict[str, Raw]:
    return {"kind": "hinge", "axis": axis, "limits": limits, "anchor": anchor}


def _motor(kind: str, max_force: float) -> dict[str, Raw]:
    return {"kind": kind, "max_force": max_force}


def _world() -> list[Part]:
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
    ]


def _car() -> list[Part]:
    parts = [
        solid(
            "car",
            "Car",
            None,
            (0, 0, 0.5),
            "box",
            (4, 1.8, 0.6),
            900,
            "#c8553d",
            extra={"distance_ray": {"range": 10, "count": 5}},
        )
    ]
    for side, y in (("left", 1.05), ("right", -1.05)):
        knuckle = f"steer_{side}"
        parts.append(
            solid(
                knuckle,
                f"Front {side} steering",
                "car",
                (1.3, y, -0.2),
                "sphere",
                (0.12, 0.12, 0.12),
                4,
                "#2b2d31",
                extra={"joint": _hinge((0, 0, 1), (-35, 35)), "motor": _motor("position", 2000)},
            )
        )
        wheels: list[tuple[str, str, str, tuple[float, float, float], dict[str, Raw] | None]] = [
            (f"wheel_front_{side}", f"Front {side} wheel", knuckle, (0.0, 0.0, 0.0), None),
            (f"wheel_rear_{side}", f"Rear {side} wheel", "car", (-1.3, y, -0.2), _motor("torque", 400)),
        ]
        for id, name, parent, position, motor in wheels:
            extra: dict[str, dict[str, Raw]] = {"joint": _hinge((0, 0, 1), (-180, 180))}
            extra["collider"] = {"friction": 1.2}
            if motor:
                extra["motor"] = motor
            parts.append(
                solid(
                    id,
                    name,
                    parent,
                    position,
                    "cylinder",
                    (0.6, 0.6, 0.25),
                    20,
                    "#1f2023",
                    rotation=(90, 0, 0),
                    extra=extra,
                )
            )
    parts.append(
        Part("goal", "Parking spot", None, {"transform": {"position": (12, 0, 0)}, "goal_zone": {"radius": 1.5}})
    )
    return parts


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
            "#8a8f98",
            extra={"joint": _hinge((0, 1, 0), (-60, 60), (0, 0, 0.2)), "motor": _motor("position", 150)},
        ),
        solid(
            f"shin_{side}",
            f"{side.capitalize()} shin",
            f"thigh_{side}",
            (0, 0, -0.4),
            "capsule",
            (0.08, 0.08, 0.4),
            3,
            "#8a8f98",
            extra={"joint": _hinge((0, 1, 0), (0, 120), (0, 0, 0.2)), "motor": _motor("position", 150)},
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
                "joint": _hinge((0, 1, 0), (-45, 45), (-0.04, 0, 0.02)),
                "motor": _motor("position", 60),
                "touch": {"radius": 0.06},
            },
        ),
    ]


def _walker() -> list[Part]:
    torso = solid("torso", "Torso", None, (0, 0, 1.0), "box", (0.3, 0.3, 0.4), 10, "#4f7cac", extra={"balance": {}})
    return [torso, *_leg("left", 0.12, "torso", -0.35), *_leg("right", -0.12, "torso", -0.35)]


def _humanoid() -> list[Part]:
    parts = [
        solid("pelvis", "Pelvis", None, (0, 0, 1.0), "box", (0.25, 0.3, 0.2), 8, "#4f7cac", extra={"balance": {}}),
        solid(
            "chest",
            "Chest",
            "pelvis",
            (0, 0, 0.35),
            "box",
            (0.25, 0.3, 0.45),
            15,
            "#4f7cac",
            extra={"joint": _hinge((0, 1, 0), (-30, 45), (0, 0, -0.2)), "motor": _motor("position", 100)},
        ),
        solid(
            "head",
            "Head",
            "chest",
            (0, 0, 0.38),
            "sphere",
            (0.22, 0.22, 0.22),
            4,
            "#d9b48f",
            extra={"joint": _hinge((0, 1, 0), (-30, 30), (0, 0, -0.1)), "motor": _motor("position", 20)},
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
                "#8a8f98",
                extra={"joint": _hinge((0, 1, 0), (-90, 90), (0, 0, 0.15)), "motor": _motor("position", 60)},
            ),
            solid(
                f"forearm_{side}",
                f"{side.capitalize()} forearm",
                f"upper_arm_{side}",
                (0, 0, -0.32),
                "capsule",
                (0.07, 0.07, 0.28),
                1.5,
                "#8a8f98",
                extra={"joint": _hinge((0, 1, 0), (-120, 0), (0, 0, 0.14)), "motor": _motor("position", 40)},
            ),
        ]
    return parts + _leg("left", 0.09, "pelvis", -0.35) + _leg("right", -0.09, "pelvis", -0.35)


@dataclass(frozen=True)
class _Template:
    info: TemplateInfo
    body: tuple[str, str] | None
    parts: list[Part]
    rewards: list[str]


def _template(id: str, label: str, description: str, family: TaskFamily) -> TemplateInfo:
    return TemplateInfo(id=id, label=label, description=description, family=family)


def _templates() -> dict[str, _Template]:
    return {
        "empty_world": _Template(
            _template("empty_world", "Empty world", "Ground, light and a spawn point.", "none"), None, [], []
        ),
        "parking_car": _Template(
            _template(
                "parking_car", "Parking car", "A car with steering and drive wheels and a parking spot.", "navigation"
            ),
            ("car_body", "Car"),
            _car(),
            ["reach_goal", "progress_to_goal", "collision_penalty", "time_penalty"],
        ),
        "walker_robot": _Template(
            _template("walker_robot", "Walker robot", "A torso on two jointed legs that learns to walk.", "locomotion"),
            ("walker_body", "Walker"),
            _walker(),
            ["forward_progress", "stay_upright", "energy_cost", "fall_penalty"],
        ),
        "humanoid": _Template(
            _template(
                "humanoid", "Humanoid", "A humanoid with twelve motors and balance and foot sensors.", "locomotion"
            ),
            ("humanoid_body", "Humanoid"),
            _humanoid(),
            ["forward_progress", "stay_upright", "energy_cost", "fall_penalty"],
        ),
    }


TEMPLATES: dict[str, TemplateInfo] = {id: template.info for id, template in _templates().items()}


def template_operations(template_id: str) -> list[EditOperation]:
    """The edit operations that build a template on an empty project."""
    template = _templates().get(template_id)
    if template is None:
        raise UnknownTemplate(template_id)
    operations: list[EditOperation] = [
        CreateObject(op="create_object", target="world", object=part.spec()) for part in _world()
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
