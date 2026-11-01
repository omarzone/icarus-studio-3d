import httpx
import pytest

from icarus.copilot.architect import NoValidIdeas, propose_ideas
from icarus.copilot.client import Connection, ModelClient
from icarus.copilot.fixture_provider import fixture_transport

PARKING_PROMPT = "a little car that learns to park itself"


def counting_client() -> tuple[ModelClient, list[str]]:
    """A fixture-answering client that records the schema name of every request."""
    fixtures = fixture_transport()
    roles: list[str] = []

    def handle(request: httpx.Request) -> httpx.Response:
        body = httpx.Response(200, content=request.content).json()
        roles.append(body["response_format"]["json_schema"]["name"])
        return fixtures.handle_request(request)

    return ModelClient(Connection("http://fixtures.invalid/v1", "", "fixtures"), httpx.MockTransport(handle)), roles


def test_a_prompt_gives_three_compiled_ideas_with_real_scenes():
    client, roles = counting_client()
    idea_set, drafts = propose_ideas(client, PARKING_PROMPT)
    assert roles == ["design_ideas"]
    assert idea_set.prompt == PARKING_PROMPT and len(idea_set.ideas) == 3
    assert [idea.recommended for idea in idea_set.ideas] == [True, False, False]
    for idea in idea_set.ideas:
        assert idea.template == "parking_car" and idea.family == "navigation"
        assert idea.estimate_minutes == pytest.approx(1_000_000 / 2000 / 60)
        assert {"car", "goal"} <= {geom.body for geom in idea.scene.geoms} | {body.name for body in idea.scene.bodies}
        assert set(drafts) >= {idea.id}
    walled = next(idea for idea in idea_set.ideas if "wall" in idea.world.lower())
    assert any(geom.name.startswith("bay_wall") for geom in walled.scene.geoms)


def test_an_idea_with_a_bad_operation_is_retried_once_then_dropped():
    client, roles = counting_client()
    idea_set, _ = propose_ideas(client, "an obstacle course for a robot")
    assert roles == ["design_ideas", "design_idea_fix"]
    assert len(idea_set.ideas) == 2 and idea_set.ideas[0].recommended


def test_no_valid_idea_is_an_error():
    client, _ = counting_client()
    with pytest.raises(NoValidIdeas):
        propose_ideas(client, "something impossible that floats in nothing")
