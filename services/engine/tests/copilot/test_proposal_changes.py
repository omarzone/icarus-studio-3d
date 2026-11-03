from icarus.contracts.operations import PpoPatch, SetBrain
from icarus.copilot.proposal_changes import proposal_changes
from tests.sim.conftest import project_from


def test_a_brain_change_shows_what_it_had_before():
    parking = project_from("parking_car")
    brain = parking.brain
    (change,) = proposal_changes(parking, [SetBrain(op="set_brain", copies=brain.copies + 1, seed=brain.seed + 7)])
    assert change.label == "Brain"
    assert change.before == f"{brain.copies} copies, seed {brain.seed}"
    assert change.after == f"{brain.copies + 1} copies, seed {brain.seed + 7}"


def test_a_change_to_how_the_brain_practices_names_only_what_changes():
    parking = project_from("parking_car")
    smaller = SetBrain(op="set_brain", layers=[64, 64], training_steps=500_000, ppo=PpoPatch(learning_rate=1e-3))
    (change,) = proposal_changes(parking, [smaller])
    assert change.before == "recommended steps, layers 256 x 256, learning rate 0.0003"
    assert change.after == "500,000 steps, layers 64 x 64, learning rate 0.001"
    (same,) = proposal_changes(parking, [SetBrain(op="set_brain", algorithm="ppo")])
    assert same.after == "Unchanged"
