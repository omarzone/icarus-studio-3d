from fastapi import APIRouter, Request

from icarus.contracts.project import ProjectActivity, ProjectClosed
from icarus.project_activity import ProjectWorkers, close_project, running_work

router = APIRouter(prefix="/projects")


def _workers(request: Request, project_id: str) -> ProjectWorkers:
    state = request.app.state
    state.store.state(project_id)
    return ProjectWorkers(state.runs, state.supervisor, state.autopilot, state.tasks)


@router.get("/{project_id}/activity")
def project_activity(request: Request, project_id: str) -> ProjectActivity:
    """What of the project still runs in the engine: training runs, the autopilot and background tasks."""
    return ProjectActivity(project_id=project_id, running=running_work(_workers(request, project_id), project_id))


@router.post("/{project_id}/close")
def close(request: Request, project_id: str) -> ProjectClosed:
    """Stop everything the project still runs, keeping each run's best brain, and wait for it to end."""
    return close_project(_workers(request, project_id), project_id)
