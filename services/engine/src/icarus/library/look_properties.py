from icarus.contracts.objects import ObjectSpec
from icarus.contracts.project import Project

# Components that physics, senses and rewards never read (ADR 007: looks stay out of the simulation).
LOOK_COMPONENTS = frozenset({"sky", "light"})
# Properties that only change the drawing or a label; the material's surface sets friction, so it stays.
LOOK_PROPERTIES = {
    "material": frozenset(
        {"color", "style", "transparency", "reflectance", "cast_shadow", "finish", "roughness", "metalness", "emissive"}
    ),
    "distance_ray": frozenset({"name"}),
}
# How a brain practices shapes the next run, not what a finished brain can drive; the checkpoint keeps its own layers.
PRACTICE_FIELDS = frozenset({"copies", "seed", "training_steps", "layers", "ppo"})


def _training_objects(objects: list[ObjectSpec]) -> list[dict[str, object]]:
    parents = {obj.parent for obj in objects}
    kept: list[dict[str, object]] = []
    for obj in objects:
        components = [
            {
                "id": component.id,
                "kind": component.kind,
                "properties": {
                    name: value.model_dump()
                    for name, value in sorted(component.properties.items())
                    if name not in LOOK_PROPERTIES.get(component.kind, ())
                },
            }
            for component in obj.components
            if component.kind not in LOOK_COMPONENTS
        ]
        # A light or sky object leaves at most a transform behind, which places nothing the simulation sees.
        if obj.id not in parents and all(component["kind"] == "transform" for component in components):
            continue
        kept.append({"id": obj.id, "parent": obj.parent, "components": components})
    return kept


def training_content(project: Project) -> dict[str, object]:
    """What a trained brain depends on: equal when a revision changed only looks, labels or how the brain practices."""
    return {
        "world": _training_objects(project.world.objects),
        "bodies": [{"id": body.id, "objects": _training_objects(body.objects)} for body in project.bodies],
        "task": project.task.model_dump(),
        "brain": project.brain.model_dump(exclude=set(PRACTICE_FIELDS)),
    }
