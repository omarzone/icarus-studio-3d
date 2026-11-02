import threading

from icarus.contracts.events import TaskProgressEvent, TurnStartedEvent
from icarus.events import EventBus


def turn(turn_id: str) -> TurnStartedEvent:
    return TurnStartedEvent(type="turn_started", turn_id=turn_id)


def progress(task_id: str) -> TaskProgressEvent:
    return TaskProgressEvent(type="task_progress", task_id=task_id, progress=0.5, text="halfway")


def test_every_subscriber_gets_each_published_event_in_an_envelope():
    bus = EventBus()
    first, second = bus.subscribe(), bus.subscribe()

    envelope = bus.publish(turn("t1"), project_id="p1")

    assert envelope.project_id == "p1"
    assert envelope.event == turn("t1")
    assert first.drain() == [envelope]
    assert second.drain() == [envelope]
    assert first.drain() == []


def test_a_project_subscriber_sees_its_project_and_engine_wide_events_but_not_other_projects():
    bus = EventBus()
    subscription = bus.subscribe(project_id="p1")

    mine = bus.publish(turn("a"), project_id="p1")
    bus.publish(turn("b"), project_id="p2")
    engine_wide = bus.publish(turn("c"), project_id=None)

    assert subscription.drain() == [mine, engine_wide]


def test_a_subscriber_can_ask_for_only_some_event_types():
    bus = EventBus()
    subscription = bus.subscribe(types=frozenset({"task_progress"}))

    bus.publish(turn("a"), project_id=None)
    wanted = bus.publish(progress("k"), project_id=None)

    assert subscription.drain() == [wanted]


def test_a_slow_subscriber_drops_its_oldest_events_and_counts_them():
    bus = EventBus()
    slow = bus.subscribe(queue_size=2)

    sent = [bus.publish(turn(str(index)), project_id=None) for index in range(5)]

    assert slow.drain() == sent[-2:]
    assert slow.dropped == 3


def test_after_unsubscribing_nothing_more_arrives_and_waiting_returns_at_once():
    bus = EventBus()
    subscription = bus.subscribe()
    bus.unsubscribe(subscription)

    bus.publish(turn("a"), project_id=None)

    assert bus.subscriber_count == 0
    assert subscription.drain() == []
    assert subscription.closed
    assert subscription.get(timeout=5) is None


def test_closing_the_bus_wakes_a_waiting_subscriber():
    bus = EventBus()
    subscription = bus.subscribe()
    results: list[object] = []
    waiter = threading.Thread(target=lambda: results.append(subscription.get(timeout=5)))
    waiter.start()

    bus.close()
    waiter.join(timeout=5)

    assert not waiter.is_alive()
    assert results == [None]


def test_publishing_from_many_threads_delivers_every_event_once():
    bus = EventBus()
    subscription = bus.subscribe(queue_size=10_000)
    received: list[str] = []

    def reader() -> None:
        while (envelope := subscription.get(timeout=5)) is not None:
            received.append(envelope.id)

    def writer(prefix: str) -> None:
        for index in range(500):
            bus.publish(turn(f"{prefix}{index}"), project_id=None)

    reading = threading.Thread(target=reader)
    reading.start()
    writers = [threading.Thread(target=writer, args=(f"w{number}-",)) for number in range(4)]
    for thread in writers:
        thread.start()
    for thread in writers:
        thread.join()
    bus.close()
    reading.join(timeout=10)

    assert len(received) + len(subscription.drain()) == 2000
    assert len(set(received)) == len(received)
    assert subscription.dropped == 0


def test_a_ready_callback_hears_each_delivery():
    bus = EventBus()
    calls: list[int] = []
    bus.subscribe(on_ready=lambda: calls.append(1))

    bus.publish(turn("a"), project_id=None)
    bus.publish(turn("b"), project_id=None)

    assert len(calls) == 2
