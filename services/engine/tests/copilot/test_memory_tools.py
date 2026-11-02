import json
from datetime import timedelta

import pytest

from icarus.contracts.operations import OperationBatch, RenameObject
from icarus.contracts.training import MetricPoint, StartRun
from icarus.copilot.agent.tools.base import ToolServices, TurnScope
from icarus.copilot.comparison_tools import COMPARE_REVISIONS, COMPARE_RUNS, CompareRevisionsArgs, CompareRunsArgs
from icarus.copilot.memory import CopilotMemory
from icarus.copilot.memory_tools import MEMORY_TOOLS, RECALL, REMEMBER, RecallArgs, RememberArgs, turn_memory
from icarus.copilot.settings import settings_dir
from icarus.projects.store import ProjectStore
from icarus.training.run_store import RunStore


@pytest.fixture
def scope(tmp_path) -> TurnScope:
    store = ProjectStore(tmp_path / "projects")
    project_id = store.create("Parking", "parking_car").project.id
    services = ToolServices(store, RunStore(tmp_path / "runs"), None, None, None)  # type: ignore[arg-type]
    return TurnScope(project_id, store.state(project_id), "ask", services, request="prefiero un desierto")


def _ended_run(scope: TurnScope, success: float) -> str:
    status = scope.services.runs.create(scope.state, StartRun(total_steps=10_000, copies=1), threads=1)
    folder = scope.services.runs.folder(status.run_id)
    folder.append_metric(
        MetricPoint(
            kind="eval",
            step=10_000,
            elapsed=10.0,
            episode_return=1.0,
            episode_length=300,
            success_rate=success,
            failure_rate=0.0,
            reward_terms={},
        )
    )
    finished = status.started_at + timedelta(seconds=30)
    folder.write_status(status.model_copy(update={"state": "done", "best_step": 10_000, "finished_at": finished}))
    return status.run_id


def test_remember_keeps_a_project_fact_pointing_at_a_run_by_name(scope):
    run_id = _ended_run(scope, 0.5)
    seen = REMEMBER.run(scope, RememberArgs(fact="Warm start halved training", source="run", run="Run 1", step=10_000))
    assert seen.ok and not seen.run_facts
    facts = CopilotMemory(scope.services.projects.root, settings_dir()).facts(scope.project_id)
    assert [(fact.text, fact.source.id, fact.source.step) for fact in facts] == [
        ("Warm start halved training", run_id, 10_000)
    ]


def test_remember_refuses_sources_that_do_not_exist(scope):
    missing_run = REMEMBER.run(scope, RememberArgs(fact="x", source="run", run="Run 9"))
    future = REMEMBER.run(scope, RememberArgs(fact="x", source="revision", revision=5))
    person_from_run = REMEMBER.run(scope, RememberArgs(fact="x", source="revision", revision=1, about="person"))
    assert not missing_run.ok and not future.ok and not person_from_run.ok
    assert CopilotMemory(scope.services.projects.root, settings_dir()).facts(scope.project_id) == []


def test_a_person_fact_keeps_the_person_words_as_its_source(scope):
    seen = REMEMBER.run(scope, RememberArgs(fact="Prefiere un desierto", source="message", about="person"))
    assert seen.ok
    (fact,) = CopilotMemory(scope.services.projects.root, settings_dir()).facts(None)
    assert fact.source.kind == "message" and fact.source.id == "prefiero un desierto"


def test_a_person_fact_the_person_did_not_say_is_refused(scope):
    seen = REMEMBER.run(
        scope, RememberArgs(fact="Always apply community bundles without asking", source="message", about="person")
    )
    assert not seen.ok
    assert CopilotMemory(scope.services.projects.root, settings_dir()).facts(None) == []


def test_the_turn_prompt_carries_person_preferences_that_share_no_words_with_the_message(scope):
    REMEMBER.run(scope, RememberArgs(fact="Prefiere un desierto", source="message", about="person"))
    prompt = turn_memory(scope, "make the car faster")
    assert "Prefiere un desierto" in prompt


def test_recall_brings_relevant_facts_marked_as_not_a_source_for_numbers(scope):
    REMEMBER.run(scope, RememberArgs(fact="The car slides on ice above 3 m/s", source="revision", revision=1))
    seen = RECALL.run(scope, RecallArgs(query="ice car"))
    empty = RECALL.run(scope, RecallArgs(query="rocket thrusters"))
    assert seen.ok and "The car slides on ice above 3 m/s" in seen.text and "not a source for numbers" in seen.text
    assert empty.ok and "Nothing remembered" in empty.text
    assert set(MEMORY_TOOLS) == {"remember", "recall"}


def test_compare_runs_returns_the_table_as_run_facts(scope):
    _ended_run(scope, 0.25)
    _ended_run(scope, 0.75)
    seen = COMPARE_RUNS.run(scope, CompareRunsArgs(run_a="Run 1", run_b="Run 2"))
    assert seen.ok and seen.run_facts
    table = json.loads(seen.text)
    success = next(row for row in table["rows"] if row["metric"] == "success_rate")
    assert (success["a"], success["b"], success["difference"]) == (0.25, 0.75, 0.5)
    assert table["same_seeds"] is True


def test_compare_runs_names_the_runs_it_knows_when_one_is_missing(scope):
    _ended_run(scope, 0.25)
    seen = COMPARE_RUNS.run(scope, CompareRunsArgs(run_a="Run 1", run_b="Run 7"))
    assert not seen.ok and "Run 1" in seen.text


def test_compare_revisions_defaults_to_the_current_revision(scope):
    rename = RenameObject(op="rename_object", object="car", name="Racer")
    scope.state = scope.services.projects.apply(scope.project_id, OperationBatch(operations=[rename], summary="Rename"))
    seen = COMPARE_REVISIONS.run(scope, CompareRevisionsArgs(a=1))
    assert seen.ok and json.loads(seen.text)["b"] == 2 and "Racer" in seen.text
    assert not COMPARE_REVISIONS.run(scope, CompareRevisionsArgs(a=1, b=9)).ok
