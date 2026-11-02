import math

import mujoco
import numpy as np

from icarus.design.scene import scene_description
from icarus.sim.model_state import LiveWorld
from icarus.sim.views import CameraSpec, encode_png, is_blank, open_renderer, release_renderer, render_pixels
from icarus.training.evaluation import EpisodeStates

WIDTH, HEIGHT = 640, 400
# Degrees: the camera stands behind and to the side of the body, looking down at it.
CHASE_AZIMUTH = 35.0
CHASE_ELEVATION = -30.0
# The camera frames the body and, when it is this close, the goal with it.
GOAL_FRAMED_WITHIN = 12.0
MIN_DISTANCE, MAX_DISTANCE = 2.0, 18.0
SHEET_ORDER = ("start", "middle", "failure", "end")


def moments(states: EpisodeStates) -> list[tuple[str, int]]:
    """Start, middle, the moment it touched something or fell, and the end; a fall is its own end."""
    last = len(states.qpos) - 1
    picked = [("start", 0), ("middle", last // 2)]
    failure = states.failure_index
    if failure is not None and 0 < failure < last:
        picked += [("failure", failure), ("end", last)]
    elif failure == last:
        picked.append(("failure", last))
    else:
        picked.append(("end", last))
    return picked


def chase(world: LiveWorld, data: mujoco.MjData, width: int = WIDTH, height: int = HEIGHT) -> CameraSpec:
    """A camera that follows the body, keeping the goal in the picture while it is near."""
    agent = world.agent if world.agent is not None else 0
    position = data.xpos[agent].copy()
    rotation = data.xmat[agent].reshape(3, 3)
    heading = math.degrees(math.atan2(rotation[1, 0], rotation[0, 0]))
    extent = (
        max(
            (float(np.linalg.norm(data.geom_xpos[geom] - position)) + float(world.model.geom_rbound[geom]))
            for geom in world.agent_geoms
        )
        if world.agent_geoms
        else 1.0
    )
    distance = 4 * extent
    lookat = position
    if world.goal is not None:
        goal = data.site_xpos[world.goal.site]
        gap = float(np.linalg.norm(goal[:2] - position[:2]))
        if gap <= GOAL_FRAMED_WITHIN:
            lookat = (position + goal) / 2
            distance = max(distance, 1.3 * gap + 2 * extent)
    distance = min(MAX_DISTANCE, max(MIN_DISTANCE, distance))
    target = (float(lookat[0]), float(lookat[1]), float(lookat[2]))
    return CameraSpec(target, distance, heading + CHASE_AZIMUTH, CHASE_ELEVATION, width, height)


def sheet(pictures: dict[str, np.ndarray]) -> np.ndarray:
    """The moments of one episode at half size in a 2x2 grid, in time order; a missing moment stays dark."""
    cells = [pictures[name][::2, ::2] for name in SHEET_ORDER if name in pictures]
    blank = np.zeros((HEIGHT // 2, WIDTH // 2, 3), np.uint8)
    cells += [blank] * (4 - len(cells))
    return np.concatenate([np.concatenate(cells[:2], 1), np.concatenate(cells[2:4], 1)], 0)


def render_frames(world: LiveWorld, recorded: list[EpisodeStates]) -> list[dict[str, bytes]]:
    """PNG pictures of each recorded episode by moment, plus its "sheet", seen by a camera following the body."""
    model = world.model
    data = mujoco.MjData(model)
    renderer = open_renderer(model, WIDTH, HEIGHT)
    try:
        rendered: list[dict[str, bytes]] = []
        for states in recorded:
            pictures: dict[str, np.ndarray] = {}
            for name, index in moments(states):
                data.qpos[:] = states.qpos[index]
                data.time = states.times[index]
                mujoco.mj_forward(model, data)
                zones = scene_description(world.compiled, 0, live=data).zones
                pixels = render_pixels(renderer, data, chase(world, data), zones)
                if not is_blank(pixels):
                    pictures[name] = pixels.copy()
            files = {name: encode_png(pixels) for name, pixels in pictures.items()}
            if pictures:
                files["sheet"] = encode_png(sheet(pictures))
            rendered.append(files)
        return rendered
    finally:
        release_renderer(renderer)
