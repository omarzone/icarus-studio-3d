"""Senses the brain leaves unread and motors it leaves undriven, named "object/component" on the project's bodies."""

from icarus.contracts.objects import ComponentSpec, ObjectSpec
from icarus.contracts.project import Project
from icarus.contracts.specs import BrainSpec
from icarus.library.components import COMPONENTS

SENSES = "Senses"


def _parts(project: Project) -> dict[str, tuple[ObjectSpec, ComponentSpec]]:
    return {
        f"{obj.id}/{component.id}": (obj, component)
        for body in project.bodies
        for obj in body.objects
        for component in obj.components
    }


def _is_sense(component: ComponentSpec) -> bool:
    kind = COMPONENTS.get(component.kind)
    return kind is not None and kind.group == SENSES


def _vehicle_driven(project: Project) -> frozenset[str]:
    """Objects whose joints a vehicle drives with its throttle and steering instead of their own motors."""
    from icarus.design.compile_error import CompileError
    from icarus.design.vehicle import vehicle_layouts

    try:
        return frozenset().union(*(layout.owned for layout in vehicle_layouts(project).values()))
    except CompileError:
        return frozenset()


def mask_problem(project: Project, senses: list[str], motors: list[str]) -> str | None:
    """Why these senses and motors cannot be left out, in one sentence; None when they can."""
    from icarus.design.components import ComponentView

    parts = _parts(project)
    for sense in senses:
        found = parts.get(sense)
        if found is None or not _is_sense(found[1]):
            return f"There is no sensor {sense!r} on the bodies to turn off"
    driven = _vehicle_driven(project)
    motor_parts = [key for key, (_, component) in parts.items() if component.kind == "motor"]
    for motor in motors:
        found = parts.get(motor)
        if found is None or found[1].kind != "motor":
            return f"There is no motor {motor!r} on the bodies to turn off"
        if (ComponentView(found[1]).text("joint") or found[0].id) in driven:
            return f"The motor of {found[0].name} is driven through the vehicle's throttle and steering"
    if motor_parts and not driven and set(motor_parts) <= set(motors):
        return "The brain needs at least one motor to move the body"
    return None


def _kept(brain: BrainSpec, parts: dict[str, tuple[ObjectSpec, ComponentSpec]]) -> BrainSpec:
    senses = [item for item in brain.muted_senses if item in parts]
    motors = [item for item in brain.muted_motors if item in parts]
    if senses == brain.muted_senses and motors == brain.muted_motors:
        return brain
    return brain.model_copy(update={"muted_senses": senses, "muted_motors": motors})


def prune_masks(project: Project) -> None:
    """Forget muted senses and motors whose part or component is gone, so removing a sensor never fails."""
    parts = _parts(project)
    project.brain = _kept(project.brain, parts)
    for agent in project.agents:
        if agent.brain is not None:
            agent.brain = _kept(agent.brain, parts)
