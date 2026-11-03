"""The edit operations that make a project imitate a tracked clip: the imitation family, its reward terms and the
reference frozen in the task, so every run keeps the motion it learned."""

from icarus.contracts.motion import MotionReference
from icarus.contracts.operations import (
    EditOperation,
    RemoveRewardTerm,
    SetMotionReference,
    SetRewardTerm,
    SetTaskFamily,
)
from icarus.contracts.project import Project
from icarus.contracts.specs import RewardTermSpec
from icarus.library.rewards import term_fits

# Copying the clip pays most; staying up and not falling keep it from throwing itself into a pose.
IMITATION_REWARDS = (("track_motion", 1.0), ("stay_upright", 0.2), ("fall_penalty", -10.0), ("energy_cost", -0.001))


def imitation_operations(project: Project, reference: MotionReference) -> list[EditOperation]:
    operations: list[EditOperation] = []
    if project.task.family != "imitation":
        operations.append(SetTaskFamily(op="set_task_family", family="imitation"))
        operations += [
            RemoveRewardTerm(op="remove_reward_term", term=term.term)
            for term in project.task.rewards
            if not term_fits(term.term, "imitation")
        ]
    has = {term.term for term in project.task.rewards if term_fits(term.term, "imitation")}
    operations += [
        SetRewardTerm(op="set_reward_term", term=RewardTermSpec(term=term, weight=weight))
        for term, weight in IMITATION_REWARDS
        if term not in has
    ]
    if project.task.motion != reference:
        operations.append(SetMotionReference(op="set_motion_reference", reference=reference))
    return operations
