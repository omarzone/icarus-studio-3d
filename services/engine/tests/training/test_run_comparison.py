from datetime import timedelta

from icarus.contracts.training import MetricPoint, StartRun
from icarus.training.episodes import CheckpointEpisodes, EpisodeRecord
from icarus.training.run_comparison import compare_runs
from icarus.training.run_store import RunFolder, RunStore
from tests.training.conftest import state_of


def evaluation(step: int, success: float, episode_return: float, terms: dict[str, float]) -> MetricPoint:
    return MetricPoint(
        kind="eval",
        step=step,
        elapsed=step / 1000,
        episode_return=episode_return,
        episode_length=400 + step / 1000,
        success_rate=success,
        failure_rate=1 - success,
        reward_terms=terms,
    )


def ended_run(store: RunStore, points: list[MetricPoint], best: int, seconds: float, episodes: int = 20) -> RunFolder:
    status = store.create(
        state_of("parking_car"), StartRun(total_steps=100_000, copies=2), threads=1, evaluation_episodes=episodes
    )
    folder = store.folder(status.run_id)
    for point in points:
        folder.append_metric(point)
    finished = status.started_at + timedelta(seconds=seconds)
    folder.write_status(
        status.model_copy(update={"state": "done", "step": 100_000, "best_step": best, "finished_at": finished})
    )
    return folder


def recorded(folder: RunFolder, step: int, seeds: list[int]) -> None:
    records = [
        EpisodeRecord(index=k, seed=seed, success=True, fell=False, seconds=4.0, episode_return=1.0, forward=0.0)
        for k, seed in enumerate(seeds)
    ]
    folder.write_episodes(CheckpointEpisodes(step=step, has_goal=True, episode_seconds=20.0, episodes=records))


def rows(comparison) -> dict[str, tuple[float | None, float | None, float | None]]:
    return {row.metric: (row.a, row.b, row.difference) for row in comparison.rows}


def test_runs_are_compared_at_their_best_checkpoints_with_differences(tmp_path):
    store = RunStore(tmp_path)
    first = ended_run(
        store,
        [
            evaluation(0, 0.0, -1.0, {"reach_goal": 0.0}),
            evaluation(50_000, 0.25, 2.0, {"reach_goal": 1.0, "collision": -0.5}),
        ],
        best=50_000,
        seconds=120,
    )
    second = ended_run(
        store,
        [evaluation(50_000, 0.5, 3.0, {"reach_goal": 2.0}), evaluation(100_000, 0.4, 2.5, {"reach_goal": 1.5})],
        best=50_000,
        seconds=90,
    )
    comparison = compare_runs(store, first.run_id, second.run_id)
    table = rows(comparison)
    assert table["success_rate"] == (0.25, 0.5, 0.25)
    assert table["failure_rate"] == (0.75, 0.5, -0.25)
    assert table["episode_return"] == (2.0, 3.0, 1.0)
    assert table["episode_length"] == (450.0, 450.0, 0.0)
    assert table["reward:reach_goal"] == (1.0, 2.0, 1.0)
    assert table["reward:collision"] == (-0.5, None, None)
    assert table["steps"] == (100_000, 100_000, 0)
    assert table["wall_seconds"] == (120.0, 90.0, -30.0)
    assert table["best_step"] == (50_000, 50_000, 0)
    assert (comparison.a.name, comparison.b.name) == ("Run 1", "Run 2")


def test_the_same_evaluation_seeds_are_said_when_both_runs_recorded_them(tmp_path):
    store = RunStore(tmp_path)
    first = ended_run(store, [evaluation(10_000, 0.5, 1.0, {})], best=10_000, seconds=10, episodes=3)
    second = ended_run(store, [evaluation(10_000, 0.5, 1.0, {})], best=10_000, seconds=10, episodes=3)
    recorded(first, 10_000, [10_000, 10_001, 10_002])
    recorded(second, 10_000, [10_000, 10_001, 10_002])
    comparison = compare_runs(store, first.run_id, second.run_id)
    assert comparison.same_seeds is True
    assert comparison.a.evaluation_seeds == [10_000, 10_001, 10_002]
    assert "same" in comparison.seeds_note


def test_different_evaluation_seeds_are_said_plainly(tmp_path):
    store = RunStore(tmp_path)
    first = ended_run(store, [evaluation(10_000, 0.5, 1.0, {})], best=10_000, seconds=10, episodes=3)
    second = ended_run(store, [evaluation(10_000, 0.5, 1.0, {})], best=10_000, seconds=10, episodes=5)
    comparison = compare_runs(store, first.run_id, second.run_id)
    assert comparison.same_seeds is False
    assert "different" in comparison.seeds_note
    assert comparison.b.evaluation_seeds == [10_000, 10_001, 10_002, 10_003, 10_004]


def test_a_run_without_an_evaluation_is_said_and_has_no_numbers(tmp_path):
    store = RunStore(tmp_path)
    first = ended_run(store, [evaluation(10_000, 0.5, 1.0, {"reach_goal": 1.0})], best=10_000, seconds=10)
    status = store.create(state_of("parking_car"), StartRun(total_steps=100_000, copies=2), threads=1)
    comparison = compare_runs(store, first.run_id, status.run_id)
    table = rows(comparison)
    assert table["success_rate"] == (0.5, None, None)
    assert comparison.same_seeds is False
    assert comparison.b.evaluation_seeds is None
    assert "Run 2" in comparison.seeds_note and "no evaluation" in comparison.seeds_note
