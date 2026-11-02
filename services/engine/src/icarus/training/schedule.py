FIRST_MARK = 25_000
# Each decade gets marks at 1, 2 and 4 times its first one: 25k, 50k, 100k, 250k, 500k, 1M, ...
_DECADE = (1, 2, 4)


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
