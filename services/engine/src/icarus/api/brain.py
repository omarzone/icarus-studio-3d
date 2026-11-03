from fastapi import APIRouter, HTTPException, Request

from icarus.contracts.brain_network import (
    BrainActivations,
    BrainBehaviors,
    BrainNetwork,
    BrainReadings,
    BrainSizes,
    BrainSources,
)
from icarus.projects.store import ProjectStore
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


@router.get("/runs/{run_id}/readings")
def get_readings(request: Request, run_id: str, step: int | None = None) -> BrainReadings:
    """What the checkpoint senses and does one second into its first evaluation episode, as MuJoCo computed it."""
    from icarus.sim.brain_readings import read_readings

    folder, step = _checkpoint(request, run_id, step)
    try:
        return read_readings(folder.checkpoint_path(step), folder.project(), run_id, step)
    except ValueError as error:
        raise _invalid(error) from error


@router.get("/runs/{run_id}/behaviors")
def get_behaviors(request: Request, run_id: str, step: int | None = None) -> BrainBehaviors:
    """How the checkpoint's recorded evaluation episodes went, grouped by how they ended."""
    from icarus.training.brain_insights import behaviors

    folder, step = _checkpoint(request, run_id, step)
    episodes = folder.episodes(step)
    if episodes is None or not episodes.episodes:
        return BrainBehaviors(run_id=run_id, step=step, behaviors=[])
    return behaviors(run_id, episodes)


@router.get("/projects/{project_id}/brain/sizes")
def get_brain_sizes(request: Request, project_id: str) -> BrainSizes:
    """The brain sizes offered, each with what a run of this project that trained it measured."""
    from icarus.training.brain_insights import sizes

    store: ProjectStore = request.app.state.store
    return sizes(request.app.state.runs, store.state(project_id).project)


@router.get("/projects/{project_id}/brain/sources")
def get_brain_sources(request: Request, project_id: str) -> BrainSources:
    """Trained brains of every project, each saying whether it can drive this body."""
    from icarus.training.brain_insights import sources

    store: ProjectStore = request.app.state.store
    names = {summary.id: summary.name for summary in store.list_projects()}
    project = store.state(project_id).project
    return sources(request.app.state.runs, project, lambda other: names.get(other, "A deleted project"))
