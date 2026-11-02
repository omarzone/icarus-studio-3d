from pydantic import BaseModel, ConfigDict

from icarus.contracts.training import MetricPoint, RunState
from icarus.training.evaluation import EVALUATION_SEED
from icarus.training.run_store import RunFolder, RunStore

type Number = float | int


class ComparedRun(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: str
    name: str
    revision: int
    state: RunState
    # The checkpoint whose recorded evaluation is compared; none before the first evaluation.
    checkpoint: int | None
    evaluation_seeds: list[int] | None


class ComparedRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # "success_rate", "episode_return", "reward:<term id>", "steps", "wall_seconds", "best_step" and so on.
    metric: str
    a: Number | None
    b: Number | None
    # b minus a, when both runs have the value.
    difference: Number | None


class RunComparison(BaseModel):
    """Two runs side by side, every number read from what the runs recorded."""

    model_config = ConfigDict(extra="forbid")

    a: ComparedRun
    b: ComparedRun
    same_seeds: bool
    seeds_note: str
    rows: list[ComparedRow]


def _evaluation(folder: RunFolder, best: int | None) -> MetricPoint | None:
    """The best checkpoint's evaluation, or the latest one when the run has not named a best yet."""
    evaluations = [point for point in folder.metrics() if point.kind == "eval"]
    chosen = next((point for point in evaluations if point.step == best), None)
    return chosen or (evaluations[-1] if evaluations else None)


def _seeds(folder: RunFolder, evaluation: MetricPoint | None) -> list[int] | None:
    if evaluation is None:
        return None
    episodes = folder.episodes(evaluation.step)
    if episodes is not None and episodes.episodes:
        return [record.seed for record in episodes.episodes]
    return [EVALUATION_SEED + k for k in range(folder.config().evaluation_episodes)]


def _wall_seconds(folder: RunFolder, evaluation: MetricPoint | None) -> float | None:
    status = folder.status()
    if status.finished_at is not None:
        return (status.finished_at - status.started_at).total_seconds()
    points = folder.metrics()
    return points[-1].elapsed if points else (evaluation.elapsed if evaluation else None)


def _row(metric: str, a: Number | None, b: Number | None) -> ComparedRow:
    return ComparedRow(metric=metric, a=a, b=b, difference=None if a is None or b is None else b - a)


def _seeds_note(a: ComparedRun, b: ComparedRun) -> str:
    missing = [run.name for run in (a, b) if run.evaluation_seeds is None]
    if missing:
        return f"{' and '.join(missing)} has no evaluation yet, so only steps and time compare."
    assert a.evaluation_seeds is not None and b.evaluation_seeds is not None
    if a.evaluation_seeds == b.evaluation_seeds:
        seeds = a.evaluation_seeds
        return f"Both were evaluated on the same {len(seeds)} seeds ({seeds[0]} to {seeds[-1]})."
    return "The runs were evaluated on different seeds, so part of a difference can come from the episodes."


def compare_runs(run_store: RunStore, run_a: str, run_b: str) -> RunComparison:
    """Success, failure, return, episode length and per-term rewards of each run's best evaluated checkpoint, with
    steps, wall time and the best checkpoint, as b minus a."""
    folders = (run_store.folder(run_a), run_store.folder(run_b))
    statuses = [folder.status() for folder in folders]
    evaluations = [_evaluation(folder, status.best_step) for folder, status in zip(folders, statuses, strict=True)]
    runs = [
        ComparedRun(
            run_id=status.run_id,
            name=status.name,
            revision=status.revision_number,
            state=status.state,
            checkpoint=evaluation.step if evaluation else None,
            evaluation_seeds=_seeds(folder, evaluation),
        )
        for folder, status, evaluation in zip(folders, statuses, evaluations, strict=True)
    ]
    first, second = evaluations
    rows = [
        _row(name, getattr(first, name) if first else None, getattr(second, name) if second else None)
        for name in ("success_rate", "failure_rate", "episode_return", "episode_length")
    ]
    terms: list[str] = list(
        dict.fromkeys([*(first.reward_terms if first else {}), *(second.reward_terms if second else {})])
    )
    rows += [
        _row(
            f"reward:{term}",
            first.reward_terms.get(term) if first else None,
            second.reward_terms.get(term) if second else None,
        )
        for term in terms
    ]
    rows.append(_row("steps", statuses[0].step, statuses[1].step))
    rows.append(_row("wall_seconds", _wall_seconds(folders[0], first), _wall_seconds(folders[1], second)))
    rows.append(_row("best_step", statuses[0].best_step, statuses[1].best_step))
    same = runs[0].evaluation_seeds is not None and runs[0].evaluation_seeds == runs[1].evaluation_seeds
    return RunComparison(a=runs[0], b=runs[1], same_seeds=same, seeds_note=_seeds_note(runs[0], runs[1]), rows=rows)
