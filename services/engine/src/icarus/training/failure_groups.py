from collections import Counter
from dataclasses import dataclass
from statistics import mean
from typing import Literal

from icarus.training.episodes import CheckpointEpisodes, EpisodeRecord, walked

type EndingKind = Literal[
    "reached_goal",
    "fell_early",
    "fell_late",
    "touched_obstacle",
    "timed_out_near",
    "timed_out_far",
    "walked",
    "stayed_in_place",
]

# A fall in the first third of an episode is early.
EARLY_SHARE = 1 / 3
# Time ran out "close to the goal" when the body covered at least this share of its starting distance.
NEAR_SHARE = 0.7
MAX_FRAMES = 6


@dataclass(frozen=True)
class EndingGroup:
    """Evaluation episodes that ended the same way, from the run's own data."""

    kind: EndingKind
    label: str
    share: float
    description: str
    episodes: list[int]
    # Pictures of recorded episodes in the group: the telling moment first, then the start.
    frames: list[str]


def ending(record: EpisodeRecord, episodes: CheckpointEpisodes) -> EndingKind:
    if record.success:
        return "reached_goal"
    if record.fell:
        return "fell_early" if record.seconds < EARLY_SHARE * episodes.episode_seconds else "fell_late"
    if record.touched is not None:
        return "touched_obstacle"
    if not episodes.has_goal:
        return "walked" if walked(record) else "stayed_in_place"
    start, end = record.start_distance or 0.0, record.end_distance or 0.0
    return "timed_out_near" if start > 0 and end <= (1 - NEAR_SHARE) * start else "timed_out_far"


def _seconds(records: list[EpisodeRecord]) -> str:
    return f"{mean(record.seconds for record in records):.1f} s"


def _describe(kind: EndingKind, records: list[EpisodeRecord], total: int) -> tuple[str, str]:
    counted = f"{len(records)} of {total} episodes"
    match kind:
        case "reached_goal":
            return "Reached the goal", f"{counted} reached the goal, after {_seconds(records)} on average."
        case "fell_early":
            return "Fell early", f"{counted} fell over early, after {_seconds(records)} on average."
        case "fell_late":
            return "Fell later on", f"{counted} fell over later on, after {_seconds(records)} on average."
        case "touched_obstacle":
            name = Counter(record.touched for record in records).most_common(1)[0][0]
            at = mean(record.touched_at or 0.0 for record in records)
            return f"Touched {name}", f"{counted} touched {name} or another object, first at {at:.1f} s on average."
        case "timed_out_near" | "timed_out_far":
            gap = mean(record.end_distance or 0.0 for record in records)
            where = "close to" if kind == "timed_out_near" else "far from"
            label = f"Time ran out {where} the goal"
            return label, f"{counted} ran out of time {gap:.1f} m from the goal on average."
        case "walked":
            ahead = mean(record.forward for record in records)
            return "Walked forward", f"{counted} stayed up and moved {ahead:.1f} m forward on average."
        case "stayed_in_place":
            ahead = mean(record.forward for record in records)
            return "Stayed up but barely moved", f"{counted} stayed up but moved {ahead:.1f} m forward on average."


def ending_label(record: EpisodeRecord, episodes: CheckpointEpisodes) -> str:
    """How one episode ended, in the words its failure group would use."""
    return _describe(ending(record, episodes), [record], 1)[0]


def _telling(record: EpisodeRecord) -> list[str]:
    moment = next((name for name in reversed(record.frames) if name.endswith(("-failure.png", "-end.png"))), None)
    start = next((name for name in record.frames if name.endswith("-start.png")), None)
    return [name for name in (moment, start) if name]


def failure_groups(episodes: CheckpointEpisodes) -> list[EndingGroup]:
    """Episodes grouped by how they ended, the largest group first."""
    grouped: dict[EndingKind, list[EpisodeRecord]] = {}
    for record in episodes.episodes:
        grouped.setdefault(ending(record, episodes), []).append(record)
    total = len(episodes.episodes)
    groups = []
    for kind, records in grouped.items():
        label, description = _describe(kind, records, total)
        frames = [name for record in records for name in _telling(record)][:MAX_FRAMES]
        groups.append(
            EndingGroup(kind, label, len(records) / total, description, [record.index for record in records], frames)
        )
    return sorted(groups, key=lambda group: -group.share)
