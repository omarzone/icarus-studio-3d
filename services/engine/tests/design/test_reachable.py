from icarus.contracts.operations import AddComponent, CreateObject, DeleteObject, ReparentObject, SetProperty
from icarus.contracts.properties import VectorValue
from icarus.design.checks import design_report
from icarus.library.components import default_component
from icarus.library.parts import Part, decoration, fixture
from icarus.library.templates import template_operations
from icarus.projects.operations import apply_operations, empty_project

# The bays of the lot beside the parking spot at x 12, as a real parking project placed its parked cars.
PARKED = {"parked_1": -6.0, "parked_2": -3.2, "parked_3": 3.2, "parked_4": 6.0}


def parking_lot():
    """The parking template with its spot as a world object, which Randomize can move, and four parked cars."""
    project = apply_operations(empty_project("0123456789ab", "T"), template_operations("parking_car"))
    spot = Part("goal", "Parking spot", None, {"transform": {"position": (12, 0, 0)}, "goal_zone": {"radius": 1.5}})
    cars = [
        fixture(object_id, f"Parked car {index}", None, (12, y, 0.7), "box", (4.5, 1.8, 1.4), "#7a8899")
        for index, (object_id, y) in enumerate(PARKED.items(), 1)
    ]
    created = [CreateObject(op="create_object", target="world", object=part.spec()) for part in (spot, *cars)]
    return apply_operations(project, [DeleteObject(op="delete_object", object="goal"), *created])


def randomized(project, object_id: str, reach: tuple[float, float, float]):
    operations = [
        AddComponent(op="add_component", object=object_id, component=default_component("randomize", "randomize")),
        SetProperty(
            op="set_property",
            object=object_id,
            component="randomize",
            property="position_range",
            value=VectorValue(type="vector", value=reach),
        ),
    ]
    return apply_operations(project, operations)


def moved(project, object_id: str, position: tuple[float, float, float]):
    operation = SetProperty(
        op="set_property",
        object=object_id,
        component="transform",
        property="position",
        value=VectorValue(type="vector", value=position),
    )
    return apply_operations(project, [operation])


def reachable_check(project):
    report, compiled = design_report(project)
    check = next(item for item in report.checks if item.id == "reachable")
    return report, compiled, check


def test_a_fixed_goal_in_the_free_bay_between_parked_cars_passes():
    report, _, check = reachable_check(parking_lot())
    assert report.ok
    assert check.status == "pass"


def test_a_goal_randomized_across_the_parked_cars_fails_with_the_share_and_a_range_that_stays_clear():
    project = randomized(parking_lot(), "goal", (0, 6.5, 0))
    report, compiled, check = reachable_check(project)
    assert not report.ok and compiled is None
    assert check.status == "fail"
    assert "Parked car" in check.detail
    assert "randomized positions" in check.detail
    assert "stays clear" in check.detail
    # Later physics checks do not run on a design the brain cannot win.
    assert next(item for item in report.checks if item.id == "settles").status == "skip"


def test_a_goal_randomized_inside_its_free_bay_passes():
    _, _, check = reachable_check(randomized(parking_lot(), "goal", (0.5, 0.3, 0)))
    assert check.status == "pass"
    assert "in every copy" in check.detail


def test_a_goal_placed_on_a_parked_car_fails_even_without_randomization():
    _, _, check = reachable_check(moved(parking_lot(), "goal", (12, 3.2, 0)))
    assert check.status == "fail"
    assert "Parked car 3" in check.detail


def test_a_goal_on_top_of_a_platform_is_reachable_by_climbing():
    platform = fixture("platform", "Platform", None, (12, 0, 0.25), "box", (4, 4, 0.5), "#777777")
    project = apply_operations(
        moved(parking_lot(), "goal", (12, 0, 0.5)),
        [CreateObject(op="create_object", target="world", object=platform.spec())],
    )
    assert reachable_check(project)[2].status == "pass"


def test_a_goal_that_moves_with_the_cars_flanking_it_passes():
    holder = decoration("row", "Bay row", None, (0, 0, 0), "box", (0.1, 0.1, 0.01), "#ffffff")
    project = apply_operations(parking_lot(), [CreateObject(op="create_object", target="world", object=holder.spec())])
    reparent = [ReparentObject(op="reparent_object", object=item, parent="row") for item in ("goal", *PARKED)]
    project = randomized(apply_operations(project, reparent), "row", (0, 6.5, 0))
    assert reachable_check(project)[2].status == "pass"


def test_a_randomized_obstacle_that_can_drift_onto_a_fixed_goal_fails():
    project = randomized(parking_lot(), "parked_3", (0, 2.5, 0))
    _, _, check = reachable_check(project)
    assert check.status == "fail"
    assert check.detail.startswith("Randomization moves Parked car 3 onto Parking spot")


def test_decoration_without_a_collider_over_the_goal_does_not_block_it():
    tree = decoration("tree", "Tree", None, (12, 0, 2), "cylinder", (2, 2, 4), "#4f7a3a", style="tree")
    project = apply_operations(parking_lot(), [CreateObject(op="create_object", target="world", object=tree.spec())])
    assert reachable_check(project)[2].status == "pass"


def test_a_body_that_starts_inside_a_wall_fails_by_the_wall_name():
    wall = fixture("wall", "Garage wall", None, (0, 0, 0.75), "box", (0.4, 4, 1.5), "#9ca3af", style="wall")
    project = apply_operations(parking_lot(), [CreateObject(op="create_object", target="world", object=wall.spec())])
    _, _, check = reachable_check(project)
    assert check.status == "fail"
    assert "starts inside Garage wall" in check.detail
