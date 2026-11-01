from collections.abc import Iterator

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.project import Project


def containers(project: Project) -> Iterator[list[ObjectSpec]]:
    """The world's object list, then each body's."""
    yield project.world.objects
    for body in project.bodies:
        yield body.objects


def all_objects(project: Project) -> Iterator[ObjectSpec]:
    for objects in containers(project):
        yield from objects


def find_object(project: Project, object_id: str) -> tuple[list[ObjectSpec], ObjectSpec] | None:
    for objects in containers(project):
        for obj in objects:
            if obj.id == object_id:
                return objects, obj
    return None
