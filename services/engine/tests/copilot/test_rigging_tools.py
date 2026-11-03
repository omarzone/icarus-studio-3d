import base64
from datetime import UTC, datetime

import pytest

from icarus.contracts.copilot import AttachmentUpload
from icarus.contracts.motion import Keypoint, MotionVideoUpload, TrackedFrame
from icarus.contracts.operations import OperationBatch, SetProperty
from icarus.contracts.properties import NumberValue
from icarus.copilot.agent.tools import REGISTRY
from icarus.copilot.agent.tools.base import ToolServices, TurnScope
from icarus.copilot.agent.tools.proposing import ApplyArgs, apply
from icarus.copilot.agent.tools.rigging import (
    AutoRigArgs,
    FixBodyArgs,
    ImitateArgs,
    _auto_rig,
    _fix_body,
    _imitate,
)
from icarus.copilot.attachments import AttachmentStore
from icarus.motion.clip_store import ClipStore
from icarus.projects.skins import SkinStore
from icarus.projects.store import ProjectStore
from icarus.training.run_store import RunStore
from tests.model_files import humanoid_obj


def _scope(tmp_path, template: str) -> TurnScope:
    root = tmp_path / "projects"
    store = ProjectStore(root)
    project_id = store.create("Copy", template).project.id
    services = ToolServices(
        store,
        RunStore(tmp_path / "runs"),
        None,  # type: ignore[arg-type]
        AttachmentStore(root),
        None,  # type: ignore[arg-type]
        skins=SkinStore(root),
        clips=ClipStore(root),
    )
    scope = TurnScope(project_id, store.state(project_id), "autopilot", services)
    scope.can_see = False
    return scope


def _applied(scope: TurnScope, observation) -> None:
    assert observation.ok, observation.text
    try_id = next(iter(scope.tries))
    result = apply(scope, ApplyArgs(try_id=try_id, summary="Copilot change"))
    assert result.ok, result.text


def test_the_tools_are_registered():
    assert {"auto_rig", "fix_body", "imitate_clip"} <= set(REGISTRY)


def test_the_copilot_rigs_an_attached_obj_into_the_body(tmp_path):
    scope = _scope(tmp_path, "empty_world")
    upload = AttachmentUpload(
        name="person.obj", media_type="model/obj", kind="model", data=base64.b64encode(humanoid_obj()).decode()
    )
    info = scope.services.attachments.add(scope.project_id, upload)
    observation = _auto_rig(scope, AutoRigArgs(attachment=info.id))
    assert "humanoid" in observation.text
    _applied(scope, observation)
    body = scope.services.projects.state(scope.project_id).project.bodies[0]
    assert len(body.objects) == 13


def test_an_unknown_attachment_is_refused(tmp_path):
    scope = _scope(tmp_path, "empty_world")
    observation = _auto_rig(scope, AutoRigArgs(attachment="nope"))
    assert not observation.ok and scope.tries == {}


def test_the_copilot_fixes_a_motor_too_weak_for_its_leg(tmp_path):
    scope = _scope(tmp_path, "humanoid")
    store = scope.services.projects
    thigh = next(o for o in store.state(scope.project_id).project.bodies[0].objects if o.id == "thigh_left")
    motor = next(c.id for c in thigh.components if c.kind == "motor")
    weak = SetProperty(
        op="set_property",
        object=thigh.id,
        component=motor,
        property="max_force",
        value=NumberValue(type="number", value=5),
    )
    scope.state = store.apply(scope.project_id, OperationBatch(operations=[weak], summary="Weaken"))
    observation = _fix_body(scope, FixBodyArgs())
    assert "too weak" in observation.text
    _applied(scope, observation)
    fixed = next(o for o in store.state(scope.project_id).project.bodies[0].objects if o.id == "thigh_left")
    force = next(c for c in fixed.components if c.kind == "motor").properties["max_force"]
    assert isinstance(force, NumberValue) and force.value > 5
    assert "nothing to fix" in _fix_body(scope, FixBodyArgs()).text


def test_the_copilot_makes_the_body_imitate_the_tracked_clip(tmp_path):
    scope = _scope(tmp_path, "humanoid")
    assert not _imitate(scope, ImitateArgs()).ok
    clips = scope.services.clips
    assert clips is not None
    picture = base64.b64encode(b"\xff\xd8\xff" + b"0" * 16).decode()
    video = MotionVideoUpload(name="walk.mp4", duration=1, fps=2, width=100, height=100, frames=[picture, picture])
    clip = clips.add(scope.project_id, video, "humanoid_body")
    points = {"left_hip": (0.5, 0.5), "right_hip": (0.5, 0.5), "neck": (0.5, 0.2), "left_knee": (0.55, 0.7)}
    keypoints = [Keypoint(name=name, x=x, y=y) for name, (x, y) in points.items()]  # type: ignore[arg-type]
    frames = [TrackedFrame(time=index / 2, keypoints=keypoints) for index in range(2)]
    clips.save(scope.project_id, clip.model_copy(update={"frames": frames, "created_at": datetime.now(UTC)}))
    observation = _imitate(scope, ImitateArgs())
    assert "left_thigh → thigh_left" in observation.text
    _applied(scope, observation)
    task = scope.services.projects.state(scope.project_id).project.task
    assert task.family == "imitation" and task.motion is not None


@pytest.mark.parametrize("name", ["auto_rig", "fix_body", "imitate_clip"])
def test_each_tool_only_tries_and_never_writes(name):
    assert REGISTRY[name].effect == "read" and REGISTRY[name].step == "try"
