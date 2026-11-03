import math
from datetime import UTC, datetime

import numpy as np
import pytest

from icarus.contracts.motion import Keypoint, MotionClip, MotionVideo, TrackedFrame
from icarus.contracts.operations import OperationBatch
from icarus.contracts.training import Rollout, RolloutFrame
from icarus.design.compiler import compile_project
from icarus.design.test_poses import take_pose
from icarus.motion.comparison import result_angles, weakest_start
from icarus.motion.imitation import imitation_operations
from icarus.motion.retarget import build_reference, match_parts, reference_pose
from icarus.projects.store import ProjectStore
from icarus.sim.env import ProjectEnv
from icarus.sim.motion_tracking import MotionTracker

FPS = 10.0


def _frame(index: int, swing: float) -> TrackedFrame:
    """A person seen from the side facing right, the left leg swinging forward by `swing` radians."""
    hip, length = (0.5, 0.5), 0.2
    knee = (hip[0] + length * math.sin(swing), hip[1] + length * math.cos(swing))
    ankle = (knee[0] + 0.01, knee[1] + length)
    points = {
        "head": (0.5, 0.1),
        "neck": (0.5, 0.2),
        "left_shoulder": (0.5, 0.22),
        "left_elbow": (0.5, 0.35),
        "left_wrist": (0.5, 0.47),
        "left_hip": hip,
        "right_hip": hip,
        "left_knee": knee,
        "left_ankle": ankle,
        "right_knee": (0.51, 0.7),
        "right_ankle": (0.5, 0.9),
    }
    keypoints = [Keypoint(name=name, x=x, y=y) for name, (x, y) in points.items()]  # type: ignore[arg-type]
    return TrackedFrame(time=index / FPS, keypoints=keypoints)


def _clip(frames: int = 20) -> MotionClip:
    video = MotionVideo(name="kick.mp4", duration=frames / FPS, start=0, fps=FPS, width=480, height=480, frames=frames)
    swings = [0.6 * math.sin(math.pi * index / frames) for index in range(frames)]
    return MotionClip(
        id="cabc",
        video=video,
        target="humanoid_body",
        frames=[_frame(index, swing) for index, swing in enumerate(swings)],
        created_at=datetime.now(UTC),
    )


@pytest.fixture
def imitating(tmp_path):
    store = ProjectStore(tmp_path)
    project_id = store.create("Kick", "humanoid").project.id
    project = store.state(project_id).project
    reference = build_reference(project, _clip())
    store.apply(project_id, OperationBatch(operations=imitation_operations(project, reference), summary="Imitate"))
    return store.state(project_id).project


def test_the_humanoids_limbs_match_the_persons_by_name_and_side(tmp_path):
    project = ProjectStore(tmp_path).create("Kick", "humanoid").project
    parts = match_parts(project, project.bodies[0])
    assert parts["left_thigh"] == "thigh_left" and parts["right_shin"] == "shin_right"
    assert parts["left_forearm"] == "forearm_left" and parts["torso"] == "chest" and parts["head"] == "head"


def test_the_reference_keeps_each_limbs_angle_in_the_picture(imitating):
    motion = imitating.task.motion
    assert imitating.task.family == "imitation" and motion is not None
    thigh = next(track for track in motion.tracks if track.segment == "left_thigh")
    # Hanging straight down at the start, swung forward (toward +x, angle above -90°) in the middle.
    assert thigh.angles[0] == pytest.approx(-math.pi / 2, abs=0.05)
    assert thigh.angles[10] is not None and thigh.angles[10] > -math.pi / 2 + 0.4


def test_an_imitation_episode_lasts_the_clip_and_pays_for_matching_it(imitating):
    env = ProjectEnv(imitating)
    observation, _ = env.reset(seed=0)
    # The last value is where in the clip the try is.
    assert observation[-1] == pytest.approx(0.0)
    rewards, steps, ended = [], 0, False
    while not ended:
        observation, reward, terminated, truncated, info = env.step(np.zeros(len(env.world.actuators)))
        rewards.append(info["reward_parts"]["track_motion"])
        steps += 1
        ended = terminated or truncated
    # It falls with its motors at mid range, or the 2 s clip runs out first.
    assert steps <= 41
    assert all(0 <= value <= 1 for value in rewards) and rewards[0] > 0.5
    env.reset(seed=0)
    env.world.motion_start = 1.99
    assert env.step(np.zeros(len(env.world.actuators)))[3]


def test_the_clip_frame_pose_turns_the_thigh_forward(imitating):
    compiled = compile_project(imitating)
    angles = reference_pose(imitating, compiled, frame=10)
    # Swinging the thigh forward is a negative turn about the hip's +y axis.
    assert angles["thigh_left"] < -0.3
    posed = take_pose(imitating, compiled, 1, "clip", angles)
    assert posed.label == "Frame from the clip" and posed.joints == 12


def test_a_rollout_is_read_limb_by_limb_like_the_reward(imitating):
    env = ProjectEnv(imitating)
    env.reset(seed=0)
    frames = []
    for step in range(40):
        poses = env.poses()
        frames.append(
            RolloutFrame(time=step * 0.05, positions=poses.positions, quaternions=poses.quaternions, reward=0.0)
        )
        env.step(np.zeros(len(env.world.actuators)))
    rollout = Rollout(step=0, seed=0, geoms=env.moving_geoms, frames=frames, episode_return=0, outcome="Time ran out")
    reference = imitating.task.motion
    assert reference is not None
    tracker = MotionTracker(reference, compile_project(imitating).model)
    rows = result_angles(reference, tracker, rollout)
    assert len(rows) == tracker.frames
    thigh = [part.segment for part in tracker.parts].index("left_thigh")
    assert rows[0][thigh] == pytest.approx(-math.pi / 2, abs=0.1)


def test_the_weakest_second_is_where_the_match_dips():
    match = [0.9] * 10 + [0.2] * 10 + [0.9] * 20
    assert weakest_start(match, FPS) == pytest.approx(10 / 40)
