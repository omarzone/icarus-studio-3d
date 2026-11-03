"""What the brain workspace reads about brains from real runs: how episodes went, sizes tried and brains to load."""

from collections.abc import Callable
from statistics import mean

from icarus.contracts.brain_network import (
    BrainBehavior,
    BrainBehaviors,
    BrainSizeOption,
    BrainSizes,
    BrainSourceOption,
    BrainSources,
    TrainedSize,
)
from icarus.contracts.project import Project
from icarus.contracts.training import RunStatus
from icarus.training.episodes import CheckpointEpisodes
from icarus.training.failure_groups import failure_groups
from icarus.training.play_brains import body_size, frozen_size, misfit
from icarus.training.run_store import TERMINAL_STATES, RunFolder, RunStore

# Sizes the brain workspace offers: (id, label, neurons per hidden layer).
SIZES: tuple[tuple[str, str, tuple[int, ...]], ...] = (
    ("small", "Small", (64, 64)),
    ("medium", "Medium", (256, 256)),
    ("large", "Large", (512, 512, 512)),
)
# The library's default brain, recommended until a run of the project shows another size does better.
DEFAULT_SIZE = "medium"


def behaviors(run_id: str, episodes: CheckpointEpisodes) -> BrainBehaviors:
    """How the checkpoint's evaluation episodes went, grouped by ending, the most common first."""
    by_index = {record.index: record for record in episodes.episodes}
    found: list[BrainBehavior] = []
    for group in failure_groups(episodes):
        records = [by_index[index] for index in group.episodes]
        if group.kind == "touched_obstacle":
            seconds: float | None = mean(record.touched_at or 0.0 for record in records)
        elif group.kind in ("reached_goal", "fell_early", "fell_late"):
            seconds = mean(record.seconds for record in records)
        else:
            seconds = None
        found.append(
            BrainBehavior(
                id=group.kind,
                name=group.label,
                detail=group.description,
                episodes=len(records),
                of=len(episodes.episodes),
                seconds=None if seconds is None else round(seconds, 2),
            )
        )
    return BrainBehaviors(run_id=run_id, step=episodes.step, behaviors=found)


def _best_success(folder: RunFolder, status: RunStatus) -> float | None:
    return next((info.success_rate for info in folder.checkpoints() if info.step == status.best_step), None)


def _ended(runs: RunStore, statuses: list[RunStatus]) -> list[tuple[RunStatus, RunFolder]]:
    """Runs that ended with a saved best brain, newest first."""
    ended: list[tuple[RunStatus, RunFolder]] = []
    for status in statuses:
        if status.state not in TERMINAL_STATES or not status.best_step or status.agent is not None:
            continue
        folder = runs.folder(status.run_id)
        if folder.checkpoint_path(status.best_step).is_file():
            ended.append((status, folder))
    return ended


def _trained(status: RunStatus, folder: RunFolder) -> TrainedSize:
    finished = status.finished_at or status.started_at
    return TrainedSize(
        run_id=status.run_id,
        run_name=status.name,
        minutes=round(max(0.0, (finished - status.started_at).total_seconds()) / 60, 1),
        steps=status.step,
        success_rate=_best_success(folder, status),
    )


def sizes(runs: RunStore, project: Project) -> BrainSizes:
    """The offered sizes, each with the newest run of this project that trained one, and the one to recommend."""
    tried: dict[tuple[int, ...], TrainedSize] = {}
    for status, folder in _ended(runs, runs.list_runs(project.id)):
        layers = tuple(folder.project().brain.layers)
        tried.setdefault(layers, _trained(status, folder))
    measured = [(tried[layers].success_rate, key) for key, _, layers in SIZES if layers in tried]
    scored = [(rate, key) for rate, key in measured if rate is not None]
    recommended = max(scored)[1] if scored else DEFAULT_SIZE
    size = body_size(project)
    return BrainSizes(
        project_id=project.id,
        senses=size.senses if size else 0,
        motors=size.motors if size else 0,
        sizes=[
            BrainSizeOption(
                id=key,
                label=label,
                layers=list(layers),
                recommended=key == recommended,
                current=list(layers) == project.brain.layers,
                trained=tried.get(layers),
            )
            for key, label, layers in SIZES
        ],
    )


def sources(runs: RunStore, project: Project, project_name: Callable[[str], str]) -> BrainSources:
    """The best brain of every ended run of any project, newest first, each saying whether it can drive this body
    with this brain's layers."""
    now = body_size(project)
    options: list[BrainSourceOption] = []
    for status, folder in _ended(runs, runs.all_runs()):
        was = folder.project()
        reason = misfit(now, frozen_size(folder.path))
        if reason is None and was.brain.layers != project.brain.layers:
            layers = " and ".join(str(size) for size in was.brain.layers)
            reason = f"Its layers have {layers} neurons; give this brain the same size to load it"
        options.append(
            BrainSourceOption(
                run_id=status.run_id,
                step=status.best_step or 0,
                project_id=status.project_id,
                project_name=project_name(status.project_id),
                run_name=status.name,
                success_rate=_best_success(folder, status),
                fits=reason is None,
                reason=reason,
            )
        )
    options.sort(key=lambda option: (not option.fits, option.project_id != project.id))
    return BrainSources(
        project_id=project.id,
        senses=now.senses if now else 0,
        motors=now.motors if now else 0,
        selected=project.brain.start_from,
        options=options,
    )
