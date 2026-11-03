"""The pose role: one picture to the `pose` capability, every person in it back as keypoints in a fixed JSON
schema (contracts.motion.PoseEstimate), validated before anything uses them."""

import base64
from typing import get_args

from icarus.contracts.motion import KeypointName, PoseEstimate
from icarus.copilot.client import ModelClient

KEYPOINTS: tuple[str, ...] = get_args(KeypointName)
POSE_SYSTEM = (
    "You are a human pose estimator. Find every person in the picture and give their body keypoints. "
    f"Use only these keypoint names: {', '.join(KEYPOINTS)}. Left and right are the person's own left and right, "
    "not the picture's. x and y are the point's position as a share of the picture's width and height, from its "
    "top left corner, between 0 and 1. score is how sure you are, between 0 and 1. Leave out keypoints you cannot "
    "see. Give each keypoint name at most once per person. A picture with nobody in it has an empty people list."
)


def _problems(estimate: PoseEstimate) -> list[str]:
    problems: list[str] = []
    for number, person in enumerate(estimate.people, start=1):
        names = [keypoint.name for keypoint in person.keypoints]
        repeated = sorted({name for name in names if names.count(name) > 1})
        if repeated:
            problems.append(f"people.{number}: {', '.join(repeated)} given more than once")
    return problems


def estimate_pose(
    client: ModelClient, picture: bytes, media_type: str, index: int, count: int, deadline: float | None = None
) -> PoseEstimate:
    """Every person the pose model finds in one frame; raises CopilotError when its answer does not fit."""
    url = f"data:{media_type};base64,{base64.b64encode(picture).decode()}"
    user: list[dict[str, object]] = [
        {"type": "text", "text": f"Frame {index + 1} of {count}. Find every person and their keypoints."},
        {"type": "image_url", "image_url": {"url": url}},
    ]
    reply = client.ask("pose", PoseEstimate, POSE_SYSTEM, user, check=_problems, deadline=deadline)
    return reply.value
