import asyncio
import contextlib
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from icarus.events import EventBus

KEEPALIVE_PERIOD = 15.0

router = APIRouter()


async def stream_events(bus: EventBus, project_id: str | None, keepalive: float) -> AsyncGenerator[str]:
    """Server-sent events of one subscription; the subscription ends when the client leaves or the bus closes."""
    loop = asyncio.get_running_loop()
    ready = asyncio.Event()

    def wake() -> None:
        # Publishers run on other threads and the loop may already be gone at shutdown.
        with contextlib.suppress(RuntimeError):
            loop.call_soon_threadsafe(ready.set)

    subscription = bus.subscribe(project_id=project_id, on_ready=wake)
    reported_drops = 0
    try:
        while True:
            try:
                await asyncio.wait_for(ready.wait(), keepalive)
            except TimeoutError:
                yield ": keepalive\n\n"
                continue
            ready.clear()
            if subscription.dropped > reported_drops:
                yield f": dropped {subscription.dropped - reported_drops}\n\n"
                reported_drops = subscription.dropped
            for envelope in subscription.drain():
                yield f"data: {envelope.model_dump_json()}\n\n"
            if subscription.closed:
                return
    finally:
        bus.unsubscribe(subscription)


@router.get("/events")
def engine_events(request: Request, project: str | None = None) -> StreamingResponse:
    bus: EventBus = request.app.state.events
    headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    return StreamingResponse(
        stream_events(bus, project, KEEPALIVE_PERIOD), media_type="text/event-stream", headers=headers
    )
