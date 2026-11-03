from functools import cache

from icarus.contracts.operations import CreateObject
from icarus.contracts.project import Project
from icarus.contracts.scene import SceneDescription
from icarus.design.compiler import compile_project
from icarus.design.scene import scene_description
from icarus.library.body_vault import body_from_vault
from icarus.library.templates import ground_part
from icarus.projects.operations import apply_operations, empty_project


def vault_project(body_id: str) -> Project:
    """A project holding only the ground and the vault body standing on it, built in memory and never stored."""
    ground = CreateObject(op="create_object", target="world", object=ground_part().spec())
    return apply_operations(empty_project(body_id[:64], body_id[:80]), [ground, *body_from_vault(body_id)])


@cache
def vault_body_scene(body_id: str) -> SceneDescription:
    """The vault body standing on the ground, for its library card."""
    return scene_description(compile_project(vault_project(body_id)), 0)
