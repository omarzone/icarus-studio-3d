from icarus.contracts.project import Project
from icarus.contracts.specs import TaskFamily

FIRST_MARK = 25_000
# Each decade gets marks at 1, 2 and 4 times its first one: 25k, 50k, 100k, 250k, 500k, 1M, ...
_DECADE = (1, 2, 4)
# Steps per second measured for PPO on CPU with 16 copies (ADR 001).
STEPS_PER_SECOND = 2000
# The training budget a task family needs before its results say much.
RECOMMENDED_STEPS: dict[TaskFamily, int] = {
    "navigation": 1_000_000,
    "locomotion": 2_000_000,
    "imitation": 2_000_000,
    "none": 0,
}


def planned_steps(project: Project) -> int:
    """Steps a run practices when its request names none: the brain's own budget, else the task's recommended one."""
    return project.brain.training_steps or RECOMMENDED_STEPS[project.task.family]


def checkpoint_steps(total: int) -> list[int]:
    """Log-spaced checkpoint steps from the untrained brain at 0 up to and including the last step."""
    steps = [0]
    decade = FIRST_MARK
    while True:
        for factor in _DECADE:
            mark = decade * factor
            if mark >= total:
                return [*steps, total]
            steps.append(mark)
        decade *= 10
