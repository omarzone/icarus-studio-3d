from icarus.contracts.objects import ObjectSpec
from icarus.contracts.operations import CreateObject, DeleteObject, EditOperation, SetProperty
from icarus.contracts.properties import ChoiceValue, ColorValue, SliderValue
from icarus.design.compiler import compile_project
from icarus.design.scene import scene_description
from icarus.library.components import COMPONENTS, default_component
from icarus.library.templates import TEMPLATES, template_operations
from icarus.projects.operations import apply_operations, empty_project
from icarus.projects.validation import validate_project


def parking(*extra: EditOperation):
    return apply_operations(empty_project("0123456789ab", "T"), [*template_operations("parking_car"), *extra])


def sky_property(prop: str, value) -> SetProperty:
    return SetProperty(op="set_property", object="sky", component="sky", property=prop, value=value)


def test_the_sky_is_one_world_component_with_a_preset_two_colors_light_and_haze():
    sky = COMPONENTS["sky"]
    assert sky.group == "World" and sky.unique
    schemas = {schema.id: schema for schema in sky.properties}
    assert [option.value for option in schemas["preset"].options or []] == [
        "day",
        "dusk",
        "night",
        "overcast",
        "custom",
    ]
    assert schemas["top"].type == schemas["horizon"].type == "color"
    assert (schemas["ambient"].min, schemas["ambient"].max) == (0, 2)
    assert (schemas["fog"].min, schemas["fog"].max) == (0, 1)


def test_every_template_starts_with_a_sky():
    for template in TEMPLATES:
        project = apply_operations(empty_project("0123456789ab", "T"), template_operations(template))
        skies = [c for obj in project.world.objects for c in obj.components if c.kind == "sky"]
        assert len(skies) == 1, template


def test_the_parking_lot_has_a_day_sky_in_its_scene():
    sky = scene_description(compile_project(parking()), revision=1).sky
    assert sky is not None
    assert (sky.top.lower(), sky.horizon.lower()) == ("#5f8fc4", "#e4ecef")


def test_a_preset_sets_the_colors_and_custom_uses_the_chosen_ones():
    dusk = scene_description(
        compile_project(parking(sky_property("preset", ChoiceValue(type="choice", value="dusk")))), 1
    )
    assert dusk.sky is not None and (dusk.sky.top.lower(), dusk.sky.horizon.lower()) == ("#1b2a3d", "#aebccb")
    custom = parking(
        sky_property("preset", ChoiceValue(type="choice", value="custom")),
        sky_property("top", ColorValue(type="color", value="#0044ff")),
        sky_property("fog", SliderValue(type="slider", value=0.5)),
    )
    sky = scene_description(compile_project(custom), 1).sky
    assert sky is not None and sky.top == "#0044ff" and sky.fog == 0.5


def test_a_world_without_a_sky_exports_none():
    project = parking(DeleteObject(op="delete_object", object="sky"))
    assert scene_description(compile_project(project), 1).sky is None


def test_the_sky_changes_how_the_model_looks_and_never_its_physics():
    plain = compile_project(parking(DeleteObject(op="delete_object", object="sky")))
    day = compile_project(parking())
    bright = compile_project(parking(sky_property("ambient", SliderValue(type="slider", value=2))))
    assert bright.model.vis.headlight.ambient[0] > day.model.vis.headlight.ambient[0]
    assert day.model.ntex == plain.model.ntex + 1
    shape = [(m.model.nq, m.model.nu, m.model.ngeom, float(m.model.body_mass.sum())) for m in (plain, day, bright)]
    assert shape[0] == shape[1] == shape[2]


def test_a_world_takes_one_sky_and_bodies_take_none():
    second = ObjectSpec(id="sky2", name="Second sky", parent=None, components=[default_component("sky", "sky")])
    two = parking(CreateObject(op="create_object", target="world", object=second))
    assert any(issue.message == "A world can have only one sky" for issue in validate_project(two))
    project = parking()
    car = project.bodies[0].objects[0]
    car.components.append(default_component("sky", "sky"))
    assert any("sky" in issue.message.lower() for issue in validate_project(project))
