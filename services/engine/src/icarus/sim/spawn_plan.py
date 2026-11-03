"""Where a world's tries start: the spawn points and how the first one says to use them (see sim/start_pose.py)."""

from dataclasses import dataclass

import mujoco

from icarus.contracts.project import Project
from icarus.design.components import view


@dataclass(frozen=True)
class SpawnSpot:
    """One spawn point: its site, the rectangle around it a try may start in and how far the heading may turn."""

    site: int
    area: tuple[float, float]
    heading_range: float
    any_heading: bool


@dataclass(frozen=True)
class SpawnPlan:
    mode: str
    spots: tuple[SpawnSpot, ...]


def spawn_plan(project: Project, model: mujoco.MjModel) -> SpawnPlan | None:
    """How tries start, from the world's first spawn point; every spawn point is a spot to start at."""
    spots: list[SpawnSpot] = []
    mode: str | None = None
    for obj in project.world.objects:
        spawn = view(obj, "spawn_point")
        site = int(mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_SITE, f"{obj.id}:spawn_point"))
        if spawn is None or site < 0:
            continue
        mode = mode or spawn.text("mode")
        width, depth, _ = spawn.vector("area")
        spots.append(SpawnSpot(site, (width, depth), spawn.number("heading_range"), spawn.switch("random_heading")))
    return SpawnPlan(mode, tuple(spots)) if mode is not None else None
