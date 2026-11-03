import mujoco
import numpy as np
import pytest

from icarus.contracts.operations import CreateObject, SetProperty
from icarus.contracts.properties import ListValue, PropertyValue, SliderValue
from icarus.contracts.scene import GEOM_STYLES
from icarus.design.checks import design_report
from icarus.design.compiler import compile_project
from icarus.design.scene import scene_description
from icarus.library.components import COMPONENTS
from icarus.library.look_properties import training_content
from icarus.library.pieces import PIECES
from icarus.library.templates import template_operations
from icarus.projects.operations import apply_operations, empty_project

STILL_SECONDS = 1.5
# A dynamic piece that settles may sink into its contacts by a few millimetres, never more.
DRIFT = 0.02


def _placed(piece: str):
    world = apply_operations(empty_project("0123456789ab", "T"), template_operations("empty_world"))
    return apply_operations(world, [CreateObject(op="create_object", target="world", object=PIECES[piece].object)])


@pytest.mark.parametrize("piece", list(PIECES))
def test_every_piece_can_be_placed_in_an_empty_world(piece):
    report, _ = design_report(_placed(piece))
    assert report.ok, [check.detail for check in report.checks if check.status == "fail"]


@pytest.mark.parametrize("piece", list(PIECES))
def test_every_piece_stands_still_where_it_was_placed(piece):
    model = compile_project(_placed(piece)).model
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    start = data.xpos.copy()
    for _ in range(int(STILL_SECONDS / model.opt.timestep)):
        mujoco.mj_step(model, data)
    assert np.abs(data.xpos - start).max() < DRIFT


def _numbers(value: PropertyValue) -> list[float]:
    raw = getattr(value, "value", None)
    items = raw if isinstance(raw, tuple) else (raw,)
    return [float(item) for item in items if isinstance(item, int | float) and not isinstance(item, bool)]


@pytest.mark.parametrize("piece", list(PIECES))
def test_every_piece_stays_inside_its_ranges_and_draws_with_a_known_style(piece):
    info = PIECES[piece]
    for component in info.object.components:
        schemas = {schema.id: schema for schema in COMPONENTS[component.kind].properties}
        for name, value in component.properties.items():
            schema = schemas[name]
            for number in _numbers(value):
                assert schema.min is None or number >= schema.min, name
                assert schema.max is None or number <= schema.max, name
    material = next(component for component in info.object.components if component.kind == "material")
    assert getattr(material.properties["style"], "value", None) in GEOM_STYLES
    assert info.description and info.label


def test_the_library_covers_streets_buildings_furniture_nature_and_props():
    assert {piece.category for piece in PIECES.values()} == {
        "basics",
        "street",
        "buildings",
        "furniture",
        "nature",
        "props",
    }


def test_scene_carries_a_piece_finish_and_glow_for_the_drawing():
    def styled(piece: str):
        geoms = scene_description(compile_project(_placed(piece)), 0).geoms
        return next(geom for geom in geoms if geom.style is not None)

    assert (styled("building").style, styled("building").emissive) == ("building", 0.6)
    assert styled("sidewalk").finish == "tiles"


def test_finish_roughness_metalness_and_glow_never_change_what_a_brain_learned():
    project = _placed("barrel")
    values: dict[str, PropertyValue] = {
        "finish": ListValue(type="list", value="painted_metal"),
        "roughness": SliderValue(type="slider", value=0.9),
        "metalness": SliderValue(type="slider", value=0.1),
        "emissive": SliderValue(type="slider", value=2),
    }
    changed = apply_operations(
        project,
        [
            SetProperty(op="set_property", object="barrel", component="material", property=name, value=value)
            for name, value in values.items()
        ],
    )
    assert training_content(changed) == training_content(project)
