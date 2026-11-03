import json

import httpx
import pytest

from icarus.contracts.copilot import IdeaSet
from icarus.copilot.architect import IdeaBook, IdeaDraft, NoValidIdeas, PlannedIdea, compile_idea, propose_ideas
from icarus.copilot.client import Connection, ModelClient
from icarus.copilot.fixture_provider import fixture_transport
from icarus.copilot.idea_revisions import MixRefused, mix_ideas, tweak_idea
from tests.copilot.test_architect import PARKING_PROMPT


def _client(tweaked: dict) -> tuple[ModelClient, list[str]]:
    """Fixture answers for the first ideas; `tweaked` answers every revision, and each request's text is kept."""
    fixtures = fixture_transport()
    asked: list[str] = []

    def handle(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if body["response_format"]["json_schema"]["name"] == "design_ideas":
            return fixtures.handle_request(request)
        asked.append(body["messages"][-1]["content"])
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(tweaked)}}]})

    return ModelClient(Connection("http://fixtures.invalid/v1", "", "fixtures"), httpx.MockTransport(handle)), asked


def _book(client: ModelClient) -> tuple[IdeaBook, IdeaSet]:
    book = IdeaBook()
    idea_set, drafts = propose_ideas(client, PARKING_PROMPT)
    book.add(idea_set, drafts)
    return book, idea_set


def _draft(title: str, template: str, mass: float | None = None) -> dict:
    operations = []
    if mass is not None:
        value = {"type": "number", "value": mass}
        operations = [
            {"op": "set_property", "object": "car", "component": "physics_body", "property": "mass", "value": value}
        ]
    texts = {"title": title, "world": "A lot", "body": "A heavier car", "learns": "To park"}
    return texts | {"template": template, "operations": operations}


def test_a_tweak_revises_one_idea_with_the_person_s_words_and_tests_it_again():
    client, asked = _client(_draft("Heavy car", "parking_car", mass=900))
    book, idea_set = _book(client)
    first = idea_set.ideas[1]
    revised = tweak_idea(client, book, idea_set.id, first.id, "make the car heavier")
    assert "make the car heavier" in asked[0] and first.title in asked[0]
    changed = next(idea for idea in revised.ideas if idea.id == first.id)
    assert changed.title == "Heavy car" and changed.scene.geoms
    assert [idea.id for idea in revised.ideas] == [idea.id for idea in idea_set.ideas]
    assert book.get(idea_set.id)[1][first.id].draft.title == "Heavy car"


def test_a_tweak_that_fails_its_tests_twice_leaves_the_idea_as_it_was():
    client, asked = _client(_draft("Broken", "no_such_template"))
    book, idea_set = _book(client)
    with pytest.raises(NoValidIdeas, match="stays as it was"):
        tweak_idea(client, book, idea_set.id, idea_set.ideas[0].id, "something else")
    assert len(asked) == 2
    assert book.get(idea_set.id)[0] == idea_set


def _planned(title: str, template: str) -> PlannedIdea:
    texts = {"world": f"The {title} world", "body": f"The {title} body", "learns": f"What the {title} learns"}
    return PlannedIdea(IdeaDraft.model_validate({"title": title, "template": template, "operations": []} | texts))


def test_mixing_builds_the_world_of_one_idea_with_the_body_of_another():
    parking, walker = _planned("Parking", "parking_car"), _planned("Walker", "walker_robot")
    ideas = [compile_idea(parking, "aaaa0001"), compile_idea(walker, "aaaa0002")]
    assert all(not isinstance(idea, str) for idea in ideas)
    book = IdeaBook()
    book.add(
        IdeaSet(id="set1", prompt="robots", ideas=[idea for idea in ideas if not isinstance(idea, str)]),
        {"aaaa0001": parking, "aaaa0002": walker},
    )
    idea_set, mixed = mix_ideas(book, "set1", world_from="aaaa0001", body_from="aaaa0002")
    assert mixed.body == "The Walker body" and mixed.world == "The Parking world"
    assert mixed.family == "locomotion" and mixed.learns == "What the Walker learns"
    bodies = {body.name for body in mixed.scene.bodies}
    assert "car" not in bodies and any(geom.name.startswith("torso") for geom in mixed.scene.geoms)
    assert idea_set.ideas[-1] == mixed and mixed.id in book.get("set1")[1]
    with pytest.raises(MixRefused, match="two different"):
        mix_ideas(book, "set1", world_from="aaaa0001", body_from="aaaa0001")
