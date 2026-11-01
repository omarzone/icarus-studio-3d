from icarus.contracts.operations import SetBrain
from icarus.copilot.proposal_changes import proposal_changes
from tests.sim.conftest import project_from


def test_a_brain_change_shows_what_it_had_before():
    parking = project_from("parking_car")
    brain = parking.brain
    (change,) = proposal_changes(parking, [SetBrain(op="set_brain", copies=brain.copies + 1, seed=brain.seed + 7)])
    assert change.label == "Brain"
    assert change.before == f"{brain.copies} copies, seed {brain.seed}"
    assert change.after == f"{brain.copies + 1} copies, seed {brain.seed + 7}"
