from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from icarus.contracts.play import PlayBrainOption
from icarus.contracts.project import Project
from icarus.contracts.training import RunStatus
from icarus.design.compiler import CompileError
from icarus.sim.model_state import build_world, observation
from icarus.training.run_store import TERMINAL_STATES, RunFolder, RunStore, UnknownRun


class BrainUnavailable(ValueError):
    """A chosen brain Play cannot use, with a sentence a person can read."""


@dataclass(frozen=True)
class BodySize:
    senses: int
    motors: int


def body_size(project: Project) -> BodySize | None:
    """How many numbers the brain reads and writes for this body, or None when it does not compile."""
    try:
        world = build_world(project)
    except CompileError:
        return None
    return BodySize(senses=int(observation(world).shape[0]), motors=len(world.actuators))


@lru_cache(maxsize=256)
def frozen_size(run_path: Path) -> BodySize | None:
    """The body a run trained with; a run's project never changes, so it is computed once."""
    try:
        return body_size(RunFolder(run_path).project())
    except (OSError, ValueError):
        return None


def misfit(now: BodySize | None, then: BodySize | None) -> str | None:
    """Why a brain trained on `then` cannot drive the body `now`, or None when it fits."""
    if now is None:
        return "The body cannot be built right now"
    if then is None:
        return "The body this brain trained with can no longer be built"
    if now.senses != then.senses:
        return f"The body changed: {now.senses} senses now, {then.senses} then"
    if now.motors != then.motors:
        return f"The body changed: {now.motors} motors now, {then.motors} then"
    return None


def compact_steps(steps: int) -> str:
    if steps >= 1_000_000:
        return f"{round(steps / 1_000_000, 2):g}M"
    if steps >= 1_000:
        return f"{round(steps / 1_000, 1):g}k"
    return str(steps)


def _label(status: RunStatus, step: int, success_rate: float | None) -> str:
    parts = [status.name, f"{compact_steps(step)} steps", f"revision {status.revision_number}"]
    if success_rate is not None:
        parts.append(f"{round(success_rate * 100)}% success")
    return " · ".join(parts)


def _newest_fitting(runs: RunStore, project: Project) -> tuple[RunStatus, Path] | None:
    """The best checkpoint of the newest ended run of any revision whose body the brain still drives."""
    now = body_size(project)
    for status in runs.list_runs(project.id):
        if status.state not in TERMINAL_STATES or not status.best_step or status.agent is not None:
            continue
        folder = runs.folder(status.run_id)
        path = folder.checkpoint_path(status.best_step)
        if path.is_file() and misfit(now, frozen_size(folder.path)) is None:
            return status, path
    return None


def default_checkpoint(runs: RunStore, project: Project, revision: int) -> tuple[RunStatus, Path] | None:
    """The brain Play uses when none is chosen: the best of this revision, else, unless the project loads a brain of
    its own, the newest trained brain that still fits the body."""
    trained = runs.trained_checkpoint(project.id, revision, project)
    if trained is not None or project.brain.start_from is not None:
        return trained
    return _newest_fitting(runs, project)


def brain_options(runs: RunStore, project: Project, revision: int) -> list[PlayBrainOption]:
    """The best checkpoint of every ended run of the project, newest first, each saying whether it fits the body."""
    now = body_size(project)
    default = default_checkpoint(runs, project, revision)
    default_run = default[0].run_id if default is not None else None
    options: list[PlayBrainOption] = []
    for status in runs.list_runs(project.id):
        # An agent's run in a group plays only beside the other agents, each with its own best brain.
        if status.state not in TERMINAL_STATES or not status.best_step or status.agent is not None:
            continue
        folder = runs.folder(status.run_id)
        if not folder.checkpoint_path(status.best_step).is_file():
            continue
        success = next((info.success_rate for info in folder.checkpoints() if info.step == status.best_step), None)
        reason = misfit(now, frozen_size(folder.path))
        options.append(
            PlayBrainOption(
                run_id=status.run_id,
                step=status.best_step,
                revision_number=status.revision_number,
                label=_label(status, status.best_step, success),
                success_rate=success,
                fits=reason is None,
                reason=reason,
                default=status.run_id == default_run,
            )
        )
    return options


def chosen_checkpoint(runs: RunStore, project: Project, run_id: str, step: int) -> tuple[Path, str]:
    """The checkpoint file of a brain the user picked and its label, once it is known to fit the body."""
    try:
        folder = runs.folder(run_id)
    except UnknownRun as error:
        raise BrainUnavailable(f"There is no run {run_id!r}") from error
    status = folder.status()
    if status.project_id != project.id:
        raise BrainUnavailable(f"{status.name} belongs to another project")
    path = folder.checkpoint_path(step)
    if not path.is_file() or step not in {info.step for info in folder.checkpoints()}:
        raise BrainUnavailable(f"{status.name} has no brain saved at {step:,} steps")
    reason = misfit(body_size(project), frozen_size(folder.path))
    if reason is not None:
        raise BrainUnavailable(reason)
    return path, f"Trained brain: {status.name} at {step:,} steps"
