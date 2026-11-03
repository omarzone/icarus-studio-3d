"""The body vault: ready-made bodies, each with joints, motors and senses that fit it, a color and blinking eyes,
added to a project as its agent through ordinary edit operations. Every body passes the design tests standing
still with its motors at zero."""

from collections.abc import Callable
from dataclasses import dataclass
from functools import cache

from icarus.contracts.library import VaultBodyInfo
from icarus.contracts.operations import (
    AddBody,
    CreateObject,
    EditOperation,
    RemoveBody,
    RemoveRewardTerm,
    SetRewardTerm,
    SetTaskFamily,
)
from icarus.contracts.project import Project
from icarus.contracts.specs import BodySpec, RewardTermSpec, TaskFamily
from icarus.library.parts import Part, Raw
from icarus.library.rewards import term_fits
from icarus.library.templates import humanoid_parts, walker_parts
from icarus.library.vault_legs import ball_crawler, dog, hexapod, spider, tripod
from icarus.library.vault_movers import hopper, rover, snake

__all__ = [
    "SCALE_RANGE",
    "VAULT_BODIES",
    "UnknownVaultBody",
    "body_from_vault",
    "use_vault_body",
    "vault_body_spec",
]

SCALE_RANGE = (0.5, 2.0)
Vector = tuple[float, float, float]


class UnknownVaultBody(KeyError):
    pass


@dataclass(frozen=True)
class _Entry:
    label: str
    description: str
    color: str
    build: Callable[[str], list[Part]]
    rewards: tuple[tuple[str, float], ...]
    family: TaskFamily = "locomotion"


_WALK = (("forward_progress", 1.0), ("stay_upright", 0.2), ("energy_cost", -0.001), ("fall_penalty", -10.0))
# Many feet: pay each foot's time in the air so it steps instead of dragging, and keep it heading along +x.
_STEP = (*_WALK, ("feet_air_time", 0.5), ("heading_and_drift", -0.1))

_ENTRIES: dict[str, _Entry] = {
    "biped": _Entry(
        "Biped walker",
        "A 10 kg torso on two legs with hip, knee and ankle motors, foot touch and balance; learns to walk.",
        "#f1f1f1",
        walker_parts,
        (*_WALK, ("feet_air_time", 0.5)),
    ),
    "humanoid": _Entry(
        "Humanoid",
        "A 1.6 m humanoid with twelve motors in its waist, neck, arms and legs, balance and foot touch.",
        "#e8e2d6",
        humanoid_parts,
        (*_WALK, ("feet_air_time", 0.5)),
    ),
    "dog": _Entry(
        "Dog",
        "A Labrador-sized quadruped of about 18 kg: twelve motors (hip spread, thigh, knee), paw touch and balance.",
        "#c9905a",
        dog,
        _STEP,
    ),
    "spider": _Entry(
        "Spider",
        "A 2 kg spider on eight legs that each swing and lift, with foot touch and balance; walks in waves of legs.",
        "#5b4a8a",
        spider,
        _STEP,
    ),
    "hexapod": _Entry(
        "Hexapod",
        "A flat 3 kg robot on six legs with hip, lift and knee motors (18), foot touch and balance; made for "
        "tripod gaits.",
        "#3d8bd9",
        hexapod,
        _STEP,
    ),
    "snake": _Entry(
        "Snake",
        "Eight segments 1 m long, joined by hinges that turn sideways and up and down in turn; moves by waves.",
        "#4caf50",
        snake,
        (("forward_progress", 1.0), ("energy_cost", -0.001), ("heading_and_drift", -0.1), ("smooth_actions", -0.05)),
    ),
    "rover": _Entry(
        "Wheeled rover",
        "A 7.6 kg four-wheeled rover steered by its wheel speeds; its brain drives with throttle, brake and steering.",
        "#e8a33d",
        rover,
        (("forward_progress", 1.0), ("heading_and_drift", -0.1), ("energy_cost", -0.001)),
    ),
    "hopper": _Entry(
        "Hopper",
        "A 6.6 kg body on one strong leg with a wide flat foot: it stands on its own and moves by hopping.",
        "#d9534f",
        hopper,
        (*_WALK, ("smooth_actions", -0.05)),
    ),
    "tripod": _Entry(
        "Tripod",
        "A round disc on three legs a third of a turn apart, each swinging and lifting; shuffles in any direction.",
        "#2bb3a3",
        tripod,
        _STEP,
    ),
    "ball_crawler": _Entry(
        "Ball crawler",
        "A ball on four stubby legs that swing and lift, like a little beetle.",
        "#f06292",
        ball_crawler,
        _STEP,
    ),
}


def _entry(body_id: str) -> _Entry:
    try:
        return _ENTRIES[body_id]
    except KeyError as error:
        raise UnknownVaultBody(body_id) from error


def _scaled(value: Raw, factor: float) -> Raw:
    if isinstance(value, tuple):
        return tuple(round(item * factor, 6) for item in value)
    if isinstance(value, bool | str):
        return value
    return round(value * factor, 6)


