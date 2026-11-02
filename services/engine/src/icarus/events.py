"""In-process event bus: every meaningful engine change is published once and fanned out to subscribers."""

import threading
from collections import deque
from collections.abc import Callable
from datetime import UTC, datetime
from uuid import uuid4

from icarus.contracts.events import EngineEvent, EngineEventEnvelope

DEFAULT_QUEUE_SIZE = 1000


class Subscription:
    """A bounded queue of envelopes for one listener; a full queue drops its oldest envelope."""

    def __init__(
        self,
        project_id: str | None,
        types: frozenset[str] | None,
        queue_size: int,
        on_ready: Callable[[], None] | None,
    ) -> None:
        self.project_id = project_id
        self.types = types
        self.dropped = 0
        self.closed = False
        self._queue: deque[EngineEventEnvelope] = deque(maxlen=queue_size)
        self._ready = threading.Condition()
        self._on_ready = on_ready

    def wants(self, envelope: EngineEventEnvelope) -> bool:
        if self.types is not None and envelope.event.type not in self.types:
            return False
        return self.project_id is None or envelope.project_id in (None, self.project_id)

    def deliver(self, envelope: EngineEventEnvelope) -> None:
        with self._ready:
            if self.closed:
                return
            if len(self._queue) == self._queue.maxlen:
                self.dropped += 1
            self._queue.append(envelope)
            self._ready.notify_all()
        if self._on_ready is not None:
            self._on_ready()

    def get(self, timeout: float | None = None) -> EngineEventEnvelope | None:
        """Next envelope, waiting up to `timeout`; None on timeout or once closed and empty."""
        with self._ready:
            self._ready.wait_for(lambda: self._queue or self.closed, timeout)
            return self._queue.popleft() if self._queue else None

    def drain(self) -> list[EngineEventEnvelope]:
        with self._ready:
            envelopes = list(self._queue)
            self._queue.clear()
            return envelopes

    def close(self) -> None:
        """Stops new deliveries; envelopes already queued can still be read."""
        with self._ready:
            self.closed = True
            self._ready.notify_all()
        if self._on_ready is not None:
            self._on_ready()


class EventBus:
    """Publishing is synchronous and never blocks on a subscriber: each one has its own bounded queue."""

    def __init__(self, queue_size: int = DEFAULT_QUEUE_SIZE) -> None:
        self._queue_size = queue_size
        self._subscriptions: list[Subscription] = []
        self._lock = threading.Lock()
        self._closed = False

    @property
    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subscriptions)

    def publish(self, event: EngineEvent, project_id: str | None) -> EngineEventEnvelope:
        envelope = EngineEventEnvelope(id=uuid4().hex, time=datetime.now(UTC), project_id=project_id, event=event)
        with self._lock:
            listeners = [subscription for subscription in self._subscriptions if subscription.wants(envelope)]
        for subscription in listeners:
            subscription.deliver(envelope)
        return envelope

    def subscribe(
        self,
        project_id: str | None = None,
        types: frozenset[str] | None = None,
        queue_size: int | None = None,
        on_ready: Callable[[], None] | None = None,
    ) -> Subscription:
        subscription = Subscription(project_id, types, queue_size or self._queue_size, on_ready)
        with self._lock:
            if self._closed:
                subscription.close()
            else:
                self._subscriptions.append(subscription)
        return subscription

    def unsubscribe(self, subscription: Subscription) -> None:
        with self._lock:
            if subscription in self._subscriptions:
                self._subscriptions.remove(subscription)
        subscription.close()

    def close(self) -> None:
        """Ends every subscription so streams and log writers stop on engine shutdown."""
        with self._lock:
            self._closed = True
            subscriptions, self._subscriptions = self._subscriptions, []
        for subscription in subscriptions:
            subscription.close()
