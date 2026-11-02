"""Subagents: self-contained jobs the copilot hands off, each an agent_turn task with its own budget and tools."""

import threading
from collections.abc import Callable
from dataclasses import dataclass, field

from icarus.contracts.copilot import Autonomy
from icarus.contracts.events import TaskInfo, TaskState
from icarus.tasks import CancelToken, TaskContext, TaskRegistry

MAX_PER_PROJECT = 3
DELEGATION_TOOLS = ("delegate", "message_task", "task_result", "tasks")
APPLY_TOOL = "apply"
MESSAGE_CHARS = 2_000


class SubagentRefused(ValueError):
    pass


class UnknownSubagent(LookupError):
    pass


@dataclass(frozen=True)
class SubagentBudget:
    max_steps: int = 12
    max_seconds: float = 600.0


@dataclass(frozen=True)
class SubagentOutcome:
    answer: str
    proposal_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class SubagentJob:
    """What the loop entry receives: the brief, its scope, and a getter for messages queued since its last step."""

    task_id: str
    project_id: str
    brief: str
    skills: tuple[str, ...]
    tools: tuple[str, ...]
    budget: SubagentBudget
    autonomy: Autonomy
    token: CancelToken
    next_messages: Callable[[], list[str]]
    progress: Callable[[float, str], None]


@dataclass(frozen=True)
class SubagentResult:
    task_id: str
    project_id: str
    brief: str
    state: TaskState
    answer: str = ""
    proposal_ids: tuple[str, ...] = ()
    reason: str | None = None


SubagentLoop = Callable[[SubagentJob], SubagentOutcome]


@dataclass
class _Subagent:
    project_id: str
    brief: str
    queue: list[str] = field(default_factory=list)
    outcome: SubagentOutcome | None = None
    reason: str | None = None


class Subagents:
    """Starts, messages and reads subagents; the registry publishes their task events."""

    def __init__(
        self,
        registry: TaskRegistry,
        loop: SubagentLoop,
        known_tools: frozenset[str],
        max_per_project: int = MAX_PER_PROJECT,
    ) -> None:
        self._registry = registry
        self._loop = loop
        self._known_tools = known_tools
        self._max_per_project = max_per_project
        self._agents: dict[str, _Subagent] = {}
        self._lock = threading.Lock()

    def delegate(
        self,
        project_id: str,
        brief: str,
        skills: tuple[str, ...],
        tools: tuple[str, ...],
        budget: SubagentBudget,
        autonomy: Autonomy,
        parent_task_id: str | None = None,
    ) -> TaskInfo:
        self._check_tools(tools, autonomy)
        with self._lock:
            running = [task_id for task_id, agent in self._agents.items() if agent.project_id == project_id]
            if sum(self._registry.get(task_id).state == "running" for task_id in running) >= self._max_per_project:
                raise SubagentRefused(f"At most {self._max_per_project} subagents run per project at once.")
            # The work waits until its record exists, so its first step can already read messages.
            ready = threading.Event()

            def work(context: TaskContext) -> None:
                ready.wait()
                self._run(context, brief, skills, tools, budget, autonomy, project_id)

            info = self._registry.start("agent_turn", brief, work, project_id, parent_task_id)
            self._agents[info.id] = _Subagent(project_id, brief)
        ready.set()
        return info

    def message(self, task_id: str, text: str) -> None:
        agent = self._agent(task_id)
        if self._registry.get(task_id).state != "running":
            raise UnknownSubagent(f"Subagent {task_id} has already finished.")
        with self._lock:
            agent.queue.append(text[:MESSAGE_CHARS])

    def result(self, task_id: str) -> SubagentResult:
        agent = self._agent(task_id)
        info = self._registry.get(task_id)
        outcome = agent.outcome or SubagentOutcome(answer="")
        return SubagentResult(
            task_id, agent.project_id, agent.brief, info.state, outcome.answer, outcome.proposal_ids, agent.reason
        )

    def wait(self, task_id: str, timeout: float | None = None) -> SubagentResult:
        self._agent(task_id)
        self._registry.wait(task_id, timeout)
        return self.result(task_id)

    def of_project(self, project_id: str) -> list[SubagentResult]:
        with self._lock:
            mine = [task_id for task_id, agent in self._agents.items() if agent.project_id == project_id]
        return [self.result(task_id) for task_id in mine]

    def _check_tools(self, tools: tuple[str, ...], autonomy: Autonomy) -> None:
        for name in tools:
            if name in DELEGATION_TOOLS:
                raise SubagentRefused(f"Subagents cannot use {name}: they never start or talk to other subagents.")
            if name == APPLY_TOOL and autonomy != "autopilot":
                raise SubagentRefused("A subagent gets apply only when the conversation is in autopilot.")
            if name not in self._known_tools:
                raise SubagentRefused(f"There is no tool named {name}.")

    def _run(
        self,
        context: TaskContext,
        brief: str,
        skills: tuple[str, ...],
        tools: tuple[str, ...],
        budget: SubagentBudget,
        autonomy: Autonomy,
        project_id: str,
    ) -> None:
        task_id = context.task_id
        timer = threading.Timer(budget.max_seconds, context.token.cancel)
        timer.daemon = True
        timer.start()
        job = SubagentJob(
            task_id,
            project_id,
            brief,
            skills,
            tools,
            budget,
            autonomy,
            context.token,
            lambda: self._drain(task_id),
            context.progress,
        )
        try:
            outcome = self._loop(job)
            # Stored before the registry publishes task_finished, so a listener can read the result at once.
            if not context.token.cancelled:
                self._agents[task_id].outcome = outcome
        except Exception as error:
            self._agents[task_id].reason = (str(error) or type(error).__name__)[:400]
            raise
        finally:
            timer.cancel()

    def _drain(self, task_id: str) -> list[str]:
        with self._lock:
            agent = self._agents[task_id]
            queued, agent.queue = agent.queue, []
        return queued

    def _agent(self, task_id: str) -> _Subagent:
        with self._lock:
            agent = self._agents.get(task_id)
        if agent is None:
            raise UnknownSubagent(f"There is no subagent {task_id}.")
        return agent
