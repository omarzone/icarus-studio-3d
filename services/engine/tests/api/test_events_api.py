import asyncio
import json
import socket
import threading
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.testclient import TestClient

from icarus.api import events as events_api
from icarus.cli import SHUTDOWN_GRACE_SECONDS
from icarus.contracts.events import EngineEventEnvelope, TurnStartedEvent
from icarus.events import EventBus


def turn(turn_id: str) -> TurnStartedEvent:
    return TurnStartedEvent(type="turn_started", turn_id=turn_id)


def app_with(bus: EventBus) -> FastAPI:
    app = FastAPI()
    app.state.events = bus
    app.include_router(events_api.router)
    return app


def wait_for_subscriber(bus: EventBus) -> None:
    deadline = time.monotonic() + 5
    while bus.subscriber_count == 0 and time.monotonic() < deadline:
        time.sleep(0.01)


def test_the_stream_sends_the_project_events_as_envelopes_until_the_engine_stops():
    bus = EventBus()

    def engine() -> None:
        wait_for_subscriber(bus)
        bus.publish(turn("mine"), project_id="p1")
        bus.publish(turn("other"), project_id="p2")
        bus.publish(turn("engine-wide"), project_id=None)
        bus.close()

    threading.Thread(target=engine).start()
    with TestClient(app_with(bus)) as client, client.stream("GET", "/events", params={"project": "p1"}) as response:
        assert response.headers["content-type"].startswith("text/event-stream")
        lines = [line for line in response.iter_lines() if line.startswith("data: ")]

    envelopes = [EngineEventEnvelope.model_validate(json.loads(line.removeprefix("data: "))) for line in lines]
    assert [envelope.event for envelope in envelopes] == [turn("mine"), turn("engine-wide")]


def test_a_quiet_stream_sends_keepalives_and_unsubscribes_when_the_client_leaves():
    bus = EventBus()

    async def listen() -> list[str]:
        stream = events_api.stream_events(bus, project_id=None, keepalive=0.01)
        received = [await anext(stream), await anext(stream)]
        assert bus.subscriber_count == 1
        await stream.aclose()
        return received

    assert asyncio.run(listen()) == [": keepalive\n\n", ": keepalive\n\n"]
    assert bus.subscriber_count == 0


def test_a_stream_that_fell_behind_says_how_many_events_it_lost():
    bus = EventBus(queue_size=1)

    async def listen() -> list[str]:
        stream = events_api.stream_events(bus, project_id=None, keepalive=5)
        first = asyncio.ensure_future(anext(stream))
        while bus.subscriber_count == 0:
            await asyncio.sleep(0.01)
        for index in range(3):
            bus.publish(turn(str(index)), project_id=None)
        received = [await first, await anext(stream)]
        await stream.aclose()
        return received

    dropped, data = asyncio.run(listen())
    assert dropped == ": dropped 2\n\n"
    assert EngineEventEnvelope.model_validate_json(data.removeprefix("data: ")).event == turn("2")


def test_a_graceful_engine_stop_ends_open_streams_and_still_runs_the_lifespan_shutdown():
    bus = EventBus()
    shut_down = threading.Event()

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        bus.close()
        shut_down.set()

    app = FastAPI(lifespan=lifespan)
    app.state.events = bus
    app.include_router(events_api.router)
    config = uvicorn.Config(
        app, host="127.0.0.1", port=0, log_level="warning", timeout_graceful_shutdown=SHUTDOWN_GRACE_SECONDS
    )
    server = uvicorn.Server(config)
    serving = threading.Thread(target=server.run)
    serving.start()
    deadline = time.monotonic() + 10
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.01)
    port = server.servers[0].sockets[0].getsockname()[1]

    with socket.create_connection(("127.0.0.1", port), timeout=10) as client:
        client.sendall(b"GET /events HTTP/1.1\r\nHost: engine\r\n\r\n")
        assert client.recv(1024).startswith(b"HTTP/1.1 200")
        wait_for_subscriber(bus)
        server.should_exit = True
        serving.join(timeout=SHUTDOWN_GRACE_SECONDS + 10)

    assert not serving.is_alive()
    assert shut_down.is_set()
    assert bus.subscriber_count == 0
