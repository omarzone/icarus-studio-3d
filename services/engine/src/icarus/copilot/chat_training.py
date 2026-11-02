from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.training import MAX_COPIES, MAX_STEPS, StartRun, WarmStart
from icarus.copilot.language import Language, count, say
from icarus.projects.store import ProjectStore
from icarus.training.run_store import TERMINAL_STATES, RunStore
from icarus.training.schedule import RECOMMENDED_STEPS
from icarus.training.settings import TrainingSettingsStore
from icarus.training.supervisor import NotTrainable, RunInProgress, Supervisor, WarmStartRefused


class TrainingRequest(BaseModel):
    """Start or stop training, asked for by the person in the chat."""

    model_config = ConfigDict(extra="forbid")

    action: Literal["start", "stop"]
    total_steps: int | None = Field(default=None, ge=10_000, le=MAX_STEPS)
    copies: int | None = Field(default=None, ge=1, le=MAX_COPIES)
    # Continue from the best brain of the latest run that has one, when the body still senses and acts the same way.
    continue_from_best: bool = False
    # The copilot watches the run, looks at its first checkpoints and fixes what blocks learning; on unless asked off.
    coach: bool = True


@dataclass(frozen=True)
class TrainerReply:
    # One sentence for the copilot's answer, in the person's language.
    text: str
    # Whether a run started or was asked to stop.
    acted: bool


class ChatTrainer:
    """Starts and stops runs for the copilot through the same supervisor and checks as the Train button."""

    def __init__(
        self, projects: ProjectStore, runs: RunStore, supervisor: Supervisor, settings: TrainingSettingsStore
    ) -> None:
        self._projects = projects
        self._runs = runs
        self._supervisor = supervisor
        self._settings = settings

    def act(self, project_id: str, request: TrainingRequest, language: Language = "en") -> TrainerReply:
        """What happened, in one sentence for the copilot's answer."""
        match request.action:
            case "start":
                return self._start(project_id, request, language)
            case "stop":
                return self._stop(project_id, language)

    def _start(self, project_id: str, request: TrainingRequest, language: Language) -> TrainerReply:
        state = self._projects.state(project_id)
        project = state.project
        if project.task.family == "none":
            return TrainerReply(say("train_no_task", language), False)
        steps = request.total_steps or RECOMMENDED_STEPS[project.task.family]
        copies = request.copies or min(project.brain.copies, MAX_COPIES)
        settings = self._settings.get()
        warm = self._best_brain(project_id) if request.continue_from_best else None
        if request.continue_from_best and warm is None:
            return TrainerReply(say("train_no_brain", language), False)
        try:
            status = self._supervisor.start(
                state,
                StartRun(total_steps=steps, copies=copies, warm_start=warm, coach=request.coach),
                settings.threads,
                settings.use_graphics_card,
            )
        except RunInProgress as running:
            name = self._runs.folder(running.run_id).status().name
            return TrainerReply(say("train_busy", language, name=name), False)
        except (NotTrainable, WarmStartRefused) as error:
            return TrainerReply(say("train_refused", language, reason=str(error).rstrip(".")), False)
        steps_text = count(status.total_steps, language)
        return TrainerReply(
            say("train_started", language, name=status.name, steps=steps_text, copies=status.copies), True
        )

    def _best_brain(self, project_id: str) -> WarmStart | None:
        """The best checkpoint of the newest ended run that trained one; a run's untrained step 0 does not count."""
        for status in self._runs.list_runs(project_id):
            if status.state not in TERMINAL_STATES or status.best_step is None:
                continue
            warm = self._runs.folder(status.run_id).config().warm_start
            if status.best_step > 0 or warm is not None:
                return WarmStart(run_id=status.run_id, step=status.best_step)
        return None

    def _stop(self, project_id: str, language: Language) -> TrainerReply:
        self._projects.state(project_id)
        training = [status for status in self._runs.list_runs(project_id) if status.state not in TERMINAL_STATES]
        if not training:
            return TrainerReply(say("train_nothing", language), False)
        for status in training:
            self._supervisor.stop(status.run_id)
        names = ", ".join(status.name for status in training)
        return TrainerReply(say("train_stopping", language, names=names), True)
