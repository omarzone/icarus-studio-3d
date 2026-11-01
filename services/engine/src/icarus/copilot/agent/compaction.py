from icarus.copilot.agent.notes import PICTURES_NOTE

PICTURE_DROPPED = "(picture dropped to save room; look again if you need it)"
SAME_RESULT = "(same result as above)"
DETAILS_DROPPED = "(details dropped; call the tool again if needed)"
# Tool results of this many latest model steps stay whole when older ones are shortened.
RECENT_STEPS = 2
HEAD_SHARE = 0.7


def truncate(text: str, limit: int, hint: str) -> str:
    """The head and tail of a long result, with a marker that says how to get the rest."""
    if len(text) <= limit:
        return text
    head = int(limit * HEAD_SHARE)
    tail = limit - head
    left_out = len(text) - head - tail
    return f"{text[:head]}\n[… {left_out:,} characters left out. {hint}]\n{text[-tail:]}"


def fit_step(texts: list[str], limit: int) -> list[str]:
    """One step's results within a total size, shortening the largest first."""
    shortened = list(texts)
    while sum(len(text) for text in shortened) > limit:
        largest = max(range(len(shortened)), key=lambda index: len(shortened[index]))
        if len(shortened[largest]) <= 500:
            break
        size = max(500, len(shortened[largest]) // 2)
        shortened[largest] = truncate(shortened[largest], size, "Ask again more narrowly for the rest.")
    return shortened


def is_bridge(message: dict) -> bool:
    content = message.get("content")
    if message.get("role") != "user" or not isinstance(content, list) or not content:
        return False
    first = content[0]
    return isinstance(first, dict) and str(first.get("text", "")).startswith(PICTURES_NOTE)


def _without_pictures(message: dict, note: str) -> None:
    text = str(message["content"][0].get("text", ""))
    message["content"] = f"{text} {note}"


def retire_pictures(transcript: list[dict], keep: int) -> None:
    """Only the newest `keep` pictures stay; older bridges keep their text line, as Hermes retires images."""
    seen = 0
    for message in reversed(transcript):
        if not is_bridge(message):
            continue
        pictures = sum(1 for part in message["content"] if part.get("type") == "image_url")
        if seen + pictures > keep:
            _without_pictures(message, PICTURE_DROPPED)
        seen += pictures


def strip_pictures(transcript: list[dict]) -> bool:
    """Every picture replaced by its text line; whether there was any to strip."""
    bridges = [message for message in transcript if is_bridge(message)]
    for message in bridges:
        _without_pictures(message, "(the model cannot read pictures; rely on the facts in the tool results)")
    return bool(bridges)


def prune_observations(transcript: list[dict], summaries: dict[str, str], aggressive: bool = False) -> None:
    """Shrink tool results without a model call: repeats, old pictures, then old results down to their step line."""
    seen: set[str] = set()
    for message in transcript:
        if message.get("role") != "tool":
            continue
        content = str(message.get("content", ""))
        if content in seen and len(content) > len(SAME_RESULT):
            message["content"] = SAME_RESULT
        seen.add(content)
    retire_pictures(transcript, 0 if aggressive else 2)
    steps = [index for index, message in enumerate(transcript) if message.get("role") == "assistant"]
    recent = 0 if aggressive else RECENT_STEPS
    cut = steps[-recent] if recent and len(steps) >= recent else (len(transcript) if aggressive else 0)
    for message in transcript[:cut]:
        if message.get("role") == "tool" and message.get("content") not in (SAME_RESULT,):
            line = summaries.get(str(message.get("tool_call_id")), "")
            if not str(message.get("content", "")).endswith(DETAILS_DROPPED):
                message["content"] = f"{line} {DETAILS_DROPPED}".strip()
