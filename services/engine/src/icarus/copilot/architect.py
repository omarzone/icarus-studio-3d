import secrets
import threading
import time
from concurrent.futures import ThreadPoolExecutor, wait

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.copilot import DesignIdea, IdeaSet
from icarus.contracts.operations import EditOperation
from icarus.contracts.specs import TaskFamily
from icarus.copilot.client import CopilotError, ModelClient
from icarus.copilot.context import design_reference
from icarus.design.checks import design_report
from icarus.design.scene import scene_description
from icarus.library.templates import TEMPLATES, UnknownTemplate, template_operations
from icarus.projects.operations import OperationError, apply_operations, empty_project

# Steps per second measured for PPO on CPU with 16 copies (ADR 001).
STEPS_PER_SECOND = 2000
DEFAULT_STEPS: dict[TaskFamily, int] = {"navigation": 1_000_000, "locomotion": 2_000_000, "none": 0}
PREVIEW_ID = "000000000000"
IDEAS_BUDGET_SECONDS = 150.0

SYSTEM = """You are the architect of Icarus Studio 3D, where people design a world and a body and train a brain with
reinforcement learning on MuJoCo. Turn the person's request into exactly three different design ideas.
Each idea starts from one library template and customizes it with edit operations: rename, recolor, resize, set
property values inside their ranges, and add obstacles copied from library pieces with new unique ids.
Only use object ids that exist in the chosen template or that your own operations create, only library component
kinds and properties, and only values inside their ranges. Keep each idea small enough to train on a CPU.
Library reference (JSON):
{reference}"""

FIX = """The idea "{title}" for the request "{prompt}" failed its design tests:
{problem}
Return the corrected idea."""


class _Output(BaseModel):
    model_config = ConfigDict(extra="forbid")


class IdeaDraft(_Output):
    title: str = Field(min_length=1, max_length=80)
    world: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=300)
    learns: str = Field(min_length=1, max_length=300)
    template: str
    operations: list[EditOperation] = Field(max_length=100)


class IdeaDrafts(_Output):
    ideas: list[IdeaDraft] = Field(min_length=1, max_length=3)


class NoValidIdeas(CopilotError):
    pass


def estimate_minutes(family: TaskFamily) -> float:
    return DEFAULT_STEPS[family] / STEPS_PER_SECOND / 60


def _compile(draft: IdeaDraft, idea_id: str, recommended: bool) -> DesignIdea | str:
    """A compiled idea whose preview is a real scene, or why it failed its design tests."""
    try:
        base = template_operations(draft.template)
        project = apply_operations(empty_project(PREVIEW_ID, draft.title), [*base, *draft.operations])
    except UnknownTemplate:
        return f"There is no template {draft.template!r}; use one of {', '.join(TEMPLATES)}"
    except OperationError as error:
        return str(error)
    report, compiled = design_report(project)
    if not report.ok or compiled is None:
        return "; ".join(f"{check.label}: {check.detail}" for check in report.checks if check.status == "fail")
    family = project.task.family
    return DesignIdea(
        id=idea_id,
        title=draft.title,
        world=draft.world,
        body=draft.body,
        learns=draft.learns,
        template=draft.template,
        family=family,
        estimate_minutes=estimate_minutes(family),
        recommended=recommended,
        scene=scene_description(compiled, 1),
    )


def _fixed(client: ModelClient, system: str, fix: str, deadline: float) -> IdeaDraft | None:
    try:
        return client.ask("design_idea_fix", IdeaDraft, system, fix, deadline=deadline).value
    except CopilotError:
        return None


def propose_ideas(client: ModelClient, prompt: str) -> tuple[IdeaSet, dict[str, IdeaDraft]]:
    """Up to three ideas that compile and pass the design tests; a failing idea is retried once, then dropped.

    Fix-ups run at the same time and the whole request stops waiting once its time budget is spent.
    """
    deadline = time.monotonic() + IDEAS_BUDGET_SECONDS
    system = SYSTEM.format(reference=design_reference())
    drafts = list(client.ask("design_ideas", IdeaDrafts, system, prompt, deadline=deadline).value.ideas)
    ids = [secrets.token_hex(4) for _ in drafts]
    results = [_compile(draft, idea_id, recommended=False) for draft, idea_id in zip(drafts, ids, strict=True)]
    failing = {index: result for index, result in enumerate(results) if isinstance(result, str)}
    if failing:
        pool = ThreadPoolExecutor(max_workers=len(failing))
        futures = {
            index: pool.submit(
                _fixed, client, system, FIX.format(title=drafts[index].title, prompt=prompt, problem=problem), deadline
            )
            for index, problem in failing.items()
        }
        done, _ = wait(futures.values(), timeout=max(deadline - time.monotonic(), 0))
        pool.shutdown(wait=False, cancel_futures=True)
        for index, future in futures.items():
            fixed = future.result() if future in done else None
            if fixed is not None:
                drafts[index] = fixed
                results[index] = _compile(fixed, ids[index], recommended=False)
    valid = [(result, draft) for result, draft in zip(results, drafts, strict=True) if isinstance(result, DesignIdea)]
    if not valid:
        raise NoValidIdeas("None of the copilot's ideas passed the design tests. Try describing it another way.")
    ideas = [idea.model_copy(update={"recommended": index == 0}) for index, (idea, _) in enumerate(valid)]
    return IdeaSet(id=secrets.token_hex(6), prompt=prompt, ideas=ideas), {
        idea.id: draft for idea, (_, draft) in zip(ideas, valid, strict=True)
    }


class IdeaBook:
    """Idea sets of this engine session, kept until a build uses them."""

    def __init__(self) -> None:
        self._sets: dict[str, tuple[IdeaSet, dict[str, IdeaDraft]]] = {}
        self._lock = threading.Lock()

    def add(self, idea_set: IdeaSet, drafts: dict[str, IdeaDraft]) -> None:
        with self._lock:
            self._sets[idea_set.id] = (idea_set, drafts)

    def get(self, idea_set_id: str) -> tuple[IdeaSet, dict[str, IdeaDraft]]:
        with self._lock:
            found = self._sets.get(idea_set_id)
        if found is None:
            raise UnknownIdeas(idea_set_id)
        return found


class UnknownIdeas(LookupError):
    pass
