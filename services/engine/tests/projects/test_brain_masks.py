import pytest

from icarus.contracts.operations import RemoveComponent, SetBrain, SetEpisode
from icarus.contracts.specs import BrainStart
from icarus.library.templates import template_operations
from icarus.projects.operations import OperationError, apply_operations, empty_project

MOTORS = [
    f"{part}/motor" for part in ("thigh_left", "shin_left", "foot_left", "thigh_right", "shin_right", "foot_right")
]


def walker():
    return apply_operations(empty_project("0123456789ab", "Walker"), template_operations("walker_robot"))


def test_senses_and_motors_turn_off_and_back_on_as_whole_lists():
    project = apply_operations(
        walker(), [SetBrain(op="set_brain", muted_senses=["foot_left/touch"], muted_motors=["foot_left/motor"])]
    )
    assert project.brain.muted_senses == ["foot_left/touch"]
    assert project.brain.muted_motors == ["foot_left/motor"]
    back = apply_operations(project, [SetBrain(op="set_brain", muted_senses=[])])
    assert back.brain.muted_senses == [] and back.brain.muted_motors == ["foot_left/motor"]


@pytest.mark.parametrize(
    ("senses", "motors", "problem"),
    [
        (["foot_left/nope"], [], "no sensor"),
        (["thigh_left/motor"], [], "no sensor"),
        ([], ["torso/balance"], "no motor"),
        ([], MOTORS, "at least one motor"),
    ],
)
def test_only_real_senses_and_motors_turn_off_and_one_motor_stays(senses, motors, problem):
    with pytest.raises(OperationError, match=problem):
        apply_operations(walker(), [SetBrain(op="set_brain", muted_senses=senses, muted_motors=motors)])


def test_a_car_turns_off_one_of_its_senses():
    car = apply_operations(empty_project("0123456789ab", "Car"), template_operations("parking_car"))
    muted = apply_operations(car, [SetBrain(op="set_brain", muted_senses=["car/distance_ray"])])
    assert muted.brain.muted_senses == ["car/distance_ray"]


def test_removing_a_muted_sensor_forgets_it_instead_of_failing():
    project = apply_operations(walker(), [SetBrain(op="set_brain", muted_senses=["foot_left/touch"])])
    removed = apply_operations(project, [RemoveComponent(op="remove_component", object="foot_left", component="touch")])
    assert removed.brain.muted_senses == []


def test_episode_rules_and_the_brain_it_starts_from_are_set_by_operations():
    project = apply_operations(
        walker(),
        [
            SetEpisode(op="set_episode", seconds=12, end_on_fall=False),
            SetBrain(op="set_brain", decisions_per_second=10, start_from=BrainStart(run_id="run-1", step=5_000)),
        ],
    )
    assert (project.task.episode_seconds, project.task.end_on_fall, project.task.end_on_success) == (12, False, True)
    assert project.brain.decisions_per_second == 10
    assert project.brain.start_from == BrainStart(run_id="run-1", step=5_000)
    assert apply_operations(project, [SetBrain(op="set_brain", start_from="none")]).brain.start_from is None
