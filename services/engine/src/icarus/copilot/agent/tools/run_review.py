from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import Field

from icarus.contracts.coach import DesignArea, FilmStrip
from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TurnScope
from icarus.copilot.agent.tools.inspect import INSPECT_OBJECT, READ_RUN, compact
from icarus.copilot.agent.tools.library import LIBRARY
from icarus.copilot.agent.tools.look import LOOK
from icarus.copilot.agent.tools.proposing import PROPOSE
from icarus.copilot.agent.tools.trying import TRY
from icarus.copilot.film_strips import SHEET_LAYOUT as STRIP_LAYOUT
from icarus.copilot.film_strips import FilmStrips
from icarus.copilot.grounding import unsupported_numbers
from icarus.copilot.step_words import step_said
from icarus.training.episodes import CheckpointEpisodes, EpisodeRecord
from icarus.training.evaluation import PICTURED_EPISODES
from icarus.training.failure_groups import ending
from icarus.training.run_store import RunFolder

type NextStep = Literal["keep_training", "stop_and_fix", "done"]

SHEET_LAYOUT = "a 2x2 sheet in time order: top left start, top right middle, bottom row the failure moment and the end"


class EvidenceDraft(ToolArgs):
    kind: Literal["metric", "reward_term", "episode", "frame"]
    label: str = Field(min_length=1, max_length=200, description="What it shows, in words, with run numbers.")
    detail: str | None = Field(default=None, max_length=500)
    frame: str | None = Field(default=None, description="For a frame: a picture name from look_episode.")


class FindingDraft(ToolArgs):
    area: DesignArea = Field(description="The design part to change: reward, sensors, body, world or brain.")
    behavior: str = Field(
        min_length=1, max_length=160, description="How the body moves, as seen in the strip ('crawls on its knees')."
    )
    change: str = Field(min_length=1, max_length=300, description="What to change in that area, in plain words.")
    try_id: str | None = Field(default=None, description="A try that passed and fixes this finding, when you made one.")


class DiagnosisArgs(ToolArgs):
    summary: str = Field(min_length=1, max_length=400, description="One plain sentence a beginner understands.")
    observations: list[str] = Field(max_length=12, description="What the run's numbers and pictures show.")
    evidence: list[EvidenceDraft] = Field(max_length=16)
    hypothesis: str = Field(min_length=1, max_length=600, description="Why the brain behaves this way.")
    next_step: NextStep = Field(description="keep_training, stop_and_fix (after proposing a tried fix) or done.")
    findings: list[FindingDraft] = Field(
        default=[], max_length=8, description="How the body moves and the design area each behavior points to."
    )


@dataclass
class CoachScope(TurnScope):
    """A coach turn: one run at one checkpoint, and the diagnosis the coach writes."""

    folder: RunFolder | None = None
    run_name: str = ""
    step: int = 0
    findings: DiagnosisArgs | None = None
    # Frames the coach may cite, by name, for each checkpoint it looked at.
    seen_frames: set[str] = field(default_factory=set)
    # Film strips the coach watched, in order; the message shows the last one of the diagnosed step.
    strips: list[FilmStrip] = field(default_factory=list)


class LookEpisodeArgs(ToolArgs):
    episode: int = Field(default=0, ge=0, lt=PICTURED_EPISODES, description="Which recorded evaluation episode.")
    step: int | None = Field(default=None, ge=0, description="A checkpoint step; none means the one diagnosed.")


def _coach(scope: TurnScope) -> CoachScope:
    if not isinstance(scope, CoachScope) or scope.folder is None:
        raise TypeError("this tool only runs in a coach turn")
    return scope


def _episode_facts(record: EpisodeRecord, episodes: CheckpointEpisodes) -> dict[str, Any]:
    facts = record.model_dump(exclude={"frames", "sheet", "index"}, exclude_none=True)
    return {"episode": record.index, "ending": ending(record, episodes), **facts, "frames": record.frames}


