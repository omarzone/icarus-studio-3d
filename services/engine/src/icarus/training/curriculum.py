from collections import deque

from icarus.contracts.specs import TaskSpec


class StagePromotion:
    """Which curriculum stage training practices, moved on once enough of the stage's latest tries succeeded."""

    def __init__(self, task: TaskSpec) -> None:
        self.stages = task.curriculum
        self.stage = 0
        self._outcomes: deque[bool] = self._window()

    @property
    def active(self) -> bool:
        return bool(self.stages)

    def _window(self) -> deque[bool]:
        return deque(maxlen=self.stages[self.stage].promote.episodes if self.stages else 1)

    def add(self, success: bool) -> float | None:
        """Count one finished try of the current stage; when it passes the stage on to the next, the success rate
        over the stage's last tries that earned it."""
        if self.stage >= len(self.stages) - 1:
            return None
        self._outcomes.append(success)
        rule = self.stages[self.stage].promote
        rate = sum(self._outcomes) / len(self._outcomes)
        if len(self._outcomes) < rule.episodes or rate < rule.success_rate:
            return None
        self.stage += 1
        self._outcomes = self._window()
        return rate
