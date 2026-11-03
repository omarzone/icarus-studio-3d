import json
import time
from dataclasses import dataclass

import mujoco
import numpy as np

from icarus.contracts.operations import EditOperation
from icarus.contracts.project import Project
from icarus.copilot.client import CopilotError, ModelClient
from icarus.copilot.scratch_plan import (
    PlanBody,
    PlanTask,
    PlanWorld,
    ScratchPlan,
    agent_start,
    body_operations,
    task_operations,
    world_operations,
)
from icarus.design.checks import design_report
from icarus.design.compiler import CompileError, compile_project, is_ground
from icarus.library.templates import template_operations
from icarus.projects.operations import OperationError, apply_operations, empty_project
from icarus.sim.env import ProjectEnv
from icarus.sim.model_state import CONTROL_PERIOD

PREVIEW_ID = "000000000000"
# A body may start a little inside the ground (contact softness) or drop onto it from this high.
SINK_TOLERANCE = 0.02
DROP_LIMIT = 0.5
# An episode that ends this soon with the motors still is too short for anything to be learned.
SHORTEST_EPISODE_SECONDS = 0.5
RANDOM_STEPS = 40
# The body must get this far, in metres, under some steady or random command within the drive test.
SHORTEST_DRIVE = 0.05
DRIVE_STEPS = 40

FIX = """The stage "{label}" of the design "{title}" failed its tests:
{problem}
The project so far (JSON): {project}
The {section} you planned (JSON): {current}
Return the corrected {section} only, keeping its ids unless the problem is about them."""


@dataclass(frozen=True)
class Stage:
    id: str
    label: str
    operations: list[EditOperation]


@dataclass(frozen=True)
class ScratchDesign:
    """A from-scratch plan and the stages that build it, each tested on top of the ones before."""

    plan: ScratchPlan
    stages: list[Stage]


class StageFailed(Exception):
    pass


def plan_stages(plan: ScratchPlan) -> list[Stage]:
    stages = [Stage("world", "Building the world", world_operations(plan.world, agent_start(plan)))]
    stages += [Stage(f"body:{body.id}", f"Building {body.name}", body_operations(body)) for body in plan.bodies]
    return [*stages, Stage("task", "Setting the task", task_operations(plan.task))]


def starting_project(title: str) -> Project:
    return apply_operations(empty_project(PREVIEW_ID, title), template_operations("empty_world"))


def _bottom(model: mujoco.MjModel, data: mujoco.MjData, geom: int) -> float:
    """The lowest point of a geom's box at the initial pose."""
    center, half = model.geom_aabb[geom, :3], model.geom_aabb[geom, 3:]
    rotation = data.geom_xmat[geom].reshape(3, 3)
    return float((data.geom_xpos[geom] + rotation @ center)[2] - np.abs(rotation[2]) @ half)


def placement_problem(project: Project, body_id: str) -> str | None:
    """Why a body does not start resting on the ground clear of everything else, or None."""
    body = next(item for item in project.bodies if item.id == body_id)
    compiled = compile_project(project)
    model = compiled.model
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    names = {obj.id: obj.name for obj in body.objects}
    mine = [index for index in range(model.ngeom) if model.body(int(model.geom_bodyid[index])).name in names]
    planes = {index for index in range(model.ngeom) if is_ground(compiled, index)}
    if not mine:
        return f"{body.name} has no solid parts"
    lowest = min(_bottom(model, data, index) for index in mine)
    if lowest < -SINK_TOLERANCE:
        return f"{body.name} starts {-lowest:.2f} m inside the ground; raise its root part"
    if lowest > DROP_LIMIT:
        return f"{body.name} starts {lowest:.2f} m above the ground; lower its root part so it rests on the ground"
    for contact in data.contact[: data.ncon]:
        first, second = int(contact.geom1), int(contact.geom2)
        if first in planes or second in planes or (first not in mine and second not in mine):
            continue
        return f"{model.geom(first).name} and {model.geom(second).name} overlap at the start; move them apart"
    return None


def trainability_problem(project: Project) -> str | None:
    """Why reinforcement learning cannot work on this project, or None: it must build, last and stay finite."""
    try:
        env = ProjectEnv(project)
    except (ValueError, CompileError) as error:
        return str(error)
    env.reset(seed=0)
    size = len(env.world.actuators)
    still = np.zeros(size, dtype=np.float32)
    steps = round(SHORTEST_EPISODE_SECONDS / CONTROL_PERIOD)
    for _ in range(steps):
        _, _, terminated, _, info = env.step(still)
        if terminated:
            ending = "reaches the goal" if info.get("is_success") else "falls"
            return f"The body {ending} within {SHORTEST_EPISODE_SECONDS:g} s without moving, so episodes are too short"
    rng = np.random.default_rng(0)
    env.reset(seed=0)
    for _ in range(RANDOM_STEPS):
        observation, reward, terminated, truncated, _ = env.step(rng.uniform(-1, 1, size))
        if not (np.all(np.isfinite(observation)) and np.isfinite(reward)):
            return "Random motor commands make the physics blow up"
        if terminated or truncated:
            env.reset(seed=0)
    return _drive_problem(env, rng, size)


