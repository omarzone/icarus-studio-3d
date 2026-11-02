"""The coach's short structured look at a checkpoint: one model call over the episode pictures and the run's facts."""

import base64
import json
from collections.abc import Callable
from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict, Field

from icarus.copilot.behavior_judgment import GaitFinding, behavior_guide
from icarus.copilot.client import ModelClient, capability_client, copilot_client
from icarus.copilot.film_strips import SHEET_LAYOUT as STRIP_LAYOUT
from icarus.copilot.film_strips import FilmStrips, PublishedStrip
from icarus.copilot.grounding import unsupported_numbers, without_unbacked
from icarus.copilot.language import Language
from icarus.copilot.settings import ModelSettingsStore
from icarus.training.failure_groups import failure_groups
from icarus.training.progress_watch import CheckpointResult, Trend
from icarus.training.run_health import HealthFact
from icarus.training.run_store import RunFolder

# Pictures sent per look: the 2x2 sheets of the first recorded episodes.
SHEETS_LOOKED = 2
LANGUAGE_NAMES: dict[Language, str] = {"en": "English", "es": "Spanish"}

EARLY_CHECK_PROMPT = """You are the training coach of a 3D robotics studio. A brain is training with reinforcement
learning in MuJoCo. Look at this checkpoint early and decide, from the pictures and the facts only, whether the design
itself keeps the brain from learning the task. At step 0 the brain is untrained and acts at random: do not judge its
skill, judge the design (an object in the way or one it collides with although it is decoration, a goal out of reach,
a reward that pays for something other than the task, episodes that end before anything can be learned).
{pictures} The camera follows the body and zones are drawn over the scene.
{behavior}
Report each behavior you see in gait, with the area to change and what to change; when the body already moves the
way the task needs, report moves_well. An untrained brain moves at random: then report only what the design forces
(a body that cannot stand up, legs too weak to lift it, a part that drags by its shape). After the first
checkpoints a gait that will not do the task (crawling, hopping, dragging a leg) is a problem too: more steps
reinforce it.
Set problem to true only when the design must change before more training can help, and name the blocker. Write
every text in {language}, plainly, for a beginner. Cite only numbers that appear in the facts."""
SHEETS_TEXT = """Each picture is a 2x2 sheet of one episode in time order: top left start, top right middle,
bottom row the failure moment (when there is one) and the end."""
STRIP_TEXT = """The first picture is {layout}; the facts give its frame times. The next one is a 2x2 sheet of an
episode: start, middle, failure moment and end."""


class EarlyCheck(BaseModel):
    """What the coach saw at a checkpoint, in a fixed shape so the engine can act on it."""

    model_config = ConfigDict(extra="forbid")

    moves: bool = Field(description="Whether the body moves in the pictures and the numbers.")
    ends_early: bool = Field(description="Whether episodes end well before their time runs out.")
    why_it_ends: str = Field(default="", max_length=300, description="Why episodes end, from the facts and pictures.")
    blocker: str = Field(
        default="",
        max_length=300,
        description="What in the design keeps the brain from the task; empty when nothing does.",
    )
    reward_makes_sense: bool = Field(description="False when terms pay the brain for something other than the task.")
    reward_note: str = Field(default="", max_length=300)
    problem: bool = Field(description="True only when the design must change before more training can help.")
    summary: str = Field(min_length=1, max_length=500, description="Two short sentences for the person.")
    gait: list[GaitFinding] = Field(default=[], max_length=5, description="How the body moves, behavior by behavior.")


@dataclass(frozen=True)
class LookResult:
    check: EarlyCheck
    # Pictures the model was sent, by frame name; empty when no vision model is connected.
    looked_at: list[str]
    facts_text: str
    # The film strip it watched, when the episode states were kept and rendered.
    strip: PublishedStrip | None = None


