import random


def retry_delay(attempt: int, *, jitter: float | None = None) -> float:
    if attempt < 1:
        raise ValueError('attempt must be positive')
    return min(300, 2 ** min(attempt, 9)) + (random.uniform(0, 1) if jitter is None else jitter)
