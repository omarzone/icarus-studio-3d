import base64
import time

import pytest

from icarus.copilot.agent.tools.base import ToolServices, TurnScope
from icarus.copilot.attachments import AttachmentStore
from icarus.copilot.client import capability_client
from icarus.copilot.reference_scene import ReferenceClone
from icarus.copilot.settings import ModelSettingsStore, settings_dir
from icarus.design.compiler import compile_project
from icarus.projects.store import ProjectStore
from icarus.sim.views import CameraSpec, ViewRenderer
from icarus.training.run_store import RunStore


@pytest.mark.live
@pytest.mark.needs_gl
def test_the_vision_model_clones_a_rendered_parking_scene_into_a_scene_that_passes_its_try(tmp_path):
    vision = capability_client(ModelSettingsStore(settings_dir()), "vision")
    if vision is None:
        pytest.skip("no vision model is configured")
    projects = ProjectStore(tmp_path / "projects")
    reference_project = projects.state(projects.create("Reference", "parking_car").project.id).project
    views = ViewRenderer()
    try:
        camera = CameraSpec((4.0, 0.0, 0.5), 16.0, -140.0, -25.0)
        reference = views.render(compile_project(reference_project), camera, [], timeout=30)
        project_id = projects.create("Clone", "empty_world").project.id
        runs, attachments = RunStore(tmp_path / "runs"), AttachmentStore(tmp_path / "projects")
        services = ToolServices(projects, runs, None, attachments, views)  # type: ignore[arg-type]
        scope = TurnScope(project_id, projects.state(project_id), "ask", services)
        url = f"data:image/png;base64,{base64.b64encode(reference).decode()}"
        clone = ReferenceClone(scope, vision, vision, time.monotonic() + 400)
        outcome = clone.run("Recreate the scene in this picture.", url, 1, False)
    finally:
        views.close()

    assert outcome.plan is not None, outcome.stopped
    assert outcome.try_id is not None, (outcome.result, outcome.not_placed)
    assert outcome.plan.pieces or outcome.plan.objects or outcome.plan.layout
    assert outcome.picture is not None
