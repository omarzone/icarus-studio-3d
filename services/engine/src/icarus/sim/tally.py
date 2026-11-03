from dataclasses import dataclass


@dataclass
class Tally:
    """Counts across the tries of one world that displays show: kept by the environment and by Play."""

    tries: int = 0
    successes: int = 0
    # This try's return so far, and the agent's distance to the goal when it started.
    episode_return: float = 0.0
    start_distance: float | None = None
    # The brain's training steps: the live run's, the replayed checkpoint's or Play's brain; None when unknown.
    training_steps: int | None = None

    def start_try(self, distance: float | None) -> None:
        self.tries += 1
        self.episode_return = 0.0
        self.start_distance = distance
