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


def warm_start_problem(store: RunStore, project: Project, warm: WarmStart) -> str | None:
    """Why a run of this project cannot continue from that checkpoint, in one sentence; None when it can."""
    try:
        folder = store.folder(warm.run_id)
    except UnknownRun:
        return f"There is no run {warm.run_id!r} to continue from."
    source = folder.stored_status()
    if source.project_id != project.id:
        return f"{source.name} belongs to another project, so its brain cannot continue here."
    if not folder.checkpoint_path(warm.step).is_file():
        return f"{source.name} has no saved brain at step {warm.step:,}."
    (sensed, motors), (was_sensed, was_motors) = sizes(project), sizes(folder.project())
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