def _drive_problem(env: ProjectEnv, rng: np.random.Generator, size: int) -> str | None:
    """Why the motors cannot move the body across the ground, or None: weak wheels leave nothing to learn."""
    world = env.world
    assert world.agent is not None
    commands = [lambda: np.ones(size), lambda: -np.ones(size), lambda: rng.uniform(-1, 1, size)]
    farthest = 0.0
    for command in commands:
        env.reset(seed=0)
        start = world.data.xpos[world.agent][:2].copy()
        for _ in range(DRIVE_STEPS):
            _, _, terminated, _, _ = env.step(command())
            farthest = max(farthest, float(np.linalg.norm(world.data.xpos[world.agent][:2] - start)))
            if terminated:
                break
    if farthest < SHORTEST_DRIVE:
        seconds = DRIVE_STEPS * CONTROL_PERIOD
        return f"The motors cannot move the body: it travels {farthest:.2f} m in {seconds:g} s at full power"
    return None


def _report_problem(project: Project) -> str | None:
    report, _ = design_report(project)
    if report.ok:
        return None
    return "; ".join(f"{check.label}: {check.detail}" for check in report.checks if check.status == "fail")


def stage_problem(project: Project, stage: Stage, plan: ScratchPlan) -> str | None:
    """Why a stage applied to the project fails: design tests always, then what that stage must make true."""
    problem = _report_problem(project)
    if problem:
        return problem
    if (
        stage.id == "world"
        and plan.task.family == "navigation"
        and plan.world.goal is None
        and plan.world.layout is None
    ):
        return "A navigation task needs a goal in the world"
    if stage.id.startswith("body:"):
        return placement_problem(project, stage.id.removeprefix("body:"))
    if stage.id == "task":
        return trainability_problem(project)
    return None


def project_summary(project: Project) -> str:
    """What the repair needs to see: objects with their places, bodies with their parts, and the task."""
    positions = {}
    try:
        compiled = compile_project(project)
        data = mujoco.MjData(compiled.model)
        mujoco.mj_forward(compiled.model, data)
        positions = {
            compiled.model.body(index).name: [round(float(value), 2) for value in data.xpos[index]]
            for index in range(1, compiled.model.nbody)
        }
    except CompileError:
        pass
    summary = {
        "world": {obj.id: positions.get(obj.id) for obj in project.world.objects},
        "bodies": {body.id: {obj.id: positions.get(obj.id) for obj in body.objects} for body in project.bodies},
        "task": {"family": project.task.family, "rewards": [term.term for term in project.task.rewards]},
    }
    return json.dumps(summary, ensure_ascii=False, separators=(",", ":"))


def _section(plan: ScratchPlan, stage: Stage) -> PlanWorld | PlanBody | PlanTask:
    if stage.id == "world":
        return plan.world
    if stage.id == "task":
        return plan.task
    return next(body for body in plan.bodies if f"body:{body.id}" == stage.id)


def _replace(plan: ScratchPlan, stage: Stage, section: PlanWorld | PlanBody | PlanTask) -> ScratchPlan:
    match section:
        case PlanWorld():
            return plan.model_copy(update={"world": section})
        case PlanTask():
            return plan.model_copy(update={"task": section})
        case PlanBody():
            bodies = [section if f"body:{body.id}" == stage.id else body for body in plan.bodies]
            return plan.model_copy(update={"bodies": bodies})


def _repaired(
    client: ModelClient, system: str, title: str, plan: ScratchPlan, stage: Stage, problem: str, base: Project, deadline
) -> ScratchPlan | None:
    current = _section(plan, stage)
    kind = type(current)
    name = {PlanWorld: "world", PlanBody: "body", PlanTask: "task"}[kind]
    fix = FIX.format(
        label=stage.label,
        title=title,
        problem=problem,
        project=project_summary(base),
        section=name,
        current=current.model_dump_json(),
    )
    try:
        fixed = client.ask(f"scratch_{name}_fix", kind, system, fix, deadline=deadline).value
    except CopilotError:
        return None
    if isinstance(fixed, PlanBody) and isinstance(current, PlanBody):
        # The stage keeps its body id, so later stages still find it.
        fixed = fixed.model_copy(update={"id": current.id})
    return _replace(plan, stage, fixed)


def _tried(project: Project, stage: Stage, plan: ScratchPlan) -> tuple[Project | None, str | None]:
    try:
        candidate = apply_operations(project, stage.operations)
    except OperationError as error:
        return None, str(error)
    return candidate, stage_problem(candidate, stage, plan)


def assemble(client: ModelClient, system: str, title: str, plan: ScratchPlan, deadline: float) -> ScratchDesign:
    """Apply the plan stage by stage to an in-memory project, repairing a failing stage once, or StageFailed."""
    project = starting_project(title)
    for index in range(len(plan_stages(plan))):
        stage = plan_stages(plan)[index]
        candidate, problem = _tried(project, stage, plan)
        if problem and time.monotonic() < deadline:
            fixed = _repaired(client, system, title, plan, stage, problem, project, deadline)
            if fixed is not None:
                plan = fixed
                stage = plan_stages(plan)[index]
                candidate, again = _tried(project, stage, plan)
                problem = f"{problem}; after the repair: {again}" if again else None
        if problem or candidate is None:
            raise StageFailed(f"{stage.label}: {problem}")
        project = candidate
    return ScratchDesign(plan, plan_stages(plan))
