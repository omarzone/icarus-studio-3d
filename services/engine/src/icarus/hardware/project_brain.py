"""The trained brain of a project's revision, and the hardware check that measures it."""

from dataclasses import dataclass
from pathlib import Path

from icarus.contracts.build import ExportBrain, HardwareCheck
from icarus.contracts.project import Project, ProjectState
from icarus.hardware.check import check_hardware
from icarus.hardware.demands import BodyNeeds, body_needs
from icarus.library.hardware import kit
from icarus.sim.model_state import CONTROL_PERIOD
from icarus.training.run_store import RunStore


@dataclass(frozen=True)
class TrainedBrain:
    run_id: str
    run_name: str
    step: int
    checkpoint: Path
    # The run's frozen project, which the checkpoint's observations and actions match.
    project: Project

    @property
    def label(self) -> str:
        return f"{self.run_name} at step {self.step:,}, one evaluation episode"

    def info(self, inputs: int, outputs: int) -> ExportBrain:
        return ExportBrain(
            run_id=self.run_id,
            run_name=self.run_name,
            step=self.step,
            inputs=inputs,
            outputs=outputs,
            rate_hz=1 / CONTROL_PERIOD,
        )


def trained_brain(state: ProjectState, runs: RunStore) -> TrainedBrain | None:
    """The best checkpoint of the newest ended run of the revision, as Play uses it; None before any training."""
    project = state.project
    found = runs.trained_checkpoint(project.id, state.revision.number, project)
    if found is None:
        return None
    status, path = found
    return TrainedBrain(status.run_id, status.name, status.best_step or 0, path, runs.folder(status.run_id).project())


_CACHE_SIZE = 8
_measured: dict[tuple[str, str, int], BodyNeeds] = {}


def project_needs(state: ProjectState, runs: RunStore) -> BodyNeeds:
    """The body's needs, measured with the trained brain when there is one; cached, since measuring runs it."""
    brain = trained_brain(state, runs)
    key = (
        state.project.model_dump_json(),
        str(brain.checkpoint) if brain else "",
        brain.checkpoint.stat().st_mtime_ns if brain else 0,
    )
    if key not in _measured:
        if len(_measured) >= _CACHE_SIZE:
            _measured.pop(next(iter(_measured)))
        _measured[key] = body_needs(state.project, (brain.project, brain.checkpoint, brain.label) if brain else None)
    return _measured[key]


def hardware_check(
    state: ProjectState, runs: RunStore, kit_id: str | None = None, skipped: frozenset[str] = frozenset()
) -> HardwareCheck:
    needs = project_needs(state, runs)
    return check_hardware(state.project.id, state.revision.number, needs, kit(kit_id) if kit_id else None, skipped)
