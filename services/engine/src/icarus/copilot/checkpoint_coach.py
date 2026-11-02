"""The coach's short comment at each checkpoint of a coached run; a diagnosis task only when a watch rule fires."""

from collections.abc import Callable

from icarus.contracts.copilot import RunCard
from icarus.copilot.agent.turn import new_message
from icarus.copilot.chat import Copilot
from icarus.copilot.coach import DEFAULT_GOAL
from icarus.copilot.coach_words import percent
from icarus.training.progress_watch import checkpoint_results, watch
from icarus.training.run_store import RunStore

DiagnosisStarter = Callable[[str, int], None]


class CheckpointCoach:
    """Posts what each checkpoint measured, from the run's own evaluation, and never calls a model by itself."""

    def __init__(self, copilot: Copilot, runs: RunStore, diagnose: DiagnosisStarter) -> None:
        self._copilot = copilot
        self._runs = runs
        self._diagnose = diagnose
        self._fired: dict[str, set[str]] = {}

    def comment(self, run_id: str, step: int) -> None:
        folder = self._runs.folder(run_id)
        status = folder.status()
        results = [result for result in checkpoint_results(folder) if result.step <= step]
        current = next((result for result in reversed(results) if result.step == step), None)
        if current is None:
            return
        language = self._copilot.language(status.project_id)
        findings = watch(results, DEFAULT_GOAL)
        fired = self._fired.setdefault(run_id, set())
        new = [finding for finding in findings if finding.rule not in fired]
        fired |= {finding.rule for finding in new}
        success = percent(current.success, language) if current.success is not None else None
        if language == "es":
            text = f"{status.name}, paso {step:,}: retorno {current.episode_return:.2f}"
            text += f", éxito {success}." if success else "."
        else:
            text = f"{status.name} at step {step:,}: return {current.episode_return:.2f}"
            text += f", success {success}." if success else "."
        if new:
            text = f"{text} {' '.join(finding.reason for finding in new)}"
        message = new_message(
            "copilot", text, title=f"Checkpoint {step:,}", run=RunCard(run_id=run_id, milestone_step=step)
        )
        self._copilot.post(status.project_id, message, [])
        if new:
            self._diagnose(run_id, step)
