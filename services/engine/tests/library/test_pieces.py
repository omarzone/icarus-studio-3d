import pytest

from icarus.contracts.operations import CreateObject
from icarus.design.checks import design_report
from icarus.library.pieces import PIECES
from icarus.library.templates import template_operations
from icarus.projects.operations import apply_operations, empty_project


@pytest.mark.parametrize("piece", list(PIECES))
def test_every_piece_can_be_placed_in_an_empty_world(piece):
    world = apply_operations(empty_project("0123456789ab", "T"), template_operations("empty_world"))
    placed = apply_operations(world, [CreateObject(op="create_object", target="world", object=PIECES[piece].object)])
    report, _ = design_report(placed)
    assert report.ok, [check.detail for check in report.checks if check.status == "fail"]
