import numpy as np
import pytest

from icarus.contracts.operations import CreateObject
from icarus.copilot.agent.tools.base import ToolServices, TurnScope
from icarus.copilot.agent.tools.look import CELL_HEIGHT, CELL_WIDTH, LookArgs, look
from icarus.copilot.attachments import AttachmentStore
from icarus.design.compiler import compile_project
from icarus.library.parts import Part
from icarus.library.templates import template_operations
from icarus.projects.operations import apply_operations, empty_project
from icarus.projects.store import ProjectStore
from icarus.sim.views import CameraSpec, ViewRenderer, contact_sheet, encode_png
from icarus.training.run_store import RunStore
from tests.sim.test_views import decoded

PIXEL = encode_png(np.full((4, 4, 3), 90, np.uint8))


class _Recorder:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def render(self, compiled, camera, zones, timeout=None, colliders=False) -> bytes:
        self.calls.append({"cameras": [camera], "columns": 1, "colliders": colliders})
        return PIXEL

    def render_sheet(self, compiled, cameras, zones, columns, timeout=None, colliders=False) -> bytes:
        self.calls.append({"cameras": cameras, "columns": columns, "colliders": colliders})
        return PIXEL


@pytest.fixture
def recorded(tmp_path) -> tuple[TurnScope, _Recorder]:
    store = ProjectStore(tmp_path / "projects")
    project_id = store.create("Parking", "parking_car").project.id
    views = _Recorder()
    services = ToolServices(store, RunStore(tmp_path / "runs"), None, AttachmentStore(tmp_path), views)  # type: ignore[arg-type]
    return TurnScope(project_id, store.state(project_id), "ask", services), views


def test_a_free_camera_reaches_the_renderer_as_given_with_its_field_of_view(recorded):
    scope, views = recorded
    camera = {"lookat": [1, 2, 0.5], "distance_m": 7, "azimuth_deg": 30, "elevation_deg": -40, "fov_deg": 70}
    seen = look(scope, LookArgs.model_validate({"camera": camera}))
    assert seen.ok and seen.image == PIXEL and seen.summary == "Looked at the whole scene from a free camera"
    (call,) = views.calls
    assert call["cameras"] == [CameraSpec((1, 2, 0.5), 7, 30, -40, 640, 400, fov=70)]


def test_several_shots_become_one_contact_sheet_of_cells_in_three_columns_beyond_four(recorded):
    scope, views = recorded
    shots: list[dict[str, object]] = [{"view": view} for view in ("top", "front", "left", "right", "back")]
    shots.append({"camera": {"lookat": [0, 0, 0], "distance_m": 5, "azimuth_deg": 0, "elevation_deg": -30}})
    seen = look(scope, LookArgs.model_validate({"shots": shots, "mode": "colliders"}))
    (call,) = views.calls
    assert call["columns"] == 3 and call["colliders"] and len(call["cameras"]) == 6
    assert {(camera.width, camera.height) for camera in call["cameras"]} == {(CELL_WIDTH, CELL_HEIGHT)}
    assert call["cameras"][1].elevation == -15 and call["cameras"][0].elevation == -89
    assert "1 the whole scene from above" in seen.text and "Colliders mode" in seen.text
    assert seen.summary == "Looked at 6 views of the scene (physical shapes only)"


def test_an_unknown_target_in_any_shot_fails_the_look_without_rendering(recorded):
    scope, views = recorded
    seen = look(scope, LookArgs.model_validate({"shots": [{"view": "top"}, {"target": "nowhere"}]}))
    assert not seen.ok and "nowhere" in seen.text and not views.calls


def test_a_contact_sheet_tiles_cells_in_reading_order_with_gaps():
    cells = [np.full((2, 3, 3), value, np.uint8) for value in (10, 20, 30)]
    sheet = contact_sheet(cells, 2, (2, 3), gap=1)
    assert sheet.shape == (5, 7, 3)
    assert sheet[0, 0, 0] == 10 and sheet[0, 4, 0] == 20 and sheet[3, 0, 0] == 30 and sheet[3, 4, 0] == 24


@pytest.fixture(scope="module")
def renderer():
    views = ViewRenderer()
    yield views
    views.close()


@pytest.mark.needs_gl
def test_a_rendered_sheet_has_the_size_of_its_cells_and_gaps(renderer):
    project = apply_operations(empty_project("000000000000", "Empty"), template_operations("empty_world"))
    compiled = compile_project(project)
    cameras = [CameraSpec((0.0, 0.0, 0.0), 6.0, azimuth, -30.0, 96, 64) for azimuth in (0.0, 90.0, 180.0, 270.0)]
    pixels = decoded(renderer.render_sheet(compiled, cameras, [], 2))
    assert pixels.shape == (2 * 64 + 6, 2 * 96 + 6, 3)


@pytest.mark.needs_gl
def test_colliders_mode_hides_decoration_that_the_styled_picture_shows(renderer):
    base = apply_operations(empty_project("000000000000", "Empty"), template_operations("empty_world"))
    decor = Part(
        "banner",
        "Banner",
        None,
        {"transform": {"position": (0, 0, 1)}, "mesh": {"size": (2, 2, 2)}, "material": {"color": "#ff00ff"}},
    )
    decorated = apply_operations(base, [CreateObject(op="create_object", target="world", object=decor.spec())])
    camera = CameraSpec((0.0, 0.0, 1.0), 6.0, -135.0, -20.0, 96, 64)

    def picture(project, colliders: bool) -> np.ndarray:
        return decoded(renderer.render(compile_project(project), camera, [], colliders=colliders)).astype(int)

    assert np.abs(picture(decorated, False) - picture(base, False)).mean() > 5
    assert np.abs(picture(decorated, True) - picture(base, True)).mean() < 1
