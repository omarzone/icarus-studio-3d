from icarus.contracts.operations import (
    AddComponent,
    CreateObject,
    EditOperation,
    RemoveRewardTerm,
    SetRewardTerm,
    SetTaskFamily,
)
from icarus.contracts.project import Project
from icarus.contracts.specs import RewardTermSpec
from icarus.design.compiler import compile_project
from icarus.design.course import course_report, posture_warning
from icarus.library.templates import Part, solid, template_operations
from icarus.projects.operations import apply_operations, empty_project


def _static(id: str, name: str, position: tuple[float, float, float], size: tuple[float, float, float]) -> Part:
    part = solid(id, name, None, position, "box", size, 1, "#9ca3af")
    part.components["physics_body"] = {"mode": "static"}
    return part


def race(hurdle_width: float, tilt: float | None) -> Project:
    """A straight lane 3.2 m wide with four low hurdles and a finish, run by the walker (0.3 m wide)."""
    parts = [
        _static("lane_left", "Left curb", (11, 1.7, 0.2), (22, 0.2, 0.4)),
        _static("lane_right", "Right curb", (11, -1.7, 0.2), (22, 0.2, 0.4)),
        *(_static(f"hurdle_{n}", f"Hurdle {n}", (1 + 4 * n, 0, 0.15), (0.3, hurdle_width, 0.3)) for n in range(1, 5)),
        Part("finish", "Finish", None, {"transform": {"position": (22, 0, 0)}, "goal_zone": {"radius": 1.0}}),
    ]
    operations: list[EditOperation] = [*template_operations("walker_robot")]
    operations += [CreateObject(op="create_object", target="world", object=part.spec()) for part in parts]
    if tilt is not None:
        ray = (
            Part("torso", "Torso", None, {"distance_ray": {"range": 10, "count": 3, "tilt": tilt}}).spec().components[0]
        )
        operations.append(AddComponent(op="add_component", object="torso", component=ray))
    return apply_operations(empty_project("0123456789ab", "Race"), operations)


def test_hurdles_that_leave_room_to_walk_around_them_are_warned_and_full_width_ones_are_not():
    narrow = race(1.4, None)
    warnings = course_report(narrow, compile_project(narrow)).warnings
    assert any("Hurdle 1" in text and "walk around" in text for text in warnings)
    wide = race(3.2, None)
    assert not any("walk around" in text for text in course_report(wide, compile_project(wide)).warnings)


def test_rays_level_with_the_torso_miss_low_hurdles_and_tilted_rays_see_the_first_one():
    level = race(3.2, 0)
    report = course_report(level, compile_project(level))
    assert report.seen == [] and any("No distance ray sees an obstacle" in text for text in report.warnings)
    tilted = race(3.2, -9)
    report = course_report(tilted, compile_project(tilted))
    assert report.seen == ["hurdle_1"] and not any("distance ray" in text for text in report.warnings)


def test_a_body_without_rays_is_told_it_cannot_see_the_obstacles():
    blind = race(3.2, None)
    assert any("no distance ray" in text for text in course_report(blind, compile_project(blind)).warnings)


def test_a_legged_body_losing_its_upright_and_fall_terms_is_warned():
    before = race(3.2, None)
    navigation: list[EditOperation] = [SetTaskFamily(op="set_task_family", family="navigation")]
    navigation += [RemoveRewardTerm(op="remove_reward_term", term=term) for term in ("stay_upright", "fall_penalty")]
    navigation.append(SetRewardTerm(op="set_reward_term", term=RewardTermSpec(term="reach_goal", weight=10)))
    after = apply_operations(before, navigation)
    warning = posture_warning(before, after)
    assert warning is not None and "stay_upright" in warning and "fall_penalty" in warning
    assert "navigation" in warning and "only locomotion" not in warning
    assert posture_warning(before, before) is None