def look_facts(
    folder: RunFolder, step: int, facts: list[HealthFact], results: list[CheckpointResult], trend: Trend
) -> dict:
    """The run's facts for the look, every number read from its files."""
    episodes = folder.episodes(step)
    evaluation = next((p for p in folder.metrics() if p.kind == "eval" and p.step == step), None)
    status = folder.status()
    return {
        "run": status.name,
        "step": step,
        "untrained": step == 0 and folder.config().warm_start is None,
        "total_steps": status.total_steps,
        "evaluations": [
            {"step": r.step, "success": r.success, "episode_return": round(r.episode_return, 2)} for r in results
        ],
        "reward_terms": {k: round(v, 2) for k, v in (evaluation.reward_terms if evaluation else {}).items()},
        "episode_endings": [
            {"ending": group.label, "share": group.share, "description": group.description}
            for group in (failure_groups(episodes) if episodes else [])
        ],
        "health": [fact.text for fact in facts],
        "trend": trend.reason,
    }


ClientChoice = Callable[[], tuple[ModelClient, bool]]


def default_client(settings: ModelSettingsStore) -> ClientChoice:
    """The vision model with pictures when one is connected, else the reasoning model on the facts alone."""

    def choose() -> tuple[ModelClient, bool]:
        vision = capability_client(settings, "vision")
        return (vision, True) if vision else (copilot_client(settings), False)

    return choose


def _picture(png: bytes) -> dict[str, object]:
    return {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64.b64encode(png).decode()}"}}


def _texts(check: EarlyCheck) -> list[str]:
    texts = [check.summary, check.why_it_ends, check.blocker, check.reward_note]
    return texts + [text for item in check.gait for text in (item.seen, item.change)]


class EarlyLook:
    def __init__(self, choose: ClientChoice, strips: FilmStrips | None = None) -> None:
        self._choose = choose
        self._strips = strips

    def look(self, folder: RunFolder, step: int, facts: dict, language: Language) -> LookResult:
        client, sees = self._choose()
        strip = self._strips.strip(folder, step) if sees and self._strips else None
        if strip is not None:
            facts = facts | {"film_strip": strip.facts()}
        text = json.dumps(facts, ensure_ascii=False, separators=(",", ":"))
        sheets = self._sheets(folder, step) if sees else []
        if strip is not None:
            sheets = sheets[:1]
        content: list[dict[str, object]] = [{"type": "text", "text": f"Early check of step {step:,}. Facts: {text}"}]
        if strip is not None:
            content.append(_picture(strip.sheet))
        content += [_picture(folder.frame_path(step, name).read_bytes()) for name in sheets]
        sources = [text]

        def grounded(check: EarlyCheck) -> list[str]:
            unbacked = [number for item in _texts(check) for number in unsupported_numbers(item, sources, sources)]
            return [f"These numbers are not in the facts: {', '.join(unbacked)}"] if unbacked else []

        pictures = STRIP_TEXT.format(layout=STRIP_LAYOUT) if strip is not None else SHEETS_TEXT
        system = EARLY_CHECK_PROMPT.format(
            language=LANGUAGE_NAMES[language], pictures=pictures, behavior=behavior_guide()
        )
        reply = client.ask("early_check", EarlyCheck, system, content, check=grounded)
        check = reply.value
        if reply.problems:
            gait = [
                item.model_copy(
                    update={
                        name: without_unbacked(getattr(item, name), sources, sources) for name in ("seen", "change")
                    }
                )
                for item in check.gait
            ]
            check = check.model_copy(
                update={
                    name: without_unbacked(getattr(check, name), sources, sources)
                    for name in ("summary", "why_it_ends", "blocker", "reward_note")
                }
                | {"gait": [item for item in gait if item.seen]}
            )
        return LookResult(check, sheets, text, strip)

    def _sheets(self, folder: RunFolder, step: int) -> list[str]:
        episodes = folder.episodes(step)
        names = [record.sheet for record in (episodes.episodes if episodes else []) if record.sheet]
        return [name for name in names[:SHEETS_LOOKED] if folder.frame_path(step, name).is_file()]
