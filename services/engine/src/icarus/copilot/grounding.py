import re
from collections.abc import Iterable
from dataclasses import dataclass

# A number standing on its own: not part of an identifier such as "run-20261101T120000Z" or "v2".
_NUMBER = re.compile(r"(?<![\w.])(?<!\w-)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(%?)(?!\w)(?!-\w)")
# Whole numbers below this are counts and ordinals ("3 changes", "Run 2") that need no source.
SMALL_WHOLE = 10
SIGNIFICANT = (2, 3)
UNSUPPORTED_ANSWER = "I could not back that answer with data from this project, so I will not guess at the numbers."


@dataclass(frozen=True)
class _Cited:
    text: str
    value: float
    decimals: int
    percent: bool


def _numbers(text: str) -> list[_Cited]:
    cited: list[_Cited] = []
    for match in _NUMBER.finditer(text):
        whole, fraction, percent = match.group(1), match.group(2) or "", match.group(3)
        value = float(f"{whole.replace(',', '')}{fraction}")
        cited.append(_Cited(match.group(0), value, max(len(fraction) - 1, 0), bool(percent)))
    return cited


def _matches(value: float, decimals: int, fact: float) -> bool:
    size = abs(fact)
    if abs(size - value) <= 0.5 * 10**-decimals + 1e-9:
        return True
    # Answers round to 2 or 3 significant figures ("123,456 steps" becomes "123,000" or "120,000").
    return any(abs(float(f"{size:.{digits}g}") - value) <= 1e-9 * max(1.0, value) for digits in SIGNIFICANT)


def _supported(cited: _Cited, facts: list[float]) -> bool:
    if any(_matches(cited.value, cited.decimals, fact) for fact in facts):
        return True
    return cited.percent and any(_matches(cited.value / 100, cited.decimals + 2, fact) for fact in facts)


def _needs_source(cited: _Cited) -> bool:
    return cited.decimals > 0 or "." in cited.text or cited.value >= SMALL_WHOLE


def _facts(sources: Iterable[str]) -> list[float]:
    return [cited.value for source in sources for cited in _numbers(source)]


def unsupported_numbers(answer: str, sources: Iterable[str], percent_sources: Iterable[str] | None = None) -> list[str]:
    """Numbers in an answer, with a decimal point or of 10 or more, that appear in none of the sources.

    With percent_sources, a percentage is backed only by them (run results, the person's words), never by the
    library ranges and values in the other sources.
    """
    facts = _facts(sources)
    percent_facts = facts if percent_sources is None else _facts(percent_sources)
    return [
        cited.text
        for cited in _numbers(answer)
        if _needs_source(cited) and not _supported(cited, percent_facts if cited.percent else facts)
    ]
