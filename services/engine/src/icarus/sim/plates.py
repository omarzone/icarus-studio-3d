"""Floor plates measured on MuJoCo's state: pressed by contact force, occupied by a center over the plate, and which
goal plates a try has reached (in order when the goal asks for it)."""

from dataclasses import dataclass
from typing import Literal

import mujoco
import numpy as np

from icarus.contracts.project import Project
from icarus.contracts.properties import ChoiceValue, ListValue
from icarus.design.components import ComponentView, view
from icarus.design.plates import PLATE_SUFFIX
from icarus.projects.document import all_objects

PlateMode = Literal["any", "all", "in_order"]
# A center counts as over a plate from just under its top to this far above it, in metres.
OCCUPY_HEIGHT = 3.0
OCCUPY_BELOW = 0.05


@dataclass(frozen=True)
class Plate:
    object: str
    name: str
    geom: int
    # It counts for the plate goal and rewards.
    goal: bool
    # Triggered by contact force (touch) instead of a center over it.
    touch: bool
    # Bodies whose contacts press it and whose centers occupy it; None is any body that moves.
    pressers: frozenset[int] | None
    centers: tuple[int, ...] | None
    press_force: float
    order: int
    circle: bool
    # Half width and half depth (the radius twice for a circle), in metres.
    half: tuple[float, float]


@dataclass(frozen=True)
class PlateState:
    pressed: bool
    occupied: bool
    active: bool


def _body(model: mujoco.MjModel, name: str) -> int:
    return int(mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, name)) if name else -1


def _moving_roots(model: mujoco.MjModel) -> tuple[int, ...]:
    return tuple(
        index
        for index in range(1, model.nbody)
        if int(model.body_parentid[index]) == 0 and int(model.body_weldid[index]) != 0
    )


def plates_of(project: Project, model: mujoco.MjModel, agent: int | None, agent_bodies: frozenset[int]) -> list[Plate]:
    """Every compiled plate; the goal plates are the target plates, or every plate but start pads without any."""
    found: list[tuple[str, ComponentView, int]] = []
    for obj in all_objects(project):
        component = view(obj, "plate")
        geom = int(mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, f"{obj.id}{PLATE_SUFFIX}"))
        if component is not None and geom >= 0:
            found.append((obj.id, component, geom))
    has_targets = any(plate.text("role") == "target" for _, plate, _ in found)
    plates: list[Plate] = []
    for object_id, plate, geom in found:
        role = plate.text("role")
        match plate.text("watch"):
            case "agent":
                pressers: frozenset[int] | None = agent_bodies
                centers: tuple[int, ...] | None = (agent,) if agent is not None else ()
            case "object":
                body = _body(model, plate.text("object"))
                pressers, centers = (frozenset({body}), (body,)) if body >= 0 else (frozenset(), ())
            case _:
                pressers, centers = None, _moving_roots(model)
        size = model.geom_size[geom]
        circle = int(model.geom_type[geom]) == int(mujoco.mjtGeom.mjGEOM_CYLINDER)
        plates.append(
            Plate(
                object=object_id,
                name=f"{object_id}{PLATE_SUFFIX}",
                geom=geom,
                goal=role == "target" if has_targets else role != "start",
                touch=plate.text("trigger") == "touch",
                pressers=pressers,
                centers=centers,
                press_force=plate.number("press_force"),
                order=plate.count("order"),
                circle=circle,
                half=(float(size[0]), float(size[0] if circle else size[1])),
            )
        )
    return plates


def plate_mode(project: Project) -> tuple[PlateMode, bool]:
    """How the plates complete the goal, and whether a reach_plates term makes them the goal at all."""
    term = next((item for item in project.task.rewards if item.term == "reach_plates"), None)
    mode = term.params.get("mode") if term else None
    value = mode.value if isinstance(mode, ChoiceValue | ListValue) else "all"
    return ("any" if value == "any" else "in_order" if value == "in_order" else "all"), term is not None


def _forces(model: mujoco.MjModel, data: mujoco.MjData, plates: list[Plate]) -> list[float]:
    by_geom = {plate.geom: index for index, plate in enumerate(plates)}
    totals = [0.0] * len(plates)
    force = np.zeros(6)
    for contact_index in range(data.ncon):
        contact = data.contact[contact_index]
        first, second = int(contact.geom1), int(contact.geom2)
        for mine, other in ((first, second), (second, first)):
            index = by_geom.get(mine)
            if index is None:
                continue
            body = int(model.geom_bodyid[other])
            pressers = plates[index].pressers
            moving = int(model.body_weldid[body]) != 0
            if (pressers is None and moving) or (pressers is not None and body in pressers):
                mujoco.mj_contactForce(model, data, contact_index, force)
                totals[index] += abs(float(force[0]))
    return totals


def _over(data: mujoco.MjData, plate: Plate, body: int) -> bool:
    local = data.geom_xmat[plate.geom].reshape(3, 3).T @ (data.xpos[body] - data.geom_xpos[plate.geom])
    if not -OCCUPY_BELOW <= local[2] <= OCCUPY_HEIGHT:
        return False
    if plate.circle:
        return float(np.hypot(local[0], local[1])) <= plate.half[0]
    return abs(local[0]) <= plate.half[0] and abs(local[1]) <= plate.half[1]


def plate_states(model: mujoco.MjModel, data: mujoco.MjData, plates: list[Plate]) -> list[PlateState]:
    states: list[PlateState] = []
    for plate, force in zip(plates, _forces(model, data, plates), strict=True):
        pressed = force >= plate.press_force and force > 0
        occupied = any(_over(data, plate, body) for body in plate.centers or ())
        states.append(PlateState(pressed, occupied, pressed if plate.touch else occupied))
    return states


def _sequence(plates: list[Plate]) -> list[int]:
    """Goal plates in the order a try must reach them: numbered ones by number, then the rest as listed."""
    goals = [index for index, plate in enumerate(plates) if plate.goal]
    return sorted(goals, key=lambda index: (plates[index].order == 0, plates[index].order, index))


def advance_reached(plates: list[Plate], states: list[PlateState], reached: list[bool], mode: PlateMode) -> None:
    """Mark the plates whose trigger holds as reached; in order, a goal plate only once the ones before it are."""
    for index, (plate, state) in enumerate(zip(plates, states, strict=True)):
        if state.active and (mode != "in_order" or not plate.goal):
            reached[index] = True
    if mode != "in_order":
        return
    for index in _sequence(plates):
        if reached[index]:
            continue
        if not states[index].active:
            return
        reached[index] = True


def plates_needed(plates: list[Plate], mode: PlateMode, goal: bool) -> int:
    """How many goal plates complete the goal; 0 when the plates are not the goal."""
    count = sum(plate.goal for plate in plates)
    if not goal or count == 0:
        return 0
    return 1 if mode == "any" else count


@dataclass(frozen=True)
class PlateReading:
    states: list[PlateState]
    # Goal plates whose trigger holds now, goal plates reached this try, and how many complete the goal.
    on: int
    reached: int
    needed: int


def measure_plates(
    model: mujoco.MjModel, data: mujoco.MjData, plates: list[Plate], reached: list[bool], mode: PlateMode, goal: bool
) -> PlateReading:
    """The plates' states at this step, marking newly reached plates in `reached`."""
    states = plate_states(model, data, plates)
    advance_reached(plates, states, reached, mode)
    return PlateReading(
        states=states,
        on=sum(state.active for plate, state in zip(plates, states, strict=True) if plate.goal),
        reached=sum(done for plate, done in zip(plates, reached, strict=True) if plate.goal),
        needed=plates_needed(plates, mode, goal),
    )
