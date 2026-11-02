# Messages the engine adds inside a turn start with these, so they are never mistaken for the person's words.
ENGINE_NOTE = "[Engine note] "
PICTURES_NOTE = "[Pictures from your look calls] "


def is_engine_text(text: str) -> bool:
    return text.startswith((ENGINE_NOTE, PICTURES_NOTE))
