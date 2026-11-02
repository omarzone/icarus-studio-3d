from fastapi import APIRouter, Request

from icarus.contracts.training import RunStatus
from icarus.projects.project_runs import delete_runs, duplicate_runs
from icarus.projects.store import ProjectStore
from icarus.training.run_store import RunStore

router = APIRouter()


@router.post("/projects/{project_id}/runs/copy-to/{target_id}", status_code=201)
def copy_runs(
    request: Request, project_id: str, target_id: str, brains: bool = True, runs: bool = True
) -> list[RunStatus]:
    """Copy the trained brains and runs of a project's current revision to another project, usually its duplicate."""
    store: ProjectStore = request.app.state.store
    run_store: RunStore = request.app.state.runs
    return duplicate_runs(run_store, store.state(project_id), store.state(target_id), brains, runs)


@router.delete("/projects/{project_id}/runs")
def remove_runs(request: Request, project_id: str) -> list[str]:
    """Delete every run of a project, refused while one is training; returns the removed run ids."""
    store: ProjectStore = request.app.state.store
    store.state(project_id)
    return delete_runs(request.app.state.runs, project_id)
