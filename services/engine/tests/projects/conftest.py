import pytest

from icarus.contracts.objects import ComponentSpec, ObjectSpec
from icarus.contracts.operations import AddComponent, CreateObject
from icarus.contracts.project import Project
from icarus.library.components import default_component
from icarus.projects.operations import apply_operations, empty_project


def solid(id: str, parent: str | None = None, *kinds: str) -> ObjectSpec:
    components: list[ComponentSpec] = [default_component(kind, kind) for kind in ("transform", "mesh", *kinds)]
    return ObjectSpec(id=id, name=id.capitalize(), parent=parent, components=components)


@pytest.fixture
def base() -> Project:
    return apply_operations(
        empty_project("0123456789ab", "Test"),
        [
            CreateObject(op="create_object", target="world", object=solid("car", None, "physics_body")),
            CreateObject(op="create_object", target="world", object=solid("arm", "car", "physics_body", "joint")),
            CreateObject(op="create_object", target="world", object=solid("drive", "car", "physics_body")),
            AddComponent(op="add_component", object="drive", component=default_component("motor", "motor")),
        ],
    )
