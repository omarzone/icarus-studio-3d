from icarus.contracts.library import LibraryCatalog, RewardTermInfo
from icarus.library import LIBRARY_VERSION
from icarus.library.components import COMPONENTS
from icarus.library.pieces import PIECES
from icarus.library.rewards import REWARD_TERMS, term_families
from icarus.library.templates import TEMPLATES


def _with_families(info: RewardTermInfo) -> RewardTermInfo:
    return info.model_copy(update={"families": sorted(term_families(info.term))})


def library_catalog() -> LibraryCatalog:
    return LibraryCatalog(
        version=LIBRARY_VERSION,
        components=list(COMPONENTS.values()),
        reward_terms=[_with_families(info) for info in REWARD_TERMS.values()],
        templates=list(TEMPLATES.values()),
        pieces=list(PIECES.values()),
    )