def look_episode(scope: TurnScope, args: LookEpisodeArgs) -> Observation:
    coach = _coach(scope)
    assert coach.folder is not None
    step = coach.step if args.step is None else args.step
    episodes = coach.folder.episodes(step)
    record = episodes.episodes[args.episode] if episodes and args.episode < len(episodes.episodes) else None
    if episodes is None or record is None:
        steps = [point.step for point in coach.folder.metrics() if point.kind == "eval"]
        text = f"No episode {args.episode} was recorded at step {step}. Checkpoints: {steps}"
        return Observation(text, ok=False, summary=step_said("episode_missing", scope.language))
    facts = _episode_facts(record, episodes)
    summary = step_said("episode_seen", scope.language, episode=args.episode + 1, step=f"{step:,}")
    coach.seen_frames.update(record.frames)
    if record.sheet is None:
        text = f"{compact(facts)}\nNo pictures were rendered for this checkpoint; judge from the numbers."
        return Observation(text, summary=summary, run_facts=True)
    image = coach.folder.frame_path(step, record.sheet).read_bytes()
    text = f"{compact(facts)}\nThe picture is {SHEET_LAYOUT}; the camera follows the body, zones are drawn over it."
    label = f"episode {args.episode + 1} of step {step:,}, {SHEET_LAYOUT}"
    return Observation(text, image=image, image_label=label, summary=summary, run_facts=True)


class FilmStripArgs(ToolArgs):
    step: int | None = Field(default=None, ge=0, description="A checkpoint step; none means the one diagnosed.")
    episode: int | None = Field(
        default=None, ge=0, lt=PICTURED_EPISODES, description="A recorded episode; none picks the typical one."
    )


class CompareStripsArgs(ToolArgs):
    first: int = Field(ge=0, description="The earlier checkpoint step.")
    second: int | None = Field(default=None, ge=0, description="The later checkpoint step; none means the diagnosed.")


def _strips(scope: TurnScope) -> FilmStrips:
    return FilmStrips(scope.services.views, scope.services.attachments)


def film_strip(scope: TurnScope, args: FilmStripArgs) -> Observation:
    coach = _coach(scope)
    assert coach.folder is not None
    step = coach.step if args.step is None else args.step
    published = _strips(scope).strip(coach.folder, step, args.episode)
    if published is None:
        text = (
            f"No film strip can be made of step {step}: its episode states were not kept or nothing renders here. "
            "Use look_episode for its 2x2 sheet."
        )
        return Observation(text, ok=False, summary=step_said("strip_missing", scope.language))
    coach.strips.append(published.strip)
    episode = published.strip.episode
    text = f"{compact(published.facts())}\nThe picture is {STRIP_LAYOUT}; the camera follows the body."
    label = f"episode {episode + 1} of step {step:,}, {STRIP_LAYOUT}"
    summary = step_said("strip_seen", scope.language, episode=episode + 1, step=f"{step:,}")
    return Observation(text, image=published.sheet, image_label=label, summary=summary, run_facts=True)


def compare_strips(scope: TurnScope, args: CompareStripsArgs) -> Observation:
    coach = _coach(scope)
    assert coach.folder is not None
    second = coach.step if args.second is None else args.second
    image = _strips(scope).compared((coach.folder, args.first), (coach.folder, second))
    if image is None:
        text = f"Steps {args.first} and {second} cannot both be shown as film strips; use look_episode for each."
        return Observation(text, ok=False, summary=step_said("strip_missing", scope.language))
    layout = f"two film strips, step {args.first:,} on top and step {second:,} below; each is {STRIP_LAYOUT}"
    text = f"The picture is {layout}. Say what changed in how the body moves."
    summary = step_said("strips_compared", scope.language, first=f"{args.first:,}", second=f"{second:,}")
    return Observation(text, image=image, image_label=layout, summary=summary, run_facts=True)


