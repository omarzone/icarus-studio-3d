import re
from collections.abc import Iterable
from dataclasses import dataclass

# A number standing on its own, not part of an identifier such as "run-20261101T120000Z" or "v2". Thousands may be
# grouped with commas ("100,000") or dots ("100.000"), decimals may use a dot or a comma ("0.35", "0,35"), and a
# k or M suffix rounds to thousands or millions ("100k", "2M").
_NUMBER = re.compile(
    r"(?<![\w.])(?<!\w-)"
    r"(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+[.,]\d+|\d+)"
    r"([kM])?(%?)(?!\w)(?!-\w)"
)
_SCALE = {"": 1, "k": 1_000, "M": 1_000_000}
# Whole numbers below this are counts and ordinals ("3 changes", "Run 2") that need no source.
SMALL_WHOLE = 10
SIGNIFICANT = (2, 3)
UNSUPPORTED_ANSWER = "I could not back that answer with data from this project, so I will not guess at the numbers."
_LIST_MARK = re.compile(r"^(\s*(?:[-*•]|\d+[.)])\s+)?(.*)$")
_SENTENCE_END = re.compile(r"(?<=[.!?…])\s+")


@dataclass(frozen=True)
class _Reading:
    value: float
    decimals: int


@dataclass(frozen=True)
class _Cited:
    text: str
    readings: tuple[_Reading, ...]
    percent: bool
    separated: bool


def _decimal(whole: str, fraction: str) -> _Reading:
    return _Reading(float(f"{whole}.{fraction}"), len(fraction))


def _readings(token: str) -> list[_Reading]:
    """Every value a written number can mean: "1.000" is a thousand in Spanish and one in English."""
    if "." in token and "," in token:
        point = max(token.rfind("."), token.rfind(","))
        whole = re.sub(r"[.,]", "", token[:point])
        return [_decimal(whole, token[point + 1 :])]
    for separator in (".", ","):
        if separator in token:
            groups = token.split(separator)
            readings = []
            if all(len(group) == 3 for group in groups[1:]):
                readings.append(_Reading(float("".join(groups)), 0))
            if len(groups) == 2:
                readings.append(_decimal(groups[0], groups[1]))
            return readings
    return [_Reading(float(token), 0)]


def _numbers(text: str) -> list[_Cited]:
    cited: list[_Cited] = []
    for match in _NUMBER.finditer(text):
        token, suffix, percent = match.group(1), match.group(2) or "", match.group(3)
        scale = _SCALE[suffix]
        readings = tuple(_Reading(item.value * scale, item.decimals if scale == 1 else 0) for item in _readings(token))
        cited.append(_Cited(match.group(0), readings, bool(percent), "." in token or "," in token))
    return cited


def _matches(reading: _Reading, fact: float) -> bool:
    size, value = abs(fact), reading.value
    if abs(size - value) <= 0.5 * 10**-reading.decimals + 1e-9:
        return True
    # Answers round to 2 or 3 significant figures ("123,456 steps" becomes "123,000" or "120,000").
    return any(abs(float(f"{size:.{digits}g}") - value) <= 1e-9 * max(1.0, value) for digits in SIGNIFICANT)


def _supported(cited: _Cited, facts: list[float]) -> bool:
    for reading in cited.readings:
        if any(_matches(reading, fact) for fact in facts):
            return True
        share = _Reading(reading.value / 100, reading.decimals + 2)
        if cited.percent and any(_matches(share, fact) for fact in facts):
            return True
    return False


def _needs_source(cited: _Cited) -> bool:
    return cited.separated or any(reading.value >= SMALL_WHOLE for reading in cited.readings)


def _facts(sources: Iterable[str]) -> list[float]:
    facts: list[float] = []
    for source in sources:
        for cited in _numbers(source):
            facts += [reading.value for reading in cited.readings]
            # JSON lists such as [-35,35] read as one number with a decimal comma; their items count too.
            if "," in cited.text:
                facts += [float(part) for part in re.findall(r"\d+(?:\.\d+)?", cited.text.replace(",", " "))]
    return facts


def unsupported_numbers(answer: str, sources: Iterable[str], percent_sources: Iterable[str] | None = None) -> list[str]:
    """Numbers in an answer, with a decimal point or of 10 or more, that appear in none of the sources.

    With percent_sources, a percentage is backed only by them (run results, the person's words), never by the
    library ranges and values in the other sources.
    """
    sources = list(sources)
    facts = _facts(sources)
    percent_facts = facts if percent_sources is None else _facts(percent_sources)
    return [
        cited.text
        for cited in _numbers(answer)
        if _needs_source(cited) and not _supported(cited, percent_facts if cited.percent else facts)
    ]


def without_unbacked(answer: str, sources: Iterable[str], percent_sources: Iterable[str] | None = None) -> str:
    """The answer without the sentences that cite unbacked numbers; everything else stays as written."""
    sources = list(sources)
    percents = None if percent_sources is None else list(percent_sources)
    kept: list[str] = []
    for line in answer.split("\n"):
        found = _LIST_MARK.match(line)
        mark, body = (found.group(1) or "", found.group(2)) if found else ("", line)
        sentences = _SENTENCE_END.split(body)
        backed = [sentence for sentence in sentences if not unsupported_numbers(sentence, sources, percents)]
        if len(backed) == len(sentences):
            kept.append(line)
        elif backed:
            kept.append(mark + " ".join(backed))
    return re.sub(r"\n{3,}", "\n\n", "\n".join(kept)).strip()
