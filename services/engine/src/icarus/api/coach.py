from fastapi import APIRouter, Request

from icarus.contracts.coach import AutopilotStart, AutopilotStatus, Diagnosis, FailureGroup
from icarus.copilot.autopilot import Autopilot
from icarus.copilot.coach import Coach
from icarus.copilot.run_frames import RunFrames
from icarus.training.run_store import RunStore

router = APIRouter()


def _coach(request: Request) -> Coach:
    return request.app.state.coach


def _autopilot(request: Request) -> Autopilot:
    return request.app.state.autopilot


@router.post("/runs/{run_id}/diagnosis")
def diagnose_run(request: Request, run_id: str, step: int | None = None) -> Diagnosis:
    """The coach's diagnosis of a checkpoint (the latest when no step is given), also posted in the conversation."""
    return _coach(request).diagnose(run_id, step)


@router.get("/runs/{run_id}/diagnoses")
def list_diagnoses(request: Request, run_id: str) -> list[Diagnosis]:
    return _coach(request).diagnoses(run_id)


@router.get("/runs/{run_id}/checkpoints/{step}/failures")
def checkpoint_failures(request: Request, run_id: str, step: int) -> list[FailureGroup]:
    runs: RunStore = request.app.state.runs
    frames: RunFrames = request.app.state.run_frames
    return frames.failure_groups(runs.folder(run_id), step)


@router.post("/projects/{project_id}/autopilot", status_code=201)
def start_autopilot(request: Request, project_id: str, body: AutopilotStart) -> AutopilotStatus:
    return _autopilot(request).start(project_id, body)


@router.get("/projects/{project_id}/autopilot")
def get_autopilot(request: Request, project_id: str) -> AutopilotStatus:
    return _autopilot(request).status(project_id)


@router.delete("/projects/{project_id}/autopilot")
def stop_autopilot(request: Request, project_id: str) -> AutopilotStatus:
    return _autopilot(request).stop(project_id)
