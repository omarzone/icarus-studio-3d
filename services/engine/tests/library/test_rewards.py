from icarus.library.rewards import REWARD_TERMS, TERM_SETTINGS, term_families, term_fits


def test_every_term_has_a_default_weight_inside_its_range():
    for term in REWARD_TERMS.values():
        assert term.weight_min <= term.default_weight <= term.weight_max, term.term
        assert term.family in {"navigation", "locomotion"}
        assert term.description


def test_posture_and_effort_terms_also_fit_navigation_but_progress_terms_keep_their_family():
    assert all(term_fits(term, "navigation") for term in ("stay_upright", "fall_penalty", "energy_cost"))
    assert all(term_fits(term, "locomotion") for term in ("stay_upright", "fall_penalty", "energy_cost"))
    assert not term_fits("forward_progress", "navigation")
    assert not term_fits("progress_to_goal", "locomotion")


def test_new_task_terms_fit_the_family_they_serve():
    assert term_families("object_to_goal") == {"navigation"}
    assert term_families("coverage") == {"navigation"}
    assert term_families("height_gain") == {"locomotion"}


def test_only_terms_that_read_settings_declare_them():
    assert [schema.id for schema in TERM_SETTINGS["object_to_goal"]] == ["object"]
    assert [schema.id for schema in TERM_SETTINGS["coverage"]] == ["cell_size"]
    assert [schema.id for schema in TERM_SETTINGS["body_height"]] == ["height"]


def test_gait_terms_are_locomotion_and_all_but_walking_straight_also_fit_legged_navigation():
    gait = ("body_height", "smooth_actions", "feet_air_time", "heading_and_drift", "joint_limits")
    assert all(REWARD_TERMS[term].family == "locomotion" for term in gait)
    assert term_families("heading_and_drift") == {"locomotion"}
    assert all(term_fits(term, "navigation") for term in gait if term != "heading_and_drift")
    assert REWARD_TERMS["feet_air_time"].default_weight > 0 > REWARD_TERMS["smooth_actions"].default_weight
    assert set(TERM_SETTINGS) <= set(REWARD_TERMS)
