import re

from icarus.contracts.copilot import AgentStep
from icarus.copilot.agent.tools.base import TurnScope
from icarus.copilot.agent.tools.proposing import ApplyArgs, apply
from icarus.copilot.chat_training import TrainingRequest
from icarus.copilot.language import asks_to_fix, asks_to_train, plain_words
from icarus.training.run_store import TERMINAL_STATES

MAX_OPTIONS = 4
OPTION_CHARS = 90
APPLIES_PER_TURN = 2
_NUMBERED = re.compile(r"^\s*\d+[.)]\s+(.+)$")
_BULLET = re.compile(r"^\s*[-*•]\s+(.+)$")
_BOLD = re.compile(r"^\*\*(.+?)\*\*")
# "**Opción A (recomendada):** text", "### Option 2: text", "- Opción B. text": the name, then the option itself.
_NAMED = re.compile(
    r"^\s*(?:#{1,4}\s+|[-*•]\s+)?(?:\*\*)?(?P<name>(?:Opci[oó]n|Option)\s+(?:[A-Z]|\d))\)?"
    r"[^:*.\n]*?(?:\*\*)?\s*[:.\-–—]\s*(?:\*\*)?(?P<rest>.*)$"
)
LABEL_CHARS = 60
OPTION_MESSAGE_CHARS = 400
# A sentence asking the person to press Apply, which is wrong once the engine applied the change itself.
_PRESS_APPLY = re.compile(r"[^.!?\n]*\b(?:Apply|Aplicar)\b[^.!?\n]*[.!?]?\s*")


def _label(item: str) -> str:
    bold = _BOLD.match(item.strip())
    text = bold.group(1) if bold else re.split(r"\s+[-–—(]|:\s", item.strip(), maxsplit=1)[0]
    return text.strip(" *_:.").strip()


def _short(text: str) -> str:
    """A button label: the option's first clause, cut at a word to fit the button."""
    clause = re.split(r"\s+[(–—]|\s-\s", text.strip(), maxsplit=1)[0].strip(" *_:.")
    if len(clause) <= LABEL_CHARS:
        return clause
    return clause[: clause.rfind(" ", 0, LABEL_CHARS + 1)].rstrip(" ,;:")


def named_options(answer: str) -> list[tuple[str, str]]:
    """Choices written as "**Opción A:** ..." or "Option 1: ..." lines, or as option headings."""
    found: list[tuple[str, str]] = []
    for line in answer.split("\n"):
        match = _NAMED.match(line)
        rest = match.group("rest").strip(" *") if match else ""
        if match and rest:
            found.append((_short(rest), f"{match.group('name')}: {rest}"[:OPTION_MESSAGE_CHARS]))
    return found[:MAX_OPTIONS] if len(found) >= 2 else []


def listed_options(answer: str) -> list[tuple[str, str]]:
    """The choices an answer offers, each as its button label and the message it sends: a short numbered list
    after a question or a colon, a short bulleted list right after a question, or named options."""
    return _plain_list(answer) or named_options(answer)


def _plain_list(answer: str) -> list[tuple[str, str]]:
    lines = answer.split("\n")
    for index, line in enumerate(lines):
        numbered = _NUMBERED.match(line)
        if not (numbered or _BULLET.match(line)):
            continue
        before = next((item.strip(" *") for item in reversed(lines[:index]) if item.strip()), "")
        pattern = _NUMBERED if numbered else _BULLET
        if not (before.endswith("?") or (numbered and before.endswith(":"))):
            return []
        items: list[str] = []
        for following in lines[index:]:
            found = pattern.match(following)
            if not found:
                break
            items.append(found.group(1))
        if 2 <= len(items) <= MAX_OPTIONS and all(len(item) <= OPTION_CHARS for item in items):
            return [(label[:LABEL_CHARS], label) for item in items if (label := _label(item))]
        return []
    return []


def _training(scope: TurnScope) -> bool:
    runs = scope.services.runs.list_runs(scope.project_id)
    return any(status.state not in TERMINAL_STATES for status in runs)


def finish_autopilot(scope: TurnScope, request: str) -> None:
    """In autopilot the engine does what the turn prepared: it applies the open proposal (within the turn's limit)
    and starts training when the person asked to fix or train and nothing is training yet."""
    proposal, try_id = scope.proposal, scope.proposal_try
    head = scope.services.projects.state(scope.project_id).revision.number
    # A proposal the project moved past while the model answered stays visible as outdated instead.
    current = proposal is not None and proposal.base_revision == head
    if proposal is not None and try_id is not None and current and len(scope.applied) < APPLIES_PER_TURN:
        result = apply(scope, ApplyArgs(try_id=try_id, summary=proposal.summary))
        scope.steps.append(AgentStep(tool="propose", summary=result.summary[:200], ok=result.ok))
        if result.ok:
            scope.reports.append(scope.side_effects[-1])
    wants = asks_to_train(request) or (asks_to_fix(request) and bool(scope.applied))
    trained = any(step.tool == "train" and step.ok for step in scope.steps)
    if not wants or trained or scope.state.project.task.family == "none" or _training(scope):
        return
    reply = scope.services.trainer.act(scope.project_id, TrainingRequest(action="start"), scope.language)
    scope.reports.append(reply.text)
    if reply.acted:
        scope.side_effects.append(reply.text)
    scope.steps.append(AgentStep(tool="train", summary=reply.text[:200], ok=reply.acted))


def polished(scope: TurnScope, text: str) -> str:
    """The answer as the person reads it: codes in plain words, and no request to press Apply once it was applied."""
    if scope.applied and scope.proposal is None:
        text = _PRESS_APPLY.sub("", text).strip() or text
    return plain_words(text, scope.language)
