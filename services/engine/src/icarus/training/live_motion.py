from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from icarus.contracts.scene import SceneRay
from icarus.contracts.training import CopyPoses, LiveViewMode, MotionSegment
from icarus.sim.model_state import CONTROL_PERIOD
from icarus.sim.poses import copy_poses

# Seconds of sim time the realtime view may hold ahead of what it plays: longer than a PPO update, so updates never
# leave it without motion; checkpoint tests take longer and the view holds the last pose.
LEAD = 3.0
# What a live snapshot stream may cost in bytes per second, and what one geom or ray of one frame costs in JSON.
BYTE_BUDGET = 100_000
GEOM_BYTES = 55
RAY_BYTES = 130
MAX_FPS = 1 / CONTROL_PERIOD
MIN_FPS = 5.0
# A copy never holds more than this much sim time the view has not been sent yet.
MAX_PENDING_SECONDS = 40.0

Rows = list[list[float]]


def frame_rate(copies: int, geoms: int, rays: int, snapshots_per_second: float) -> float:
    """Frames per second each copy streams, as many as the byte budget leaves after each snapshot's newest poses,
    up to the control rate."""
    frame_bytes = geoms * GEOM_BYTES + rays * RAY_BYTES + 20
    left = BYTE_BUDGET - copies * frame_bytes * snapshots_per_second
    return max(MIN_FPS, min(MAX_FPS, left / max(1, copies * frame_bytes)))


@dataclass
class _Frame:
    episode: int
    time: float
    rows: Rows
    rays: list[SceneRay]


@dataclass
class _CopyMotion:
    newest: _Frame | None = None
    # Realtime: the episode being streamed, and whether it ended; later episodes are skipped until it is all sent.
    shown: int | None = None
    ended: bool = False
    pending: list[_Frame] = field(default_factory=list)
    out: list[_Frame] = field(default_factory=list)
    last_streamed: _Frame | None = None
    # Realtime: seconds of streamed sim time the view has not played yet, as the worker estimates it.
    buffered: float = 0.0
    steps_since: int = 0
    # Fast: wall time of the last frame kept.
    kept_at: float | None = None


class LiveMotion:
    """Every copy's recorded frames, streamed to the live view in contiguous episode segments.

    Copies only capture a frame on the steps `record` asks for, so frames nobody will see cost nothing.
    Realtime: one episode at a time per copy, at most LEAD seconds ahead of 1x playback; when a shown episode has been
    streamed, the copy's newest ongoing episode follows. Fast: every episode, thinned to about `fps` frames per wall
    second, so the view keeps pace with training."""

    def __init__(self, mode: LiveViewMode, copies: int, fps: float) -> None:
        self.mode = mode
        self.fps = fps
        self._stride = max(1, round(1 / (fps * CONTROL_PERIOD)))
        self._copies = [_CopyMotion() for _ in range(copies)]
        self._flushed: float | None = None

    def record(self, infos: Sequence[dict[str, Any]], dones: Sequence[bool], now: float) -> list[bool]:
        """Keep the frames the copies captured this step; returns which copies should capture one on the next."""
        wanted: list[bool] = []
        for copy, info, done in zip(self._copies, infos, dones, strict=True):
            captured = info.get("live_frame")
            copy.steps_since += 1
            if captured is not None:
                episode, time, rows, rays = captured
                self._keep(copy, _Frame(episode, time, rows, rays), now)
            if done and copy.shown is not None:
                copy.ended = True
            wanted.append(self._wants(copy, now))
        return wanted

    def _keep(self, copy: _CopyMotion, frame: _Frame, now: float) -> None:
        copy.newest, copy.steps_since, copy.kept_at = frame, 0, now
        if self.mode == "realtime":
            if copy.shown is None:
                copy.shown, copy.ended = frame.episode, False
            if frame.episode != copy.shown:
                return
        copy.pending.append(frame)
        if frame.time - copy.pending[0].time > MAX_PENDING_SECONDS:
            copy.pending.pop(0)

    def _wants(self, copy: _CopyMotion, now: float) -> bool:
        if self.mode == "fast":
            return copy.kept_at is None or now - copy.kept_at >= 1 / self.fps
        if copy.shown is None:
            return True
        return not copy.ended and copy.steps_since + 1 >= self._stride

    def _stream(self, copy: _CopyMotion, frame: _Frame) -> float:
        """Send one frame; returns the sim time it adds to what the view has to play."""
        last = copy.last_streamed
        played = frame.time - last.time if last is not None and last.episode == frame.episode else 1 / self.fps
        copy.out.append(frame)
        copy.last_streamed = frame
        return played

    def flush(self, now: float) -> list[list[MotionSegment]]:
        """The frames to stream since the previous flush, per copy, in episode segments."""
        elapsed = 0.0 if self._flushed is None else now - self._flushed
        self._flushed = now
        motion: list[list[MotionSegment]] = []
        for copy in self._copies:
            if self.mode == "fast":
                for frame in copy.pending:
                    self._stream(copy, frame)
                copy.pending.clear()
            else:
                copy.buffered = max(0.0, copy.buffered - elapsed)
                while copy.pending and copy.buffered < LEAD:
                    copy.buffered += self._stream(copy, copy.pending.pop(0))
                if copy.ended and not copy.pending:
                    copy.shown = None
            motion.append(_segments(copy.out))
            copy.out = []
        return motion

    def newest(self) -> list[CopyPoses] | None:
        """Each copy's newest captured pose, once every copy has one."""
        frames = [copy.newest for copy in self._copies]
        if any(frame is None for frame in frames):
            return None
        return [copy_poses(frame.rows, frame.rays) for frame in frames if frame is not None]


def _segments(frames: list[_Frame]) -> list[MotionSegment]:
    segments: list[MotionSegment] = []
    for frame in frames:
        if not segments or segments[-1].episode != frame.episode:
            segments.append(MotionSegment(episode=frame.episode, times=[], frames=[]))
        segments[-1].times.append(frame.time)
        segments[-1].frames.append(copy_poses(frame.rows, frame.rays))
    return segments
