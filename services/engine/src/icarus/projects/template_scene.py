from functools import cache

from icarus.contracts.scene import SceneDescription
from icarus.design.compiler import compile_project
from icarus.design.scene import scene_description
from icarus.library.templates import template_operations
from icarus.projects.operations import apply_operations, empty_project

# A project created from a template starts at revision 1.
_FIRST_REVISION = 1


@cache
def template_scene(template_id: str) -> SceneDescription:
    """The scene a new project from this template would have, built in memory and never stored."""
    project = apply_operations(empty_project(template_id, template_id), template_operations(template_id))
    return scene_description(compile_project(project), _FIRST_REVISION)
