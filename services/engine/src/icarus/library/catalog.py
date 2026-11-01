from icarus.contracts.library import LibraryCatalog
from icarus.library import LIBRARY_VERSION
from icarus.library.components import COMPONENTS
from icarus.library.rewards import REWARD_TERMS
from icarus.library.templates import TEMPLATES


def library_catalog() -> LibraryCatalog:
    return LibraryCatalog(
        version=LIBRARY_VERSION,
        components=list(COMPONENTS.values()),
        reward_terms=list(REWARD_TERMS.values()),
        templates=list(TEMPLATES.values()),
    )
