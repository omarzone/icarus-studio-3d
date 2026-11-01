from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.training import MAX_COPIES, MAX_STEPS, StartRun
from icarus.projects.store import ProjectStore
from icarus.training.run_store import TERMINAL_STATES, RunStore
from icarus.training.schedule import RECOMMENDED_STEPS
from icarus.training.settings import TrainingSettingsStore
from icarus.training.supervisor import NotTrainable, RunInProgress, Supervisor


class TrainingRequest(BaseModel):
    """Start or stop training, asked for by the person in the chat."""

    model_config = ConfigDict(extra="forbid")

    action: Literal["start", "stop"]
    total_steps: int | None = Field(default=None, ge=10_000, le=MAX_STEPS)
    copies: int | None = Field(default=None, ge=1, le=MAX_COPIES)


class ChatTrainer:
    """Starts and stops runs for the copilot through the same supervisor and checks as the Train button."""

    def __init__(
        self, projects: ProjectStore, runs: RunStore, supervisor: Supervisor, settings: TrainingSettingsStore
    ) -> None:
        self._projects = projects
        self._runs = runs
        self._supervisor = supervisor
        self._settings = settings

    def act(self, project_id: str, request: TrainingRequest) -> str:
        """What happened, in one sentence for the copilot's answer."""
        match request.action:
            case "start":
                return self._start(project_id, request)
            case "stop":
                return self._stop(project_id)

    def _start(self, project_id: str, request: TrainingRequest) -> str:
        state = self._projects.state(project_id)
        project = state.project
        if project.task.family == "none":
            return "I did not start training: this project has no task to learn yet."
        steps = request.total_steps or RECOMMENDED_STEPS[project.task.family]
        copies = request.copies or min(project.brain.copies, MAX_COPIES)
        settings = self._settings.get()
        try:
            status = self._supervisor.start(
                state, StartRun(total_steps=steps, copies=copies), settings.threads, settings.use_graphics_card
            )
        except RunInProgress as running:
            name = self._runs.folder(running.run_id).status().name
            return f"{name} is already training, so I did not start another run. Ask me to stop it first."
        except NotTrainable as error:
            return f"I did not start training: {error}."
        return f"I started {status.name}: {status.total_steps:,} steps with {status.copies} copies."

    def _stop(self, project_id: str) -> str:
        self._projects.state(project_id)
        training = [status for status in self._runs.list_runs(project_id) if status.state not in TERMINAL_STATES]
        if not training:
            return "No run of this project is training, so there was nothing to stop."
        for status in training:
            self._supervisor.stop(status.run_id)
        names = ", ".join(status.name for status in training)
        return f"I asked {names} to stop; it keeps its best checkpoint."
