from fastapi import APIRouter, HTTPException, Request

from icarus.contracts.brain_network import BrainActivations, BrainNetwork
from icarus.training.run_store import RunFolder, RunStore

router = APIRouter()


def _checkpoint(request: Request, run_id: str, step: int | None) -> tuple[RunFolder, int]:
    """The run folder and the checkpoint step to read: the one asked for, else the best, else the latest."""
    runs: RunStore = request.app.state.runs
    folder = runs.folder(run_id)
    if step is None:
        steps = [checkpoint.step for checkpoint in folder.checkpoints()]
        step = folder.status().best_step if folder.status().best_step is not None else max(steps, default=None)
    if step is None or not folder.checkpoint_path(step).is_file():
        raise HTTPException(status_code=404, detail="There is no checkpoint at that step")
    return folder, step


def _invalid(error: ValueError) -> HTTPException:
    return HTTPException(status_code=422, detail=str(error))


@router.get("/runs/{run_id}/network")
def get_network(request: Request, run_id: str, step: int | None = None) -> BrainNetwork:
    """The policy network of a checkpoint with its inputs and outputs named after the run's body."""
    from icarus.sim.brain_network import read_network

    folder, step = _checkpoint(request, run_id, step)
    try:
        return read_network(folder.checkpoint_path(step), folder.project(), run_id, step)
    except ValueError as error:
        raise _invalid(error) from error


@router.get("/runs/{run_id}/activations")
def get_activations(request: Request, run_id: str, step: int | None = None) -> BrainActivations:
    """What every neuron computes for the first observation of the checkpoint's evaluation episode."""
    from icarus.sim.brain_network import read_activations

    folder, step = _checkpoint(request, run_id, step)
    try:
        return read_activations(folder.checkpoint_path(step), folder.project(), run_id, step)
    except ValueError as error:
        raise _invalid(error) from error
