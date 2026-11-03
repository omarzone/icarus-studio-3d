import base64
import json
import struct
import time
import zlib
from pathlib import Path

import httpx
import pytest

from icarus.contracts.copilot import AttachmentUpload
from icarus.copilot.agent.tools.base import ToolServices, TurnScope
from icarus.copilot.agent.tools.cloning import ReferenceSceneArgs, reference_scene
from icarus.copilot.agent.tools.proposing import ProposeArgs, propose
from icarus.copilot.attachments import AttachmentStore
from icarus.copilot.building.scene_plan import ScenePlan
from icarus.copilot.client import ModelClient
from icarus.copilot.fixture_provider import fixture_transport
from icarus.copilot.reference_scene import ReferenceClone, plan_problems
from icarus.copilot.settings import Connection
from icarus.projects.operations import apply_operations
from icarus.projects.store import ProjectStore
from icarus.training.run_store import RunStore
from tests.copilot.test_part_plan import kiosk, sedan


def _png() -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(b"\x00\x80\x80\x80"))
    # The end chunk is left out on purpose: nothing here decodes the picture, it only travels.


class _Views:
    """Stands in for the offscreen renderer: returns a picture and remembers each camera it was asked for."""

    def __init__(self) -> None:
        self.cameras: list = []

    def render(self, compiled, camera, zones, timeout=None, colliders=False) -> bytes:
        self.cameras.append(camera)
        return _png()


def _sunk_cart() -> dict:
    return {
        "id": "sunk_cart",
        "name": "Sunk cart",
        "kind": "body",
        "position": [-5, -5, 0],
        "heading_deg": 0,
        "parts": [
            {
                "id": "frame",
                "name": "Frame",
                "parent": None,
                "shape": "box",
                "size": [1, 1, 0.4],
                "position": [0, 0, -0.3],
                "rotation": [0, 0, 0],
                "look": {"color": "#777777"},
                "collides": True,
                "mass": 40,
            }
        ],
    }


PLAN = {
    "place": "A street corner at dusk with a red sedan, a kiosk and a tree",
    "scale_anchor": "the sedan, 4.2 m long",
    "palette": ["#b3122e", "#c9a27a", "#3a3f47"],
    "camera": {"lookat": [4, 2, 0.5], "distance_m": 14, "azimuth_deg": -135, "elevation_deg": -25, "fov_deg": 50},
    "ground": {"surface": "asphalt", "color": "#3a3f47", "finish": "asphalt"},
    "sky": {
        "preset": "dusk",
        "clock_time": 18.5,
        "clouds": 0.3,
        "haze": 0.2,
        "fog": 0.1,
        "ambient": 0.8,
        "top": None,
        "horizon": None,
    },
    "sun": {"intensity": 0.8, "color": "#ffd2a0"},
    "layout": None,
    "pieces": [
        {"id": "tree", "piece": "tree", "name": "Tree", "position": [8, -4]},
        {"id": "fountain", "piece": "marble_fountain", "name": "Fountain", "position": [-6, 6]},
    ],
    "objects": [sedan(position=(2.0, 4.0, 0.0)), kiosk(position=(9.0, 4.0, 0.0)), _sunk_cart()],
    "lamps": [{"id": "lamp", "name": "Street lamp", "position": [4, 0, 4], "intensity": 1.2, "color": "#ffe7b0"}],
    "left_out": ["a pedestrian crossing the street"],
}
ROUND_1 = {
    "close_enough": False,
    "differences": [
        {"kind": "color", "item": "sedan", "detail": "The car in the picture is blue, not red"},
        {"kind": "position", "item": "tree", "detail": "The tree stands further right"},
        {"kind": "missing", "item": None, "detail": "A bench in front of the kiosk is missing"},
    ],
    "corrections": [
        {"action": "restyle", "item": "sedan", "part": "chassis", "color": "#1d4fa3"},
        {"action": "move", "item": "tree", "position": [10, -5, 0]},
        {"action": "resize", "item": "ghost", "factor": 2},
        {"action": "add_piece", "piece": {"id": "bench", "piece": "bench", "name": "Bench", "position": [6, -2]}},
    ],
}
ROUND_2 = {
    "close_enough": False,
    "differences": [{"kind": "sky", "item": None, "detail": "The picture is taken in daylight"}],
    "corrections": [
        {"action": "set_look", "sky": PLAN["sky"] | {"preset": "day", "clock_time": None}},
        {"action": "remove", "item": "lamp"},
        {"action": "remove", "item": "kiosk", "part": "roof"},
    ],
}
MATCHES = {"close_enough": True, "differences": [], "corrections": []}