def _texts(args: DiagnosisArgs) -> list[str]:
    texts = [args.summary, args.hypothesis, *args.observations]
    texts += [text for item in args.findings for text in (item.behavior, item.change)]
    return texts + [text for item in args.evidence for text in (item.label, item.detail) if text]


def diagnosis(scope: TurnScope, args: DiagnosisArgs) -> Observation:
    coach = _coach(scope)
    unbacked = [
        number for text in _texts(args) for number in unsupported_numbers(text, scope.sources, scope.percent_sources)
    ]
    if unbacked:
        text = (
            f"These numbers are not in the run's data or the tool results: {', '.join(dict.fromkeys(unbacked))}. "
            "Cite only numbers from read_run, look_episode, film_strip or the run brief, then call diagnosis again."
        )
        return Observation(text, ok=False, summary=step_said("diagnosis_unbacked", scope.language))
    unseen = [item.frame for item in args.evidence if item.frame and item.frame not in coach.seen_frames]
    if unseen:
        text = f"Cite only pictures you looked at with look_episode; not seen: {', '.join(unseen)}."
        return Observation(text, ok=False, summary=step_said("diagnosis_unbacked", scope.language))
    untried = [
        item.try_id
        for item in args.findings
        if item.try_id and (item.try_id not in scope.tries or not scope.tries[item.try_id].passed)
    ]
    if untried:
        text = f"A finding may only cite a try that passed; these did not or do not exist: {', '.join(untried)}."
        return Observation(text, ok=False, summary=step_said("diagnosis_unbacked", scope.language))
    coach.findings = args
    text = "Diagnosis recorded. Now answer with a short summary for the person in their language."
    if args.next_step == "stop_and_fix" and scope.proposal is None:
        text += " No fix is proposed yet: try one and propose it before you answer, if you can."
    return Observation(text, summary=step_said("diagnosed", scope.language))


LOOK_EPISODE = Tool(
    name="look_episode",
    description=(
        "See one recorded evaluation episode of a checkpoint: how it ended with its numbers, and a picture of its "
        "start, middle, failure moment and end from a camera that follows the body. Use it before you explain "
        "behavior."
    ),
    args=LookEpisodeArgs,
    step="look",
    effect="read",
    run=look_episode,
    per_turn=None,
    timeout_s=10,
)

FILM_STRIP = Tool(
    name="film_strip",
    description=(
        "Watch one recorded evaluation episode frame by frame: about 20 pictures at a fixed interval plus the "
        "failure moment, from a camera that follows the body, with their times. Use it to judge how the body "
        "moves (gait, posture, which parts touch the ground), not only whether it reached the goal."
    ),
    args=FilmStripArgs,
    step="look",
    effect="read",
    run=film_strip,
    per_turn=4,
    timeout_s=90,
)

COMPARE_STRIPS = Tool(
    name="compare_strips",
    description=(
        "See the film strips of two checkpoints one above the other, to tell whether the way the body moves "
        "got better or worse between them."
    ),
    args=CompareStripsArgs,
    step="look",
    effect="read",
    run=compare_strips,
    per_turn=2,
    timeout_s=120,
)

DIAGNOSIS = Tool(
    name="diagnosis",
    description=(
        "Record your diagnosis of the run before you answer: a summary, observations and evidence with the run's "
        "own numbers, your hypothesis, the next step and findings: each behavior you saw with the design area to "
        "change and the try that fixes it. For stop_and_fix, try and propose the fix first."
    ),
    args=DiagnosisArgs,
    step="inspect",
    effect="write",
    run=diagnosis,
    per_turn=None,
    timeout_s=5,
)

COACH_TOOLS: dict[str, Tool[Any]] = {
    tool.name: tool
    for tool in (
        READ_RUN,
        LOOK_EPISODE,
        FILM_STRIP,
        COMPARE_STRIPS,
        INSPECT_OBJECT,
        LIBRARY,
        LOOK,
        TRY,
        PROPOSE,
        DIAGNOSIS,
    )
}
