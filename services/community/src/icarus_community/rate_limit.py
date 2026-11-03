import threading
import time
from collections import defaultdict, deque


class WriteLimiter:
    """At most `per_minute` writes per account (or address) in any sliding minute, kept in memory per process."""

    def __init__(self, per_minute: int, clock=time.monotonic) -> None:  # type: ignore[no-untyped-def]
        self._limit = per_minute
        self._clock = clock
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = self._clock()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] >= 60:
                hits.popleft()
            if len(hits) >= self._limit:
                return False
            hits.append(now)
            return True
