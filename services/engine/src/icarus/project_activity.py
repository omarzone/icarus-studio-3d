"""What of a project still runs in the engine, and closing a project: stop all of it and wait for it to end."""

import time
from dataclasses import dataclass

from icarus.contracts.project import ProjectClosed, ProjectWork
from icarus.copilot.autopilot import Autopilot
from icarus.tasks import TaskRegistry
from icarus.training.run_store import TERMINAL_STATES, RunStore
from icarus.training.supervisor import Supervisor

CLOSE_WAIT_SECONDS = 20.0
POLL_SECONDS = 0.1


@dataclass(frozen=True)
class ProjectWorkers:
    runs: RunStore
    supervisor: Supervisor
    autopilot: Autopilot
    tasks: TaskRegistry


def running_work(workers: ProjectWorkers, project_id: str) -> list[ProjectWork]:
    work: list[ProjectWork] = []
    if workers.autopilot.drives(project_id):
        work.append(ProjectWork(kind="autopilot", id=project_id, title="Autopilot"))
    for status in workers.runs.list_runs(project_id):
        if status.state not in TERMINAL_STATES:
            progress = min(status.step / status.total_steps, 1.0) if status.total_steps > 0 else None
            work.append(ProjectWork(kind="training", id=status.run_id, title=status.name, progress=progress))
    for task in workers.tasks.list(project_id):
        if task.state == "running":
            work.append(ProjectWork(kind="task", id=task.id, title=task.title, progress=task.progress))
    return work


def close_project(workers: ProjectWorkers, project_id: str, wait: float = CLOSE_WAIT_SECONDS) -> ProjectClosed:
    """Stop the autopilot, every training run and every task of the project, then wait for them to end."""
    work = running_work(workers, project_id)
    for item in work:
        match item.kind:
            case "autopilot":
                workers.autopilot.stop(project_id)
            case "training":
                if workers.runs.folder(item.id).status().state not in TERMINAL_STATES:
                    workers.supervisor.stop(item.id)
            case "task":
                workers.tasks.cancel(item.id)
    deadline = time.monotonic() + wait
    while time.monotonic() < deadline and _unfinished(workers, project_id, work):
        time.sleep(POLL_SECONDS)
    left = _unfinished(workers, project_id, work)
    return ProjectClosed(
        project_id=project_id,
        stopped=[item for item in work if item not in left],
        still_running=left,
    )


def _unfinished(workers: ProjectWorkers, project_id: str, work: list[ProjectWork]) -> list[ProjectWork]:
    still = {(item.kind, item.id) for item in running_work(workers, project_id)}
    return [item for item in work if (item.kind, item.id) in still]
