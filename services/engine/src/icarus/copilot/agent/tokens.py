import json

CHARS_PER_TOKEN = 4
IMAGE_TOKENS = 1_500


def text_tokens(text: str) -> int:
    return len(text) // CHARS_PER_TOKEN + 1


def message_tokens(message: dict) -> int:
    content = message.get("content")
    total = 4
    if isinstance(content, str):
        total += text_tokens(content)
    elif isinstance(content, list):
        for part in content:
            if isinstance(part, dict) and part.get("type") == "image_url":
                total += IMAGE_TOKENS
            elif isinstance(part, dict):
                total += text_tokens(str(part.get("text", "")))
    for call in message.get("tool_calls") or []:
        total += text_tokens(json.dumps(call))
    return total


def estimate(messages: list[dict], tools: list[dict], measured: int | None = None, measured_messages: int = 0) -> int:
    """The prompt size: the last measured count plus an estimate of what was added since, or a pure estimate."""
    if measured is not None:
        return measured + sum(message_tokens(message) for message in messages[measured_messages:])
    return text_tokens(json.dumps(tools)) + sum(message_tokens(message) for message in messages)
