"""The reference against the physics result: a run's latest recorded evaluation episode, read limb by limb the same
way the imitation reward reads it, frame by frame of the clip."""

import mujoco
import numpy as np

from icarus.contracts.motion import MotionComparison, MotionReference, PartMatch
from icarus.contracts.training import Rollout, RunStatus
from icarus.design.compiler import compile_project
from icarus.sim.motion_tracking import MotionTracker, angle_match, mean_match, view_angle
from icarus.training.run_store import RunStore, UnknownRun


def imitation_runs(runs: RunStore, project_id: str, clip_id: str) -> list[RunStatus]:
    """The project's runs that imitate this clip, newest first."""
    found: list[RunStatus] = []
    for status in runs.list_runs(project_id):
        try:
            motion = runs.folder(status.run_id).project().task.motion
        except (UnknownRun, OSError, ValueError):
            continue
        if motion is not None and motion.clip == clip_id:
            found.append(status)
    return sorted(found, key=lambda status: status.started_at, reverse=True)


def latest_rollout(runs: RunStore, run_id: str) -> Rollout | None:
    folder = runs.folder(run_id)
    steps = sorted((point.step for point in folder.checkpoints() if point.has_rollout), reverse=True)
    return next((rollout for step in steps if (rollout := folder.rollout(step)) is not None), None)


def result_angles(reference: MotionReference, tracker: MotionTracker, rollout: Rollout) -> list[list[float | None]]:
    """Each tracked limb's angle in the picture at every reference frame, from the rollout frame nearest in time;
    None after the episode ended (a fall)."""
    columns = [rollout.geoms.index(part.part) if part.part in rollout.geoms else None for part in tracker.parts]
    times = np.array([frame.time for frame in rollout.frames]) if rollout.frames else np.zeros(0)
    rows: list[list[float | None]] = []
    rotation = np.zeros(9)
    for index in range(tracker.frames):
        time = index / reference.fps
        if len(times) == 0 or time > float(times[-1]) + 0.5 / reference.fps:
            rows.append([None] * len(columns))
            continue
        frame = rollout.frames[int(np.argmin(np.abs(times - time)))]
        row: list[float | None] = []
        for part, column in zip(tracker.parts, columns, strict=True):
            if column is None:
                row.append(None)
                continue
            mujoco.mju_quat2Mat(rotation, np.array(frame.quaternions[column], dtype=float))
            row.append(view_angle(rotation.reshape(3, 3) @ part.local, reference.view))
        rows.append(row)
    return rows


def weakest_start(match: list[float], fps: float) -> float:
    """Where the worst second of the clip starts, as a share of the clip."""
    if not match:
        return 0.0
    window = max(1, min(len(match), round(fps)))
    sums = np.convolve(np.array(match), np.ones(window), mode="valid")
    return float(np.argmin(sums)) / len(match)


def compare(runs: RunStore, project_id: str, clip_id: str) -> MotionComparison | None:
    """The latest imitation run of the clip against its reference; None before any run recorded an episode."""
    for status in imitation_runs(runs, project_id, clip_id):
        rollout = latest_rollout(runs, status.run_id)
        if rollout is None:
            continue
        project = runs.folder(status.run_id).project()
        reference = project.task.motion
        assert reference is not None
        tracker = MotionTracker(reference, compile_project(project).model)
        result = result_angles(reference, tracker, rollout)
        wanted = tracker.angles
        each = [
            [
                angle_match(ref, act) if act is not None or ref is None else 0.0
                for ref, act in zip(want, got, strict=True)
            ]
            for want, got in zip(wanted, result, strict=True)
        ]
        match = [round(mean_match(row), 4) for row in each]
        parts = [
            PartMatch(
                segment=part.segment,
                part=part.part,
                match=round(mean_match([row[number] for row in each]), 4),
            )
            for number, part in enumerate(tracker.parts)
        ]
        return MotionComparison(
            clip=clip_id,
            run_id=status.run_id,
            run_name=status.name,
            step=rollout.step,
            fps=reference.fps,
            segments=[part.segment for part in tracker.parts],
            reference=wanted,
            result=result,
            match=match,
            parts=parts,
            overall=round(sum(match) / len(match), 4) if match else 0.0,
            weakest=round(weakest_start(match, reference.fps), 4),
        )
    return None
