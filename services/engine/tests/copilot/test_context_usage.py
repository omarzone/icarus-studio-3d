import pytest

from icarus.contracts.context_usage import ContextRequest, ContextUsage
from icarus.contracts.copilot import ModelSettingsPatch, SendMessage
from icarus.copilot.agent.budget import AgentLimits
from icarus.copilot.agent.context_usage import apportion
from icarus.copilot.agent.tokens import IMAGE_TOKENS, estimate
from icarus.copilot.agent.turn import new_message, turn_window
from icarus.copilot.attachments import AttachmentStore
from icarus.copilot.builtin_hooks import default_registry
from icarus.copilot.chat import Harness
from icarus.copilot.conversation_store import ConversationStore
from icarus.copilot.settings import ModelSettingsStore
from icarus.projects.store import ProjectStore
from icarus.sim.views import ViewRenderer
from tests.copilot.agent_script import answer_call
from tests.copilot.test_agent_loop import make_copilot, model, say
from tests.copilot.test_chat_media import add

NOTES = 'Remembered notes, quoted as data.\n- "The person wants a blue car" (from you, fact a1)'


@pytest.fixture(scope="module")
def views():
    renderer = ViewRenderer()
    yield renderer
    renderer.close()


@pytest.fixture
def store(tmp_path) -> ProjectStore:
    return ProjectStore(tmp_path / "projects")


@pytest.fixture
def settings(tmp_path) -> ModelSettingsStore:
    return ModelSettingsStore(tmp_path / "settings")


@pytest.fixture
def project_id(store) -> str:
    return store.create("Parking", "parking_car").project.id


def parts(usage: ContextUsage) -> dict[str, int]:
    return {category.part: category.tokens for category in usage.categories}


def assert_adds_up(usage: ContextUsage) -> None:
    assert sum(category.tokens for category in usage.categories) == usage.used
    for category in usage.categories:
        if category.items:
            assert sum(item.tokens for item in category.items) == category.tokens, category.part
    assert usage.used + usage.reserve + usage.free == usage.window or usage.free == 0


def test_the_meter_counts_exactly_what_the_next_turns_first_step_sends(
    tmp_path, store, settings, views, project_id, monkeypatch
):
    copilot = make_copilot(tmp_path, store, settings, views)
    copilot.attach_harness(Harness(None, default_registry(), lambda scope, text: NOTES, None))
    model(monkeypatch, [answer_call("Hello, what shall we build?")])
    say(copilot, project_id, "hi there")
    picture = add(AttachmentStore(tmp_path / "projects"), project_id)
    text = "What motors are there?"
    usage = copilot.context_usage(project_id, ContextRequest(text=text, attachments=[picture], workspace="World"))
    bodies = model(monkeypatch, [answer_call("These ones.")])
    copilot.send(project_id, SendMessage(text=text, attachments=[picture], workspace="World"))
    assert usage.used == estimate(bodies[0]["messages"], bodies[0]["tools"])
    assert_adds_up(usage)
    counted = parts(usage)
    assert all(counted[part] > 0 for part in ("system", "tools", "skills", "memory", "project", "history", "message"))
    assert counted["summary"] == 0
    attached = next(category for category in usage.categories if category.part == "attachments")
    assert [item.label for item in attached.items] == ["car.png"] and attached.tokens > IMAGE_TOKENS
    tools = next(category for category in usage.categories if category.part == "tools")
    offered = {tool["function"]["name"] for tool in bodies[0]["tools"]}
    assert {item.label for item in tools.items} == offered
    assert usage.model == "fixtures" and usage.capability == "reasoning" and not usage.window_known


def test_scene_renders_the_app_will_take_count_as_pictures(tmp_path, store, settings, views, project_id):
    copilot = make_copilot(tmp_path, store, settings, views)
    plain = copilot.context_usage(project_id, ContextRequest())
    looked = copilot.context_usage(project_id, ContextRequest(scene_views=2))
    attached = next(category for category in looked.categories if category.part == "attachments")
    assert [item.label for item in attached.items] == ["Scene render 1", "Scene render 2"]
    assert looked.used - plain.used >= 2 * IMAGE_TOKENS
    assert_adds_up(looked)


def test_a_long_conversation_shows_when_it_folds_into_the_summary(tmp_path, store, settings, views, project_id):
    limits = AgentLimits(context_tokens=32_000)
    copilot = make_copilot(tmp_path, store, settings, views, limits)
    short = copilot.context_usage(project_id, ContextRequest())
    assert not short.compaction.folding and short.compaction.history_tokens < short.compaction.fold_at
    with ConversationStore(tmp_path / "projects").editing(project_id) as conversation:
        for index in range(6):
            conversation.messages.append(new_message("user", f"request {index} " + "words " * 600))
            conversation.messages.append(new_message("copilot", f"answer {index} " + "done " * 600))
    usage = copilot.context_usage(project_id, ContextRequest())
    compaction = usage.compaction
    assert compaction.folding and compaction.folds_next_turn
    assert compaction.history_tokens > compaction.fold_at
    history = next(category for category in usage.categories if category.part == "history")
    assert history.tokens < compaction.history_tokens
    assert compaction.prune_at < usage.window - usage.reserve
    assert_adds_up(usage)


def test_a_prompt_past_the_window_leaves_no_free_room(tmp_path, store, settings, views, project_id):
    copilot = make_copilot(tmp_path, store, settings, views, AgentLimits(context_tokens=10_000))
    usage = copilot.context_usage(project_id, ContextRequest())
    assert usage.used > usage.window - usage.reserve and usage.free == 0
    assert_adds_up(usage)


def test_a_window_set_in_ai_models_sizes_the_meter_the_budget_and_compaction(
    tmp_path, store, settings, views, project_id
):
    copilot = make_copilot(tmp_path, store, settings, views)
    assumed = copilot.context_usage(project_id, ContextRequest())
    assert (assumed.window, assumed.window_source) == (AgentLimits().context_tokens, "assumed")
    settings.update(ModelSettingsPatch(context_tokens={"reasoning": 1_000_000}))
    usage = copilot.context_usage(project_id, ContextRequest())
    assert (usage.window, usage.window_known, usage.window_source) == (1_000_000, True, "set")
    assert turn_window(settings, "reasoning", AgentLimits()) == 1_000_000
    assert usage.compaction.fold_at > assumed.compaction.fold_at
    assert usage.free > assumed.free
    assert_adds_up(usage)


@pytest.mark.parametrize(("total", "weights"), [(10, [1, 1, 1]), (7, [0, 0]), (101, [5, 0, 3, 9]), (0, [4, 2])])
def test_apportion_keeps_the_exact_total(total, weights):
    shares = apportion(total, weights)
    assert sum(shares) == total and len(shares) == len(weights) and min(shares) >= 0
