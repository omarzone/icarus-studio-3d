"""Where a world's tries start: the spawn points and how the first one says to use them (see sim/start_pose.py)."""

from dataclasses import dataclass

import mujoco

from icarus.contracts.project import Project
from icarus.design.compiler import CompiledModel
from icarus.design.components import view
from icarus.design.free_map import FreeMap, free_map, starts_anywhere


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
    # The free places Start anywhere (or Start area at 0 × 0) draws from, built once per compiled world.
    free: FreeMap | None = None


def spawn_plan(project: Project, compiled: CompiledModel) -> SpawnPlan | None:
    """How tries start, from the world's first spawn point; every spawn point is a spot to start at."""
    model = compiled.model
    spots: list[SpawnSpot] = []
    mode: str | None = None
    free: FreeMap | None = None
    for obj in project.world.objects:
        spawn = view(obj, "spawn_point")
        site = int(mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_SITE, f"{obj.id}:spawn_point"))
        if spawn is None or site < 0:
            continue
        if mode is None:
            mode = spawn.text("mode")
            if starts_anywhere(spawn):
                mode, free = "anywhere", free_map(project, compiled, spawn.number("goal_distance"))
        width, depth, _ = spawn.vector("area")
        spots.append(SpawnSpot(site, (width, depth), spawn.number("heading_range"), spawn.switch("random_heading")))
    return SpawnPlan(mode, tuple(spots), free) if mode is not None else None
