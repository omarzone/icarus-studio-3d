"""Changing ideas before they are built: one idea revised with the person's words, or two ideas mixed."""

import secrets
import time

from icarus.contracts.copilot import DesignIdea, IdeaSet
from icarus.contracts.operations import (
    AddBody,
    EditOperation,
    RemoveBody,
    RemoveRewardTerm,
    SetEpisode,
    SetRewardTerm,
    SetTaskFamily,
)
from icarus.contracts.project import Project
from icarus.contracts.specs import TaskSpec
from icarus.copilot.architect import (
    CREATE_OBJECT_EXAMPLE,
    FIX,
    IDEAS_BUDGET_SECONDS,
    PREVIEW_ID,
    SYSTEM,
    IdeaBook,
    IdeaDraft,
    NoValidIdeas,
    PlannedIdea,
    UnknownIdeas,
    compile_idea,
    fixed_idea,
    scratch_idea,
)
from icarus.copilot.client import ModelClient
from icarus.copilot.context import design_reference
from icarus.library.templates import UnknownTemplate, template_operations
from icarus.projects.operations import OperationError, apply_operations, empty_project

TWEAK = """Revise the idea "{title}" for the request "{prompt}" with the person's words: "{words}".
Keep what the person asked for and change only what their words ask for. The idea as it is now (JSON):
{idea}
Return the revised idea."""


class MixRefused(Exception):
    """Two ideas whose parts cannot make one design, with a sentence a person can read."""


def _found(book: IdeaBook, set_id: str, idea_id: str) -> tuple[IdeaSet, DesignIdea, PlannedIdea]:
    idea_set, planned = book.get(set_id)
    idea = next((item for item in idea_set.ideas if item.id == idea_id), None)
    plan = planned.get(idea_id)
    if idea is None or plan is None:
        raise UnknownIdeas(f"{set_id}/{idea_id}")
    return idea_set, idea, plan


def tweak_idea(client: ModelClient, book: IdeaBook, set_id: str, idea_id: str, words: str) -> IdeaSet:
    """The set with one idea revised by the copilot from the person's words, compiled and design-tested again; a
    revision that fails its tests gets one fix, and the idea stays as it was when that fails too."""
    idea_set, idea, plan = _found(book, set_id, idea_id)
    deadline = time.monotonic() + IDEAS_BUDGET_SECONDS
    system = SYSTEM.format(example=CREATE_OBJECT_EXAMPLE.model_dump_json(), reference=design_reference())
    asked = TWEAK.format(title=idea.title, prompt=idea_set.prompt, words=words, idea=plan.draft.model_dump_json())
    draft = client.ask("design_idea_tweak", IdeaDraft, system, asked, deadline=deadline).value
    revised: PlannedIdea | str | None = PlannedIdea(draft)
    if draft.from_scratch:
        revised = scratch_idea(client, f"{idea_set.prompt}. {words}", draft, deadline)
    result = compile_idea(revised, idea_id) if isinstance(revised, PlannedIdea) else revised or "It was not designed"
    if isinstance(result, str):
        fix = FIX.format(title=draft.title, prompt=f"{idea_set.prompt}. {words}", problem=result)
        fixed = fixed_idea(client, system, fix, deadline)
        if isinstance(fixed, PlannedIdea):
            revised, result = fixed, compile_idea(fixed, idea_id)
    if isinstance(result, str) or not isinstance(revised, PlannedIdea):
        message = "The changed idea did not pass the design tests, so it stays as it was. Try other words."
        raise NoValidIdeas(message, {idea.title: str(result)[:300]})
    return book.put(set_id, result.model_copy(update={"recommended": idea.recommended}), revised)


def _built(plan: PlannedIdea) -> Project:
    try:
        return apply_operations(
            empty_project(PREVIEW_ID, plan.draft.title), [*template_operations(plan.draft.template), *plan.operations()]
        )
    except (UnknownTemplate, OperationError) as error:
        raise MixRefused(f"“{plan.draft.title}” could not be rebuilt: {error}") from error


def _task_operations(old: TaskSpec, new: TaskSpec) -> list[EditOperation]:
    operations: list[EditOperation] = [
        RemoveRewardTerm(op="remove_reward_term", term=term.term) for term in old.rewards
    ]
    operations.append(SetTaskFamily(op="set_task_family", family=new.family))
    operations += [SetRewardTerm(op="set_reward_term", term=term) for term in new.rewards]
    operations.append(
        SetEpisode(
            op="set_episode",
            seconds=new.episode_seconds,
            end_on_fall=new.end_on_fall,
            end_on_success=new.end_on_success,
        )
    )
    return operations


def mix_ideas(book: IdeaBook, set_id: str, world_from: str, body_from: str) -> tuple[IdeaSet, DesignIdea]:
    """A new idea in the set: the world of one idea with the bodies of another, learning the body's task, or the
    world's when the body's cannot train there; compiled and design-tested like any idea."""
    if world_from == body_from:
        raise MixRefused("Pick two different ideas to mix")
    _, world_idea, world_plan = _found(book, set_id, world_from)
    _, body_idea, body_plan = _found(book, set_id, body_from)
    world, body = _built(world_plan), _built(body_plan)
    if world.agents or body.agents:
        raise MixRefused("Ideas with several agents cannot be mixed yet; build one and change it in the chat")
    swap: list[EditOperation] = [RemoveBody(op="remove_body", body=item.id) for item in world.bodies]
    swap += [AddBody(op="add_body", body=item) for item in body.bodies]
    idea_id = secrets.token_hex(4)
    problems: list[str] = []
    for task, learns in ((body.task, body_plan.draft.learns), (world.task, world_plan.draft.learns)):
        draft = IdeaDraft.model_construct(
            title=f"{world_idea.title} + {body_idea.title}"[:80],
            world=world_plan.draft.world,
            body=body_plan.draft.body,
            learns=learns,
            template=world_plan.draft.template,
            outline="",
            operations=[*world_plan.operations(), *swap, *_task_operations(world.task, task)],
        )
        plan = PlannedIdea(draft)
        result = compile_idea(plan, idea_id)
        if isinstance(result, DesignIdea):
            idea_set = book.put(set_id, result, plan)
            return idea_set, result
        problems.append(result)
    raise MixRefused(
        f"The body of “{body_idea.title}” does not work in the world of “{world_idea.title}”: {problems[0]}"
    )
