import threading

import pytest

from icarus.contracts.events import EngineEvent
from icarus.copilot.agent.tools.base import ToolServices, TurnScope
from icarus.copilot.subagent_tools import (
    DelegateArgs,
    MessageTaskArgs,
    TaskResultArgs,
    TasksArgs,
    subagent_tools,
)
from icarus.copilot.subagents import (
    DELEGATION_TOOLS,
    SubagentBudget,
    SubagentJob,
    SubagentOutcome,
    SubagentRefused,
    Subagents,
    UnknownSubagent,
)
from icarus.projects.store import ProjectStore
from icarus.tasks import TaskRegistry
from icarus.training.run_store import RunStore

KNOWN = frozenset({"library", "inspect_object", "try", "look", "propose", "apply", "read_run", *DELEGATION_TOOLS})


class FakeLoop:
    """Stands in for the agent loop: waits until released, reads its messages, then answers."""

    def __init__(self) -> None:
        self.release = threading.Event()
        self.jobs: list[SubagentJob] = []
        self.read: list[list[str]] = []

    def __call__(self, job: SubagentJob) -> SubagentOutcome:
        self.jobs.append(job)
        while not self.release.wait(0.01):
            job.token.check()
        self.read.append(job.next_messages())
        return SubagentOutcome(answer=f"Done: {job.brief}", proposal_ids=("p1",))


@pytest.fixture
def events() -> list[tuple[EngineEvent, str | None]]:
    return []


@pytest.fixture
def loop() -> FakeLoop:
    return FakeLoop()


@pytest.fixture
def hub(events, loop) -> Subagents:
    registry = TaskRegistry(lambda event, project: events.append((event, project)))
    return Subagents(registry, loop, KNOWN)


def _delegate(hub: Subagents, project: str = "p", tools: tuple[str, ...] = ("library", "propose")) -> str:
    return hub.delegate(project, "Design the arena", ("walking-robot",), tools, SubagentBudget(), "ask").id


def test_a_subagent_runs_as_an_agent_turn_task_and_returns_its_answer_and_proposals(hub, loop, events):
    task_id = _delegate(hub)

    assert hub.result(task_id).state == "running"
    loop.release.set()
    result = hub.wait(task_id, timeout=5)

    assert result.state == "done"
    assert result.answer == "Done: Design the arena"
    assert result.proposal_ids == ("p1",)
    job = loop.jobs[0]
    assert (job.task_id, job.project_id, job.skills, job.tools) == (
        task_id,
        "p",
        ("walking-robot",),
        ("library", "propose"),
    )
    kinds = [(event.type, project) for event, project in events]
    assert kinds == [("task_started", "p"), ("task_finished", "p")]
    assert events[0][0].task.kind == "agent_turn"  # type: ignore[union-attr]


def test_messages_are_queued_and_read_once_at_the_next_step(hub, loop):
    task_id = _delegate(hub)
    hub.message(task_id, "Make it wider")
    hub.message(task_id, "And add a ramp")

    loop.release.set()
    hub.wait(task_id, timeout=5)

    assert loop.read == [["Make it wider", "And add a ramp"]]
    with pytest.raises(UnknownSubagent):
        hub.message(task_id, "Too late")


def test_at_most_three_subagents_run_per_project(hub, loop):
    for _ in range(3):
        _delegate(hub)

    with pytest.raises(SubagentRefused, match="3"):
        _delegate(hub)
    assert _delegate(hub, project="other")
    loop.release.set()


def test_subagents_never_get_delegation_tools_and_apply_only_in_autopilot(hub, loop):
    with pytest.raises(SubagentRefused, match="delegate"):
        _delegate(hub, tools=("library", "delegate"))
    with pytest.raises(SubagentRefused, match="apply"):
        _delegate(hub, tools=("apply",))
    with pytest.raises(SubagentRefused, match="unknown"):
        _delegate(hub, tools=("unknown",))

    task_id = hub.delegate("p", "Fix it", (), ("apply",), SubagentBudget(), "autopilot").id
    loop.release.set()
    assert hub.wait(task_id, timeout=5).state == "done"


def test_a_subagent_over_its_time_budget_is_stopped(hub, loop):
    task_id = hub.delegate("p", "Slow", (), ("library",), SubagentBudget(max_seconds=0.05), "ask").id

    result = hub.wait(task_id, timeout=5)

    assert result.state == "stopped"
    assert result.answer == ""


def test_a_failing_loop_reports_its_reason(events):
    def broken(job: SubagentJob) -> SubagentOutcome:
        raise RuntimeError("model unavailable")

    hub = Subagents(TaskRegistry(lambda event, project: events.append((event, project))), broken, KNOWN)
    task_id = _delegate(hub)

    result = hub.wait(task_id, timeout=5)

    assert (result.state, result.reason) == ("failed", "model unavailable")


def test_unknown_task_ids_are_refused(hub):
    with pytest.raises(UnknownSubagent):
        hub.result("nope")


@pytest.fixture
def scope(tmp_path) -> TurnScope:
    store = ProjectStore(tmp_path / "projects")
    project_id = store.create("Walker", "empty_world").project.id
    services = ToolServices(store, RunStore(tmp_path / "runs"), None, None, None)  # type: ignore[arg-type]
    return TurnScope(project_id, store.state(project_id), "ask", services, language="es")


def test_the_tools_delegate_message_and_read_results_in_the_turn_project(hub, loop, scope):
    tools = subagent_tools(hub)
    assert set(tools) == set(DELEGATION_TOOLS)

    started = tools["delegate"].run(scope, DelegateArgs(brief="Design the arena", tools=["library", "propose"]))
    assert started.ok
    task_id = loop_task_id(hub, scope.project_id)
    assert task_id in started.text

    assert tools["message_task"].run(scope, MessageTaskArgs(task_id=task_id, text="Wider")).ok
    listed = tools["tasks"].run(scope, TasksArgs())
    assert task_id in listed.text and "running" in listed.text

    loop.release.set()
    hub.wait(task_id, timeout=5)
    result = tools["task_result"].run(scope, TaskResultArgs(task_id=task_id))
    assert "Done: Design the arena" in result.text and "p1" in result.text


def test_the_tools_report_refusals_as_failed_observations(hub, scope):
    tools = subagent_tools(hub)

    refused = tools["delegate"].run(scope, DelegateArgs(brief="x", tools=["apply"]))
    missing = tools["task_result"].run(scope, TaskResultArgs(task_id="nope"))

    assert not refused.ok and "apply" in refused.text
    assert not missing.ok


def loop_task_id(hub: Subagents, project_id: str) -> str:
    return hub.of_project(project_id)[0].task_id
