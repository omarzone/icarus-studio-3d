from icarus.contracts.events import EngineEventEnvelope, TurnStartedEvent
from icarus.event_log import EventLog
from icarus.events import EventBus


def turn(turn_id: str) -> TurnStartedEvent:
    return TurnStartedEvent(type="turn_started", turn_id=turn_id)


def read_envelopes(path) -> list[EngineEventEnvelope]:
    return [EngineEventEnvelope.model_validate_json(line) for line in path.read_text("utf-8").splitlines()]


def test_published_events_end_up_as_json_lines_once_the_log_stops(tmp_path):
    bus = EventBus()
    log = EventLog(bus, tmp_path / "logs")
    log.start()

    sent = [bus.publish(turn(str(index)), project_id="p1") for index in range(3)]
    log.stop()

    assert read_envelopes(tmp_path / "logs" / "events.jsonl") == sent
    assert bus.subscriber_count == 0


def test_a_full_log_rotates_and_keeps_only_the_newest_files(tmp_path):
    bus = EventBus()
    log = EventLog(bus, tmp_path, max_bytes=400, keep=2)
    sent = [bus.publish(turn(f"turn-{index}"), project_id=None) for index in range(12)]

    for envelope in sent:
        log.write(envelope)

    names = sorted(path.name for path in tmp_path.iterdir())
    assert names == ["events.1.jsonl", "events.2.jsonl", "events.jsonl"]
    kept = read_envelopes(tmp_path / "events.2.jsonl")
    kept += read_envelopes(tmp_path / "events.1.jsonl")
    kept += read_envelopes(tmp_path / "events.jsonl")
    assert kept == sent[-len(kept) :]
    assert all(path.stat().st_size <= 400 for path in tmp_path.iterdir())


def test_a_failed_write_is_logged_and_later_events_still_reach_the_file(tmp_path, monkeypatch, caplog):
    bus = EventBus()
    log = EventLog(bus, tmp_path)
    real_write = log.write
    failures = [OSError("disk full")]

    def flaky_write(envelope: EngineEventEnvelope) -> None:
        if failures:
            raise failures.pop()
        real_write(envelope)

    monkeypatch.setattr(log, "write", flaky_write)
    log.start()

    sent = [bus.publish(turn(str(index)), project_id=None) for index in range(3)]
    log.stop()

    assert read_envelopes(tmp_path / "events.jsonl") == sent[1:]
    assert "disk full" in caplog.text
