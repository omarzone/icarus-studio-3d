from icarus.contracts.project import Project
from icarus.contracts.training import WarmStart
from icarus.sim.env import ProjectEnv
from icarus.training.run_store import RunStore, UnknownRun


def sizes(project: Project) -> tuple[int, int]:
    """How many values the body senses and how many motors it drives: what a brain is shaped by."""
    env = ProjectEnv(project)
    observations, actions = env.observation_space.shape, env.action_space.shape
    assert observations is not None and actions is not None
    return observations[0], actions[0]


def _layers(layers: list[int]) -> str:
    return " and ".join(str(size) for size in layers)


def warm_start_problem(store: RunStore, project: Project, warm: WarmStart) -> str | None:
    """Why a run of this project cannot continue from that checkpoint, in one sentence; None when it can. The
    checkpoint may come from another project when its brain has the same layers, senses and motors."""
    try:
        folder = store.folder(warm.run_id)
    except UnknownRun:
        return f"There is no run {warm.run_id!r} to continue from."
    source = folder.stored_status()
    if not folder.checkpoint_path(warm.step).is_file():
        return f"{source.name} has no saved brain at step {warm.step:,}."
    was = folder.project()
    if project.brain.layers != was.brain.layers:
        return (
            f"The brain now has layers of {_layers(project.brain.layers)} neurons and had {_layers(was.brain.layers)} "
            f"in {source.name}, so that brain cannot continue; train from zero."
        )
    (sensed, motors), (was_sensed, was_motors) = sizes(project), sizes(was)
    if sensed != was_sensed:
        return (
            f"The body now senses {sensed} values and senses {was_sensed} in {source.name}, so that brain cannot "
            "continue; train from zero."
        )
    if motors != was_motors:
        return (
            f"The body now drives {motors} motors and drove {was_motors} in {source.name}, so that brain cannot "
            "continue; train from zero."
        )
    return None


def brain_start(project: Project, start: WarmStart | None) -> WarmStart | None:
    """What a new run continues from: the one it asks for, else the trained brain the project starts from."""
    if start is not None or project.brain.start_from is None:
        return start
    return WarmStart(run_id=project.brain.start_from.run_id, step=project.brain.start_from.step)
