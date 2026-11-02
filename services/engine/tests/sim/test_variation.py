import colorsys

import mujoco
import numpy as np
import pytest

from icarus.contracts.objects import ComponentSpec, ObjectSpec
from icarus.contracts.operations import CreateObject
from icarus.contracts.project import Project
from icarus.contracts.properties import ChoiceValue, ColorValue, NumberValue, SliderValue, SwitchValue, VectorValue
from icarus.library.components import default_component
from icarus.projects.operations import apply_operations
from icarus.sim.env import ProjectEnv
from icarus.sim.variation import copy_variation

CRATE_AT = (6.0, 4.0, 0.5)
CRATE_COLOR = "#3366cc"


def crate(
    position: tuple[float, float, float] = CRATE_AT,
    size: tuple[float, float, float] = (1.0, 1.0, 1.0),
    position_range: tuple[float, float, float] = (2.0, 1.0, 0.0),
    rotation_range: float = 45.0,
    color: bool = True,
    friction_spread: float = 30.0,
    mode: str = "static",
) -> ObjectSpec:
    def component(kind: str, **values) -> ComponentSpec:
        base = default_component(kind, kind)
        return base.model_copy(update={"properties": base.properties | values})

    return ObjectSpec(
        id="crate",
        name="Crate",
        parent=None,
        components=[
            component("transform", position=VectorValue(type="vector", value=position)),
            component("mesh", size=VectorValue(type="vector", value=size)),
            component("material", color=ColorValue(type="color", value=CRATE_COLOR)),
            component("physics_body", mode=ChoiceValue(type="choice", value=mode)),
            component("collider"),
            component(
                "randomize",
                position_range=VectorValue(type="vector", value=position_range),
                rotation_range=NumberValue(type="number", value=rotation_range),
                color=SwitchValue(type="switch", value=color),
                friction_spread=SliderValue(type="slider", value=friction_spread),
            ),
        ],
    )


def with_crate(project: Project, obj: ObjectSpec | None = None) -> Project:
    return apply_operations(project, [CreateObject(op="create_object", target="world", object=obj or crate())])


def crate_geom(env: ProjectEnv) -> int:
    return int(mujoco.mj_name2id(env.world.model, mujoco.mjtObj.mjOBJ_GEOM, "crate"))


def test_the_same_seed_gives_the_same_variation_and_another_seed_a_different_one(parking):
    project = with_crate(parking)
    assert copy_variation(project, 4) == copy_variation(project, 4)
    assert copy_variation(project, 4) != copy_variation(project, 5)


def test_a_variation_stays_inside_the_ranges_the_person_set(parking):
    project = with_crate(parking)
    for seed in range(10):
        moved = copy_variation(project, seed).objects["crate"]
        assert abs(moved.offset[0]) <= 2.0 and abs(moved.offset[1]) <= 1.0 and moved.offset[2] == 0
        assert abs(moved.yaw) <= 45.0
        assert moved.color is not None and moved.color != CRATE_COLOR


def test_reset_moves_turns_recolors_and_changes_the_friction_of_a_randomized_object(parking):
    env = ProjectEnv(with_crate(parking), randomize=True)
    geom = crate_geom(env)
    base_friction = ProjectEnv(with_crate(parking)).world.model.geom_friction[geom, 0]
    env.reset(seed=3)
    model, data = env.world.model, env.world.data
    position = data.geom_xpos[geom]
    assert position[0] != pytest.approx(CRATE_AT[0]) and abs(position[0] - CRATE_AT[0]) <= 2.0
    assert abs(position[1] - CRATE_AT[1]) <= 1.0
    assert position[2] == pytest.approx(CRATE_AT[2])
    assert data.geom_xmat[geom][0] < 1 - 1e-9
    hue = colorsys.rgb_to_hsv(*model.geom_rgba[geom, :3])[0]
    assert model.geom_rgba[geom, :3] != pytest.approx([0x33 / 255, 0x66 / 255, 0xCC / 255])
    assert hue == pytest.approx(colorsys.rgb_to_hsv(0x33 / 255, 0x66 / 255, 0xCC / 255)[0], abs=0.1)
    ratio = model.geom_friction[geom, 0] / base_friction
    assert ratio != pytest.approx(1.0) and abs(ratio - 1) <= 0.3 + 1e-9


def test_reset_moves_a_dynamic_object_from_its_start(parking):
    env = ProjectEnv(with_crate(parking, crate(mode="dynamic")), randomize=True)
    env.reset(seed=3)
    position = env.world.data.geom_xpos[crate_geom(env)]
    assert position[:2] != pytest.approx(CRATE_AT[:2])
    assert abs(position[0] - CRATE_AT[0]) <= 2.0 and abs(position[1] - CRATE_AT[1]) <= 1.0


def test_evaluation_copies_keep_the_world_as_designed(parking):
    env = ProjectEnv(with_crate(parking), randomize=False)
    env.reset(seed=3)
    assert env.world.data.geom_xpos[crate_geom(env)] == pytest.approx(CRATE_AT)


def test_a_randomized_object_follows_its_own_friction_spread_and_the_rest_keep_the_default_spread(parking):
    project = with_crate(parking, crate(friction_spread=0.0))
    env = ProjectEnv(project, randomize=True)
    base = ProjectEnv(project).world.model.geom_friction[:, 0].copy()
    env.reset(seed=1)
    ratios = env.world.model.geom_friction[:, 0] / base
    geom = crate_geom(env)
    assert ratios[geom] == pytest.approx(1.0)
    others = np.delete(ratios, geom)
    assert not np.allclose(others, 1.0) and np.all(np.abs(others - 1) <= 0.2 + 1e-9)


def agent_touches_crate(env: ProjectEnv) -> bool:
    geom = crate_geom(env)
    data = env.world.data
    pairs = [{int(contact.geom1), int(contact.geom2)} for contact in data.contact[: data.ncon]]
    return any(geom in pair and pair & env.world.agent_geoms for pair in pairs)


def test_a_copy_whose_varied_object_would_overlap_the_agent_start_is_resampled(parking):
    # A crate beside the car's spawn that may slide right over where the car starts.
    blocker = crate(position=(-1.0, 1.0, 0.5), size=(1.5, 1.5, 1.0), position_range=(3.0, 3.0, 0.0))
    env = ProjectEnv(with_crate(parking, blocker), randomize=True)
    for seed in range(12):
        env.reset(seed=seed)
        assert not agent_touches_crate(env), seed
