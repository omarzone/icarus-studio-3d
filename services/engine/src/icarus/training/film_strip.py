"""A dense strip of pictures of one recorded episode. The worker keeps the episode's MuJoCo states at each checkpoint;
the pictures are rendered from them only when someone looks, so training never waits on them."""

import io
import math
import os
import secrets
import time
from dataclasses import dataclass
from pathlib import Path

import mujoco
import numpy as np

from icarus.design.scene import scene_description
from icarus.sim.model_state import LiveWorld
from icarus.sim.views import encode_png, is_blank, open_renderer, release_renderer, render_pixels
from icarus.training.episode_frames import chase
from icarus.training.evaluation import EpisodeStates
from icarus.training.run_store import RunFolder

# Pictures at a fixed interval over the episode; the failure moment is added when it falls between two.
STRIP_FRAMES = 20
FRAME_WIDTH, FRAME_HEIGHT = 448, 280
# The sheet the model reads: every frame at half size, in rows of this many, in time order.
COLUMNS = 7
FAILURE_COLOR = np.array([225, 64, 52], np.uint8)
FAILURE_BORDER = 4
GAP = 12
_RETRIES = 20


def states_path(folder: RunFolder, step: int, episode: int) -> Path:
    return folder.frames_folder(step) / f"e{episode}-states.npz"


def _write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(f"{path.name}.{secrets.token_hex(4)}.tmp")
    partial.write_bytes(data)
    # Windows refuses to replace a file another process holds for a moment.
    for attempt in range(_RETRIES):
        try:
            os.replace(partial, path)
            return
        except PermissionError:
            if attempt == _RETRIES - 1:
                partial.unlink(missing_ok=True)
                raise
            time.sleep(0.01)


def save_states(folder: RunFolder, step: int, recorded: list[EpisodeStates]) -> None:
    """Keep the states of the recorded episodes of a checkpoint, compressed, next to its pictures."""
    for episode, states in enumerate(recorded):
        buffer = io.BytesIO()
        failure = -1 if states.failure_index is None else states.failure_index
        np.savez_compressed(
            buffer,
            times=np.asarray(states.times, np.float64),
            qpos=np.asarray(states.qpos, np.float32),
            failure=np.asarray(failure, np.int64),
        )
        _write_bytes(states_path(folder, step, episode), buffer.getvalue())


def load_states(folder: RunFolder, step: int, episode: int) -> EpisodeStates | None:
    path = states_path(folder, step, episode)
    if not path.is_file():
        return None
    with np.load(path, allow_pickle=False) as stored:
        failure = int(stored["failure"])
        qpos = stored["qpos"].astype(np.float64)
        return EpisodeStates([float(t) for t in stored["times"]], list(qpos), failure if failure >= 0 else None)


def stored_episodes(folder: RunFolder, step: int) -> list[int]:
    return sorted(
        int(path.name[1 : path.name.index("-")])
        for path in folder.frames_folder(step).glob("e*-states.npz")
        if path.name[1 : path.name.index("-")].isdigit()
    )


def strip_indices(states: EpisodeStates, count: int = STRIP_FRAMES) -> list[int]:
    """Steps at a fixed interval from the start to the end, plus the failure moment."""
    last = len(states.qpos) - 1
    if last <= 0:
        return [0]
    picked = {round(i * last / (count - 1)) for i in range(count)}
    if states.failure_index is not None and 0 <= states.failure_index <= last:
        picked.add(states.failure_index)
    return sorted(picked)


@dataclass(frozen=True)
class StripPicture:
    time: float
    failure: bool
    png: bytes


@dataclass(frozen=True)
class RenderedStrip:
    pictures: list[StripPicture]
    # Seconds between the fixed-interval frames.
    interval: float
    # Every picture at half size in rows of COLUMNS, the failure frame framed in red.
    sheet: np.ndarray

    @property
    def sheet_png(self) -> bytes:
        return encode_png(self.sheet)

    @property
    def failure_time(self) -> float | None:
        return next((picture.time for picture in self.pictures if picture.failure), None)


def strip_sheet(cells: list[tuple[np.ndarray, bool]]) -> np.ndarray:
    height, width = FRAME_HEIGHT // 2, FRAME_WIDTH // 2
    rows = max(1, math.ceil(len(cells) / COLUMNS))
    sheet = np.zeros((rows * height, COLUMNS * width, 3), np.uint8)
    for number, (pixels, failure) in enumerate(cells):
        cell = pixels[::2, ::2][:height, :width].copy()
        if failure:
            edge = FAILURE_BORDER
            cell[:edge], cell[-edge:], cell[:, :edge], cell[:, -edge:] = (FAILURE_COLOR,) * 4
        row, column = divmod(number, COLUMNS)
        sheet[row * height : (row + 1) * height, column * width : (column + 1) * width] = cell
    return sheet


def stacked(first: np.ndarray, second: np.ndarray) -> np.ndarray:
    """Two sheets one above the other with a dark gap, padded to the same width."""
    width = max(first.shape[1], second.shape[1])

    def padded(sheet: np.ndarray) -> np.ndarray:
        return np.pad(sheet, ((0, 0), (0, width - sheet.shape[1]), (0, 0)))

    gap = np.full((GAP, width, 3), 24, np.uint8)
    return np.concatenate([padded(first), gap, padded(second)], 0)


def render_strip(world: LiveWorld, states: EpisodeStates, count: int = STRIP_FRAMES) -> RenderedStrip:
    """Pictures of the episode at a fixed interval and at its failure, from a camera following the body."""
    model = world.model
    data = mujoco.MjData(model)
    renderer = open_renderer(model, FRAME_WIDTH, FRAME_HEIGHT)
    indices = strip_indices(states, count)
    pictures: list[StripPicture] = []
    cells: list[tuple[np.ndarray, bool]] = []
    try:
        for index in indices:
            data.qpos[:] = states.qpos[index]
            data.time = states.times[index]
            mujoco.mj_forward(model, data)
            zones = scene_description(world.compiled, 0, live=data).zones
            pixels = render_pixels(renderer, data, chase(world, data, FRAME_WIDTH, FRAME_HEIGHT), zones)
            if is_blank(pixels):
                continue
            failure = index == states.failure_index
            pictures.append(StripPicture(round(float(states.times[index]), 2), failure, encode_png(pixels)))
            cells.append((pixels.copy(), failure))
    finally:
        release_renderer(renderer)
    total = states.times[-1] - states.times[0] if len(states.times) > 1 else 0.0
    interval = round(total / (count - 1), 2) if count > 1 else 0.0
    return RenderedStrip(pictures, interval, strip_sheet(cells))
