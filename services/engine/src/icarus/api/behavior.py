from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from icarus.contracts.behavior import (
    BehaviorComparison,
    BehaviorTest,
    BehaviorTestDraft,
    BehaviorTestResult,
    CheckpointEpisode,
    EpisodeActivations,
)
from icarus.projects.store import ProjectStore
from icarus.sim.views import RenderUnavailable, ViewRenderer
from icarus.training.behavior_match import compare
from icarus.training.behavior_tests import BehaviorTestStore, run_test, stored_result, stored_results
from icarus.training.episodes import succeeded
from icarus.training.failure_groups import ending_label
from icarus.training.recording_export import export_recording
from icarus.training.run_store import RunFolder, RunStore

router = APIRouter()


def _tests(request: Request) -> BehaviorTestStore:
    return request.app.state.behavior_tests


def _folder(request: Request, run_id: str) -> RunFolder:
    runs: RunStore = request.app.state.runs
    return runs.folder(run_id)


def _project_of(request: Request, project_id: str) -> None:
    store: ProjectStore = request.app.state.store
    store.state(project_id)


@router.get("/projects/{project_id}/behavior-tests")
def list_tests(request: Request, project_id: str) -> list[BehaviorTest]:
    _project_of(request, project_id)
    return _tests(request).tests(project_id)


@router.post("/projects/{project_id}/behavior-tests", status_code=201)
def add_test(request: Request, project_id: str, body: BehaviorTestDraft) -> BehaviorTest:
    _project_of(request, project_id)
    return _tests(request).add(project_id, body)


@router.delete("/projects/{project_id}/behavior-tests/{test_id}")
def remove_test(request: Request, project_id: str, test_id: str) -> list[BehaviorTest]:
    _project_of(request, project_id)
    return _tests(request).remove(project_id, test_id)


@router.post("/runs/{run_id}/checkpoints/{step}/behavior-tests/{test_id}")
def run_behavior_test(request: Request, run_id: str, step: int, test_id: str) -> BehaviorTestResult:
    """Judge the checkpoint on the test with MuJoCo; the result is kept in the run folder."""
    folder = _folder(request, run_id)
    test = _tests(request).test(folder.config().project_id, test_id)
    return run_test(folder, step, test)


@router.get("/runs/{run_id}/behavior-tests")
def list_results(request: Request, run_id: str) -> list[BehaviorTestResult]:
    return stored_results(_folder(request, run_id))


@router.get("/behavior-tests/compare")
def compare_results(request: Request, test: str, a: str, a_step: int, b: str, b_step: int) -> BehaviorComparison:
    """Two checkpoints on the same test (both must have run it), with how alike their recorded paths are."""
    first = stored_result(_folder(request, a), a_step, test)
    second = stored_result(_folder(request, b), b_step, test)
    if first is None or second is None:
        raise HTTPException(status_code=404, detail="Run the test on both checkpoints first")
    return compare(first, second)


@router.get("/runs/{run_id}/checkpoints/{step}/episodes")
def checkpoint_episodes(request: Request, run_id: str, step: int) -> list[CheckpointEpisode]:
    """Every evaluation episode of the checkpoint with pass or fail."""
    episodes = _folder(request, run_id).episodes(step)
    if episodes is None:
        raise HTTPException(status_code=404, detail=f"No episodes were recorded at step {step}")
    return [
        CheckpointEpisode(
            index=record.index,
            seed=record.seed,
            passed=succeeded(record, episodes.has_goal),
            ending=ending_label(record, episodes),
            seconds=record.seconds,
            episode_return=record.episode_return,
        )
        for record in episodes.episodes
    ]


@router.get("/runs/{run_id}/episode-activations")
def episode_activations(request: Request, run_id: str, step: int) -> EpisodeActivations:
    """Every hidden neuron's activity over the checkpoint's recorded evaluation episode."""
    from icarus.sim.brain_network import read_episode_activations

    folder = _folder(request, run_id)
    if not folder.checkpoint_path(step).is_file():
        raise HTTPException(status_code=404, detail="There is no checkpoint at that step")
    try:
        return read_episode_activations(
            folder.checkpoint_path(step), folder.project(), run_id, step, folder.rollout(step)
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/runs/{run_id}/checkpoints/{step}/recording")
def export_episode(request: Request, run_id: str, step: int, episode: int = 0) -> FileResponse:
    """The recorded evaluation episode as an animated PNG, rendered once and kept in the run folder."""
    views: ViewRenderer = request.app.state.views
    try:
        path = export_recording(_folder(request, run_id), step, episode, views)
    except RenderUnavailable as error:
        raise HTTPException(status_code=503, detail=f"The recording could not be rendered: {error}") from error
    return FileResponse(path, media_type="image/png", filename=f"checkpoint-{step}-episode-{episode + 1}.png")
