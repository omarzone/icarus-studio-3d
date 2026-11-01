from icarus.library.rewards import REWARD_TERMS


def test_every_term_has_a_default_weight_inside_its_range():
    for term in REWARD_TERMS.values():
        assert term.weight_min <= term.default_weight <= term.weight_max, term.term
        assert term.family in {"navigation", "locomotion"}
        assert term.description