def _fixtures(root: Path, comparisons: dict[str, tuple[list[str], dict]]) -> Path:
    def write(role: str, name: str, match: list[str], content: dict) -> None:
        folder = root / role
        folder.mkdir(parents=True, exist_ok=True)
        fixture = {"match": match, "replies": [{"content": content}]}
        (folder / f"{name}.json").write_text(json.dumps(fixture), encoding="utf-8")

    write("scene_plan", "default", [], PLAN)
    for name, (match, content) in comparisons.items():
        write("scene_comparison", name, match, content)
    return root


class _Recorder:
    """The fixture provider, counting requests per structured output and keeping their bodies."""

    def __init__(self, root: Path) -> None:
        self.inner = fixture_transport(root)
        self.bodies: list[dict] = []

    def client(self) -> ModelClient:
        def handle(request: httpx.Request) -> httpx.Response:
            self.bodies.append(json.loads(request.content))
            return self.inner.handle_request(request)

        return ModelClient(Connection("http://fixtures.invalid/v1", "", "fixtures"), httpx.MockTransport(handle))

    def calls(self, role: str) -> int:
        return sum(1 for body in self.bodies if body["response_format"]["json_schema"]["name"] == role)


@pytest.fixture
def scope(tmp_path) -> TurnScope:
    store = ProjectStore(tmp_path / "projects")
    project_id = store.create("Street", "empty_world").project.id
    attachments = AttachmentStore(tmp_path / "projects")
    services = ToolServices(store, RunStore(tmp_path / "runs"), None, attachments, _Views())  # type: ignore[arg-type]
    return TurnScope(project_id, store.state(project_id), "ask", services)


def _scripted(tmp_path: Path) -> _Recorder:
    rounds = {
        "a_round_1": (["Refinement round 1 of"], ROUND_1),
        "b_round_2": (["Refinement round 2 of"], ROUND_2),
        "default": ([], MATCHES),
    }
    return _Recorder(_fixtures(tmp_path / "fixtures", rounds))


def test_a_cloned_scene_applies_each_rounds_scripted_differences_and_reports_what_was_not_placed(scope, tmp_path):
    recorder = _scripted(tmp_path)
    client = recorder.client()
    outcome = ReferenceClone(scope, client, client, time.monotonic() + 120).run("a corner like this", None, 2, False)

    assert outcome.try_id is not None and outcome.plan is not None, outcome.result
    assert recorder.calls("scene_comparison") == 2
    # The plan names a piece the library lacks, so it is asked once more and then built without it.
    assert recorder.calls("scene_plan") == 2
    assert [item.number for item in outcome.rounds] == [0, 1, 2]
    first = outcome.rounds[1]
    assert first.differences[0] == "color sedan: The car in the picture is blue, not red"
    assert first.applied == ["restyle sedan", "move tree", "add_piece"]
    assert first.refused == ["there is no item `ghost` that can take resize"]
    plan = outcome.plan
    assert plan.sky.preset == "day" and plan.lamps == []
    assert next(piece for piece in plan.pieces if piece.id == "tree").position == (10, -5)
    built = apply_operations(scope.state.project, scope.tries[outcome.try_id].operations)
    world = {obj.id for obj in built.world.objects}
    assert {"tree", "bench", "kiosk", "kiosk_back"} <= world and "lamp" not in world
    # Removing the roof also takes the glass that hangs from it.
    assert not {"kiosk_roof", "kiosk_glass"} & world
    chassis = next(obj for obj in built.bodies[0].objects if obj.id == "sedan_chassis")
    material = next(component for component in chassis.components if component.kind == "material")
    assert material.properties["color"].model_dump()["value"] == "#1d4fa3"
    not_placed = " | ".join(outcome.not_placed)
    assert "marble_fountain" in not_placed and "pedestrian" in not_placed and "sunk_cart" in not_placed
    assert [body.id for body in built.bodies] == ["sedan"]
    camera = scope.services.views.cameras[0]  # type: ignore[attr-defined]
    assert (camera.distance, camera.azimuth, camera.fov) == (14, -135, 50)
    assert outcome.picture is not None


