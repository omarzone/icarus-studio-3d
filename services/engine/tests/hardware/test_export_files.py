import io
import json
import xml.etree.ElementTree as ET
import zipfile

import mujoco
import numpy as np
import pytest

from icarus.contracts.build import ExportChoice
from icarus.design.compiler import compile_project
from icarus.hardware.export_bundle import NO_BRAIN, ExportRefused, export_bundle, write_zip
from icarus.hardware.urdf import body_urdf

EVERYTHING = ExportChoice(format="package", options=["spec", "runtime", "parts", "history"])


def _moving(model: mujoco.MjModel, bodies: set[str]) -> dict[str, int]:
    return {
        model.joint(j).name: int(model.jnt_type[j])
        for j in range(model.njnt)
        if model.body(int(model.jnt_bodyid[j])).name in bodies and int(model.jnt_type[j]) != 0
    }


def test_the_exported_mjcf_reloads_in_mujoco_as_the_compiled_model(studio):
    state = studio.project("parking_car")
    content, _ = export_bundle(state, studio.runs, ExportChoice(format="mjcf", options=[])).files["scene.xml"]
    reloaded = mujoco.MjModel.from_xml_string(content.decode("utf-8"))
    compiled = compile_project(state.project).model
    for field in ("nbody", "njnt", "nu", "nsensor", "ngeom", "nq"):
        assert getattr(reloaded, field) == getattr(compiled, field)
    assert reloaded.body_mass.sum() == pytest.approx(compiled.body_mass.sum())
    np.testing.assert_allclose(reloaded.qpos0, compiled.qpos0)


@pytest.mark.parametrize("template", ["parking_car", "walker_robot", "humanoid"])
def test_the_urdf_parses_with_a_link_per_part_and_the_compiled_joints(studio, template):
    project = studio.project(template).project
    compiled = compile_project(project)
    robot = body_urdf(project, compiled)
    root = ET.fromstring(robot.xml)
    links = {link.get("name") for link in root.iter("link")}
    objects = project.bodies[0].objects
    base = next(obj.id for obj in objects if obj.parent is None)
    parts = {base} | {obj.id for obj in objects if obj.parent is not None}
    assert root.tag == "robot" and links == parts == set(robot.links)
    loose = [obj.name for obj in objects if obj.id not in parts]
    assert all(any(name in note for note in robot.notes) for name in loose)
    joints = {joint.get("name"): joint.get("type") for joint in root.iter("joint")}
    assert len(joints) == len(parts) - 1
    expected = {"revolute", "continuous", "prismatic"}
    moving = {name: kind for name, kind in joints.items() if kind in expected}
    compiled_joints = _moving(compiled.model, parts)
    assert set(moving) == set(compiled_joints)
    for name, kind in moving.items():
        index = mujoco.mj_name2id(compiled.model, mujoco.mjtObj.mjOBJ_JOINT, name)
        assert (kind == "revolute") == bool(compiled.model.jnt_limited[index]) or kind == "prismatic"
    for joint in root.iter("joint"):
        assert joint.find("parent") is not None and joint.find("child") is not None


def test_the_urdf_loads_in_mujoco_with_the_same_moving_joints_and_mass(studio):
    project = studio.project("walker_robot").project
    compiled = compile_project(project)
    robot = body_urdf(project, compiled)
    loaded = mujoco.MjModel.from_xml_string(robot.xml)
    parts = set(robot.links)
    assert loaded.njnt == len(_moving(compiled.model, parts))
    root = next(obj.id for obj in project.bodies[0].objects if obj.parent is None)
    # MuJoCo fixes a URDF's root link to the world, so its mass leaves the moving tree.
    limbs = sum(compiled.model.body(part).mass[0] for part in parts if part != root)
    assert loaded.body_subtreemass[0] == pytest.approx(limbs)


def test_without_a_brain_the_package_holds_the_robot_and_says_what_is_missing(studio):
    bundle = export_bundle(studio.project("walker_robot"), studio.runs, EVERYTHING)
    assert {"robot.urdf", "scene.xml", "parts.csv", "README.md"} <= set(bundle.files)
    assert "brain.onnx" not in bundle.files and bundle.brain is None and NO_BRAIN in bundle.notes
    plan = bundle.plan(EVERYTHING)
    assert plan.name == "test-robot-r1.zip"
    assert plan.total_bytes == sum(len(content) for content, _ in bundle.files.values())


def test_the_onnx_brain_answers_like_the_ppo_policy(studio):
    import onnx
    from onnx.reference import ReferenceEvaluator
    from stable_baselines3 import PPO

    from icarus.sim.env import ProjectEnv

    state = studio.project("parking_car")
    folder = studio.brain(state)
    bundle = export_bundle(state, studio.runs, EVERYTHING)
    model = onnx.load_from_string(bundle.files["brain.onnx"][0])
    onnx.checker.check_model(model)
    spec = json.loads(bundle.files["brain.json"][0])
    env = ProjectEnv(folder.project())
    size, outputs = int(np.prod(env.observation_space.shape or ())), int(np.prod(env.action_space.shape or ()))
    assert bundle.brain is not None and (bundle.brain.inputs, bundle.brain.outputs) == (size, outputs)
    assert len(spec["inputs"]) == size and spec["rate_hz"] == pytest.approx(20)
    assert [graph_input.name for graph_input in model.graph.input] == [spec["input"]["name"]]
    policy = PPO.load(folder.checkpoint_path(5_000), device="cpu")
    observations = [env.reset(seed=seed)[0] for seed in range(4)]
    observations += [np.random.default_rng(1).normal(0, 2, size).astype(np.float32) for _ in range(4)]
    batch = np.stack(observations).astype(np.float32)
    answer = ReferenceEvaluator(model).run(None, {spec["input"]["name"]: batch})
    actions = np.asarray(answer[0] if isinstance(answer, list) else answer[spec["output"]["name"]], dtype=float)
    expected, _ = policy.predict(batch, deterministic=True)
    np.testing.assert_allclose(actions, np.asarray(expected, dtype=float), atol=1e-5)
    assert {"run_policy.py", "training.csv"} <= set(bundle.files)
    assert "brain.json" in bundle.files["README.md"][0].decode("utf-8")


def test_the_zip_holds_every_planned_file_under_the_export_name(studio, tmp_path):
    bundle = export_bundle(studio.project("walker_robot"), studio.runs, EVERYTHING)
    result = write_zip(bundle, str(tmp_path / "robot.zip"))
    with zipfile.ZipFile(io.BytesIO((tmp_path / "robot.zip").read_bytes())) as archive:
        names = archive.namelist()
        assert sorted(names) == sorted(f"{bundle.name}/{path}" for path in bundle.files)
        assert archive.read(f"{bundle.name}/robot.urdf") == bundle.files["robot.urdf"][0]
    assert result.total_bytes == sum(item.bytes for item in result.files)
    assert not list(tmp_path.glob(".*.partial"))


@pytest.mark.parametrize("name", ["relative.zip", "missing/robot.zip", "robot.txt"])
def test_the_zip_is_refused_outside_an_existing_folder_or_without_the_zip_extension(studio, tmp_path, name):
    bundle = export_bundle(studio.project("walker_robot"), studio.runs, ExportChoice(format="urdf", options=[]))
    path = name if name == "relative.zip" else str(tmp_path / name)
    with pytest.raises(ExportRefused):
        write_zip(bundle, path)
