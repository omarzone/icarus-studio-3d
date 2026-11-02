from icarus.library.catalog import library_catalog
from icarus.library.rewards import term_families


def test_catalog_reward_terms_list_every_family_they_fit():
    for info in library_catalog().reward_terms:
        assert info.family in info.families, info.term
        assert set(info.families) == term_families(info.term), info.term


def test_posture_terms_offer_both_families_in_a_stable_order():
    terms = {info.term: info for info in library_catalog().reward_terms}
    assert terms["stay_upright"].families == ["locomotion", "navigation"]
    assert terms["forward_progress"].families == ["locomotion"]