def test_refinement_never_runs_more_rounds_than_its_budget(scope, tmp_path):
    never_done = {
        "default": ([], ROUND_1 | {"corrections": [{"action": "move", "item": "tree", "position": [9, -5, 0]}]})
    }
    recorder = _Recorder(_fixtures(tmp_path / "fixtures", never_done))
    client = recorder.client()
    outcome = ReferenceClone(scope, client, client, time.monotonic() + 120).run("a corner", None, 9, False)
    assert recorder.calls("scene_comparison") == 3
    assert [item.number for item in outcome.rounds] == [0, 1, 2, 3] and outcome.try_id is not None


def test_no_round_starts_when_the_time_budget_is_nearly_spent(scope, tmp_path):
    recorder = _scripted(tmp_path)
    client = recorder.client()
    outcome = ReferenceClone(scope, client, client, time.monotonic() + 5).run("a corner", None, 3, False)
    assert recorder.calls("scene_comparison") == 0
    assert "time budget" in outcome.stopped and outcome.try_id is not None


def test_without_a_model_that_sees_the_scene_is_built_but_not_refined(scope, tmp_path):
    recorder = _scripted(tmp_path)
    outcome = ReferenceClone(scope, recorder.client(), None, time.monotonic() + 120).run("a corner", None, 2, False)
    assert recorder.calls("scene_comparison") == 0
    assert "not run" in outcome.stopped and outcome.try_id is not None and outcome.picture is not None


def test_the_tool_plans_from_the_attached_picture_shows_the_render_and_its_try_can_be_proposed(scope, tmp_path):
    recorder = _scripted(tmp_path)
    data = base64.b64encode(_png()).decode()
    upload = AttachmentUpload(name="street.png", media_type="image/png", kind="image", data=data)
    scope.attachments = [scope.services.attachments.add(scope.project_id, upload).id]
    scope.client = scope.vision = recorder.client()

    observation = reference_scene(scope, ReferenceSceneArgs(request="make a street like this", rounds=1))
    result = json.loads(observation.text.split("\n")[0])
    assert observation.ok and observation.image is not None and len(scope.views) == 1
    assert result["passed"] and result["rounds"][1]["applied"] == ["restyle sedan", "move tree", "add_piece"]
    assert any("not expressible" in item for item in result["not_placed"])
    planned = next(body for body in recorder.bodies if body["response_format"]["json_schema"]["name"] == "scene_plan")
    parts = planned["messages"][1]["content"]
    assert parts[1]["image_url"]["url"].startswith("data:image/png;base64,")
    proposed = propose(scope, ProposeArgs(try_id=result["try_id"], summary="Street", explanation="A street."))
    assert proposed.ok and scope.proposal is not None


def test_the_tool_needs_a_model_connection(scope):
    observation = reference_scene(scope, ReferenceSceneArgs(request="a street"))
    assert not observation.ok and scope.tries == {}


def test_a_camera_planned_under_the_ground_is_sent_back_and_rendered_from_above():
    upside_down = ScenePlan.model_validate(PLAN | {"camera": PLAN["camera"] | {"elevation_deg": 25}})
    assert any("under the ground" in problem for problem in plan_problems(upside_down))
    camera = upside_down.camera.above_ground()
    assert camera.elevation_deg == -25 and camera.height() > 0
    assert not any(problem.startswith("camera") for problem in plan_problems(ScenePlan.model_validate(PLAN)))