# Which raw values grow with the body, as the power of the scale they grow by: lengths by it, masses by its
# cube and the torques that hold those masses up by its fourth power.
_SCALING: dict[tuple[str, str], int] = {
    ("transform", "position"): 1,
    ("mesh", "size"): 1,
    ("joint", "anchor"): 1,
    ("touch", "radius"): 1,
    ("eyes", "size"): 1,
    ("eyes", "spacing"): 1,
    ("eyes", "height"): 1,
    ("distance_ray", "range"): 1,
    ("physics_body", "mass"): 3,
    ("motor", "max_force"): 4,
    ("vehicle", "max_torque"): 4,
    ("vehicle", "brake"): 4,
}
_REFERENCES = {("motor", "joint"), ("joint", "connects_to")}


def _placed(part: Part, at: Vector, prefix: str, scale: float) -> Part:
    components: dict[str, dict[str, Raw]] = {}
    for kind, values in part.components.items():
        changed: dict[str, Raw] = {}
        for prop, value in values.items():
            power = _SCALING.get((kind, prop))
            if power is not None and scale != 1:
                value = _scaled(value, scale**power)
            if (kind, prop) in _REFERENCES and isinstance(value, str) and value:
                value = f"{prefix}{value}"
            changed[prop] = value
        components[kind] = changed
    position = components.get("transform", {}).get("position")
    if part.parent is None and isinstance(position, tuple):
        components["transform"]["position"] = tuple(value + offset for value, offset in zip(position, at, strict=True))
    parent = f"{prefix}{part.parent}" if part.parent else None
    return Part(f"{prefix}{part.id}", part.name, parent, components)


def _parts(body_id: str, at: Vector, color: str | None, prefix: str, scale: float) -> list[Part]:
    low, high = SCALE_RANGE
    if not low <= scale <= high:
        raise ValueError(f"A vault body's scale must be between {low:g} and {high:g}")
    entry = _entry(body_id)
    return [_placed(part, at, prefix, scale) for part in entry.build(color or entry.color)]


def vault_body_spec(
    body_id: str, at: Vector = (0, 0, 0), color: str | None = None, prefix: str = "", scale: float = 1.0
) -> BodySpec:
    """The vault body as one body: standing on the ground at `at` (its height added to the standing height), in
    `color` or its own, every object id and the body id starting with `prefix`."""
    objects = [part.spec() for part in _parts(body_id, at, color, prefix, scale)]
    return BodySpec(id=f"{prefix}{body_id}", name=_entry(body_id).label, objects=objects)


def body_from_vault(
    body_id: str, at: Vector = (0, 0, 0), color: str | None = None, prefix: str = "", scale: float = 1.0
) -> list[EditOperation]:
    """The operations that add the vault body to a project: the body, then each of its objects."""
    body = vault_body_spec(body_id, at, color, prefix, scale)
    operations: list[EditOperation] = [AddBody(op="add_body", body=BodySpec(id=body.id, name=body.name, objects=[]))]
    operations += [CreateObject(op="create_object", target=body.id, object=obj) for obj in body.objects]
    return operations


def _spawn(project: Project) -> Vector:
    for obj in project.world.objects:
        kinds = {component.kind: component for component in obj.components}
        if "spawn_point" in kinds and "transform" in kinds:
            position = kinds["transform"].properties.get("position")
            if position is not None and position.type == "vector":
                return (position.value[0], position.value[1], 0.0)
    return (0.0, 0.0, 0.0)


def use_vault_body(project: Project, body_id: str, color: str | None = None, scale: float = 1.0) -> list[EditOperation]:
    """The operations that make the vault body this project's agent: the bodies it has go, the vault body stands
    on the spawn point, and a task of another family becomes the body's own with its suggested reward terms."""
    entry = _entry(body_id)
    world_ids = {obj.id for obj in project.world.objects}
    plain = {part.id for part in entry.build(entry.color)}
    prefix = f"{body_id}_" if plain & world_ids else ""
    operations: list[EditOperation] = [RemoveBody(op="remove_body", body=body.id) for body in project.bodies]
    operations += body_from_vault(body_id, _spawn(project), color, prefix, scale)
    if project.task.family != entry.family:
        operations.append(SetTaskFamily(op="set_task_family", family=entry.family))
        operations += [
            RemoveRewardTerm(op="remove_reward_term", term=term.term)
            for term in project.task.rewards
            if not term_fits(term.term, entry.family)
        ]
        operations += [
            SetRewardTerm(op="set_reward_term", term=RewardTermSpec(term=term, weight=weight))
            for term, weight in entry.rewards
        ]
    return operations


@cache
def _vault() -> dict[str, VaultBodyInfo]:
    return {
        body_id: VaultBodyInfo(
            id=body_id,
            label=entry.label,
            description=entry.description,
            family=entry.family,
            rewards=[RewardTermSpec(term=term, weight=weight) for term, weight in entry.rewards],
            color=entry.color,
            body=vault_body_spec(body_id),
        )
        for body_id, entry in _ENTRIES.items()
    }


VAULT_BODIES: dict[str, VaultBodyInfo] = _vault()
