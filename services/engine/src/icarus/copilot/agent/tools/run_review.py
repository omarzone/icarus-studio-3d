from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import Field

from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TurnScope
from icarus.copilot.agent.tools.inspect import INSPECT_OBJECT, READ_RUN, compact
from icarus.copilot.agent.tools.library import LIBRARY
from icarus.copilot.agent.tools.look import LOOK
from icarus.copilot.agent.tools.proposing import PROPOSE
from icarus.copilot.agent.tools.trying import TRY
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


class DiagnosisArgs(ToolArgs):
    summary: str = Field(min_length=1, max_length=400, description="One plain sentence a beginner understands.")
    observations: list[str] = Field(max_length=12, description="What the run's numbers and pictures show.")
    evidence: list[EvidenceDraft] = Field(max_length=16)
    hypothesis: str = Field(min_length=1, max_length=600, description="Why the brain behaves this way.")
    next_step: NextStep = Field(description="keep_training, stop_and_fix (after proposing a tried fix) or done.")


@dataclass
class CoachScope(TurnScope):
    """A coach turn: one run at one checkpoint, and the diagnosis the coach writes."""

    folder: RunFolder | None = None
    run_name: str = ""
    step: int = 0
    findings: DiagnosisArgs | None = None
    # Frames the coach may cite, by name, for each checkpoint it looked at.
    seen_frames: set[str] = field(default_factory=set)


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


def _texts(args: DiagnosisArgs) -> list[str]:
    texts = [args.summary, args.hypothesis, *args.observations]
    return texts + [text for item in args.evidence for text in (item.label, item.detail) if text]


def diagnosis(scope: TurnScope, args: DiagnosisArgs) -> Observation:
    coach = _coach(scope)
    unbacked = [
        number for text in _texts(args) for number in unsupported_numbers(text, scope.sources, scope.percent_sources)
    ]
    if unbacked:
        text = (
            f"These numbers are not in the run's data or the tool results: {', '.join(dict.fromkeys(unbacked))}. "
            "Cite only numbers from read_run, look_episode or the run brief, then call diagnosis again."
        )
        return Observation(text, ok=False, summary=step_said("diagnosis_unbacked", scope.language))
    unseen = [item.frame for item in args.evidence if item.frame and item.frame not in coach.seen_frames]
    if unseen:
        text = f"Cite only pictures you looked at with look_episode; not seen: {', '.join(unseen)}."
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

DIAGNOSIS = Tool(
    name="diagnosis",
    description=(
        "Record your diagnosis of the run before you answer: a summary, observations and evidence with the run's "
        "own numbers, your hypothesis and the next step. For stop_and_fix, try and propose the fix first."
    ),
    args=DiagnosisArgs,
    step="inspect",
    effect="write",
    run=diagnosis,
    per_turn=None,
    timeout_s=5,
)

COACH_TOOLS: dict[str, Tool[Any]] = {
    tool.name: tool for tool in (READ_RUN, LOOK_EPISODE, INSPECT_OBJECT, LIBRARY, LOOK, TRY, PROPOSE, DIAGNOSIS)
}
