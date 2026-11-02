from icarus.training.episodes import CheckpointEpisodes, EpisodeRecord
from icarus.training.failure_groups import failure_groups


def record(index: int, **fields) -> EpisodeRecord:
    values = {
        "index": index,
        "seed": 10_000 + index,
        "success": False,
        "fell": False,
        "seconds": 30.0,
        "episode_return": 0.0,
        "start_distance": 10.0,
        "end_distance": 9.0,
        "forward": 0.0,
    }
    return EpisodeRecord.model_validate(values | fields)


def parking(*records: EpisodeRecord) -> CheckpointEpisodes:
    return CheckpointEpisodes(step=25_000, has_goal=True, episode_seconds=30.0, episodes=list(records))


def test_navigation_episodes_are_grouped_by_how_they_end_with_their_share():
    episodes = parking(
        record(0, success=True, seconds=12.0, end_distance=0.2, frames=["e0-start.png", "e0-end.png"]),
        record(1, fell=True, seconds=0.6, frames=["e1-start.png", "e1-failure.png"]),
        record(2, touched="Wall", touched_at=4.0, end_distance=6.0),
        record(3, end_distance=1.5),
        record(4, end_distance=9.5),
        record(5, end_distance=8.0),
        record(6, fell=True, seconds=20.0),
        record(7, end_distance=9.9),
    )

    groups = {group.kind: group for group in failure_groups(episodes)}

    assert set(groups) == {
        "reached_goal",
        "fell_early",
        "fell_late",
        "touched_obstacle",
        "timed_out_near",
        "timed_out_far",
    }
    assert groups["timed_out_far"].share == 3 / 8 and groups["timed_out_far"].episodes == [4, 5, 7]
    assert groups["touched_obstacle"].label == "Touched Wall"
    assert groups["fell_early"].frames == ["e1-failure.png", "e1-start.png"]
    assert groups["reached_goal"].frames == ["e0-end.png", "e0-start.png"]
    assert sum(group.share for group in groups.values()) == 1
    assert list(groups)[0] == "timed_out_far"


def test_a_walker_that_stays_up_and_moves_forward_counts_as_walking():
    episodes = CheckpointEpisodes(
        step=0,
        has_goal=False,
        episode_seconds=30.0,
        episodes=[
            record(0, start_distance=None, end_distance=None, forward=4.0),
            record(1, start_distance=None, end_distance=None, forward=0.5),
            record(2, start_distance=None, end_distance=None, fell=True, seconds=2.0, forward=0.2),
        ],
    )

    groups = {group.kind: group for group in failure_groups(episodes)}

    assert set(groups) == {"walked", "stayed_in_place", "fell_early"}
    assert all(abs(group.share - 1 / 3) < 1e-9 for group in groups.values())


def test_group_descriptions_cite_numbers_from_the_episodes():
    episodes = parking(record(0, fell=True, seconds=0.5), record(1, fell=True, seconds=1.5))

    (group,) = failure_groups(episodes)

    assert group.kind == "fell_early" and group.share == 1
    assert "2 of 2" in group.description and "1.0 s" in group.description
