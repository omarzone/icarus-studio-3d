import mujoco
import numpy as np
import pytest

from icarus.contracts.robots import RobotFile, RobotImport
from icarus.design.compiler import compile_project
from icarus.projects.robot_files import RobotRejected, decode_files, read_robot
from icarus.projects.robot_import import import_robot
from icarus.projects.store import ProjectStore
from icarus.sim.env import ProjectEnv
from tests.robot_files import leg_files, robot_file, walker_files


@pytest.fixture
def store(tmp_path) -> ProjectStore:
    return ProjectStore(tmp_path)


def _read(files: list[RobotFile], main: str | None = None):
    return read_robot(decode_files(files), main)


def _components(obj) -> dict[str, dict]:
    return {
        component.kind: {name: value.model_dump(mode="json") for name, value in component.properties.items()}
        for component in obj.components
    }


def test_an_mjcf_robot_becomes_the_body_and_passes_its_design_tests(store):
    project_id = store.create("Robot", "empty_world").project.id
    imported = import_robot(store, project_id, RobotImport(files=walker_files()))
    state = store.state(project_id)
    assert state.report.ok and state.revision.number == imported.revision
    assert [body.id for body in state.project.bodies] == [imported.body]
    assert imported.format == "mjcf" and imported.name == "Tiny walker"
    # Five hinges, the left hip's two on a link of their own; four motors from the file, the hip roll left free.
    assert (imported.joints, imported.motors) == (5, 4)
    objects = {obj.id: obj for obj in state.project.bodies[0].objects}
    assert set(objects) == {"torso", "left-leg-joint-1", "left-leg", "left-foot", "right-leg", "right-foot"}
    hip = _components(objects["right-leg"])
    assert hip["joint"]["limits"]["low"] == -60 and hip["joint"]["axis"]["value"] == [0, 1, 0]
    assert hip["motor"]["kind"]["value"] == "position" and hip["motor"]["max_force"]["value"] == 30
    assert _components(objects["left-leg"])["motor"]["max_force"]["value"] == 20
    assert "motor" not in _components(objects["left-leg-joint-1"])
    assert "balance" in _components(objects["torso"])
    assert state.project.task.family == "locomotion"
    assert any("mesh colliders became boxes" in note for note in imported.notes)


def test_every_imported_collider_sits_where_the_file_puts_it(store):
    """The compiled project matches the file's own model at rest, up to where the robot was placed."""
    project_id = store.create("Robot", "empty_world").project.id
    import_robot(store, project_id, RobotImport(files=walker_files()))
    compiled = compile_project(store.state(project_id).project)
    data = mujoco.MjData(compiled.model)
    mujoco.mj_forward(compiled.model, data)
    source = _read(walker_files()).model
    original = mujoco.MjData(source)
    mujoco.mj_forward(source, original)
    shift = data.xpos[compiled.model.body("torso").id] - original.xpos[source.body("torso").id]
    for name, part in (("torso", "torso"), ("left_leg", "left-leg"), ("right_foot", "right-foot")):
        geom = next(index for index in range(source.ngeom) if source.geom_bodyid[index] == source.body(name).id)
        expected = original.geom_xpos[geom] + original.geom_xmat[geom].reshape(3, 3) @ source.geom_aabb[geom][:3]
        assert np.allclose(data.geom_xpos[compiled.model.geom(part).id], expected + shift, atol=1e-4)


def test_a_urdf_robot_floats_finds_its_meshes_by_name_and_gets_motors_from_its_efforts(store):
    project_id = store.create("Robot", "empty_world").project.id
    imported = import_robot(store, project_id, RobotImport(files=leg_files()))
    assert imported.format == "urdf" and (imported.joints, imported.motors) == (2, 2)
    state = store.state(project_id)
    assert state.report.ok
    objects = {obj.id: _components(obj) for obj in state.project.bodies[0].objects}
    assert set(objects) == {"base-link", "thigh", "shin"}
    assert objects["base-link"]["physics_body"]["mode"]["value"] == "dynamic"
    assert "joint" not in objects["base-link"]
    assert objects["thigh"]["motor"]["max_force"]["value"] == 12
    assert objects["shin"]["mesh"]["size"]["value"] == pytest.approx([0.05, 0.05, 0.3])
    # A free base and the two hinges; MuJoCo alone would have welded the URDF's root to the world.
    compiled = compile_project(state.project)
    assert compiled.model.njnt == 3 and int(compiled.model.jnt_type[0]) == int(mujoco.mjtJoint.mjJNT_FREE)


def test_an_imported_robot_steps_as_a_training_environment(store):
    project_id = store.create("Robot", "empty_world").project.id
    import_robot(store, project_id, RobotImport(files=walker_files()))
    env = ProjectEnv(store.state(project_id).project)
    observation, _ = env.reset(seed=0)
    assert env.action_space.shape == (4,)
    for _ in range(5):
        observation, reward, *_ = env.step(env.action_space.sample())
        assert np.all(np.isfinite(observation)) and np.isfinite(reward)


def test_a_missing_mesh_is_named_without_the_private_folder():
    with pytest.raises(RobotRejected, match="foot.stl") as rejected:
        _read(walker_files()[:1])
    assert "icarus-robot" not in str(rejected.value)


@pytest.mark.parametrize(
    ("text", "reason"),
    [
        ('<mujoco><extension><plugin plugin="x"/></extension></mujoco>', "plugins"),
        ('<!DOCTYPE m [<!ENTITY a "b">]><mujoco/>', "DOCTYPE"),
        ("<mujoco><worldbody>", "not valid XML"),
        ('<root name="x"/>', "Pick the robot"),
    ],
)
def test_descriptions_that_ask_for_more_than_data_are_refused(text, reason):
    with pytest.raises(RobotRejected, match=reason):
        _read([robot_file("robot.xml", text.encode())])


def test_two_descriptions_need_one_named():
    files = [*walker_files(), *leg_files()]
    with pytest.raises(RobotRejected, match="Several robot descriptions"):
        _read(files)
    assert _read(files, "tiny_leg.urdf").format == "urdf"


def test_a_failed_import_changes_nothing(store):
    project_id = store.create("Robot", "empty_world").project.id
    before = store.state(project_id).revision.number
    with pytest.raises(RobotRejected):
        import_robot(store, project_id, RobotImport(files=[robot_file("tiny_leg.urdf", b"<robot name='x'/>")]))
    assert store.state(project_id).revision.number == before
