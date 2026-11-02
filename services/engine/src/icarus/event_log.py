"""Rotating JSON-lines log of every engine event, for debugging and the timelapse."""

import logging
import threading
from pathlib import Path

from icarus.contracts.events import EngineEventEnvelope
from icarus.events import EventBus, Subscription

LOG_NAME = "events"
DEFAULT_MAX_BYTES = 5_000_000
DEFAULT_KEEP = 3
WAIT_PERIOD = 1.0

logger = logging.getLogger(__name__)


class EventLog:
    """Writes on its own thread so a slow disk never slows down whoever publishes."""

    def __init__(
        self, bus: EventBus, folder: Path, max_bytes: int = DEFAULT_MAX_BYTES, keep: int = DEFAULT_KEEP
    ) -> None:
        self._bus = bus
        self._folder = folder
        self._max_bytes = max_bytes
        self._keep = keep
        self._subscription: Subscription | None = None
        self._thread: threading.Thread | None = None

    @property
    def path(self) -> Path:
        return self._folder / f"{LOG_NAME}.jsonl"

    def start(self) -> None:
        self._subscription = self._bus.subscribe()
        self._thread = threading.Thread(target=self._follow, args=(self._subscription,), name="event-log", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        """Unsubscribes and waits until every event already received is written."""
        if self._subscription is not None:
            self._bus.unsubscribe(self._subscription)
        if self._thread is not None:
            self._thread.join()
        self._subscription = None
        self._thread = None

    def write(self, envelope: EngineEventEnvelope) -> None:
        line = f"{envelope.model_dump_json()}\n".encode()
        self._folder.mkdir(parents=True, exist_ok=True)
        size = self.path.stat().st_size if self.path.exists() else 0
        if size and size + len(line) > self._max_bytes:
            self._rotate()
        with self.path.open("ab") as file:
            file.write(line)

    def _follow(self, subscription: Subscription) -> None:
        failing = False
        while True:
            envelope = subscription.get(timeout=WAIT_PERIOD)
            if envelope is None:
                if subscription.closed:
                    return
                continue
            try:
                self.write(envelope)
            except OSError:
                # Log only when writing starts failing, so a full disk does not flood the console.
                if not failing:
                    logger.exception("Event log %s is not writable; events are skipped until it is", self.path)
                failing = True
            else:
                failing = False

    def _rotate(self) -> None:
        self._numbered(self._keep).unlink(missing_ok=True)
        for number in range(self._keep - 1, 0, -1):
            if self._numbered(number).exists():
                self._numbered(number).replace(self._numbered(number + 1))
        self.path.replace(self._numbered(1))

    def _numbered(self, number: int) -> Path:
        return self._folder / f"{LOG_NAME}.{number}.jsonl"
