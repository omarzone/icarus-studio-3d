import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from icarus.contracts.play import (
    PlayCommand,
    PlayCommandEnvelope,
    PlayErrorMessage,
    PlayEventMessage,
    PlayFrameMessage,
    PlayMessageEnvelope,
    PlayReady,
)
from icarus.design.compiler import CompileError, compile_project
from icarus.projects.store import ProjectStore, UnknownProject
from icarus.sim.play import PlayReply, PlaySession
from icarus.sim.policy import RandomPolicy

router = APIRouter()

FRAME_PERIOD = 1 / 30
# Longest real time one tick may simulate, so a stalled loop never catches up in one huge step.
MAX_TICK = 0.1
UNKNOWN_PROJECT = 4404
UNPLAYABLE = 4422

Inbound = PlayCommand | PlayErrorMessage


async def _send(websocket: WebSocket, message: PlayReply | PlayFrameMessage) -> None:
    await websocket.send_text(PlayMessageEnvelope(message=message).model_dump_json())


def _error(text: str) -> PlayErrorMessage:
    return PlayErrorMessage(type="error", message=text)


def _open_session(store: ProjectStore, project_id: str) -> PlaySession:
    state = store.state(project_id)
    seed = state.project.brain.seed
    brain = RandomPolicy(compile_project(state.project).model.nu, seed)
    return PlaySession(state.project, state.revision.number, brain, seed)


async def _receive(websocket: WebSocket, inbox: asyncio.Queue[Inbound]) -> None:
    """Parse incoming commands until the client leaves; a bad command becomes an error reply."""
    while True:
        message = await websocket.receive()
        if message["type"] == "websocket.disconnect":
            return
        text = message.get("text")
        if text is None:
            inbox.put_nowait(_error("Commands must be JSON text"))
            continue
        try:
            inbox.put_nowait(PlayCommandEnvelope.model_validate_json(text).command)
        except ValidationError as error:
            first = error.errors()[0]
            where = ".".join(str(part) for part in first["loc"])
            detail = f"{first['msg']} at {where}" if where else first["msg"]
            inbox.put_nowait(_error(f"The command is not valid: {detail}"))


async def _run(websocket: WebSocket, session: PlaySession, receiver: asyncio.Task[None], inbox) -> None:
    loop = asyncio.get_running_loop()
    last = loop.time()
    while not receiver.done():
        while not inbox.empty():
            item = inbox.get_nowait()
            replies = [item] if isinstance(item, PlayErrorMessage) else session.apply(item)
            for reply in replies:
                await _send(websocket, reply)
        now = loop.time()
        events = await asyncio.to_thread(session.step_realtime, min(now - last, MAX_TICK))
        last = now
        for event in events:
            await _send(websocket, PlayEventMessage(type="event", event=event))
        await _send(websocket, PlayFrameMessage(type="frame", frame=session.frame()))
        await asyncio.sleep(max(0.0, FRAME_PERIOD - (loop.time() - now)))


@router.websocket("/projects/{project_id}/play")
async def play(websocket: WebSocket, project_id: str) -> None:
    await websocket.accept()
    try:
        session = await asyncio.to_thread(_open_session, websocket.app.state.store, project_id)
    except UnknownProject:
        await _send(websocket, _error(f"There is no project {project_id!r}"))
        await websocket.close(code=UNKNOWN_PROJECT)
        return
    except CompileError as error:
        await _send(websocket, _error(str(error)))
        await websocket.close(code=UNPLAYABLE)
        return
    await _send(websocket, PlayReady(type="ready", session=session.info()))
    inbox: asyncio.Queue[Inbound] = asyncio.Queue()
    receiver = asyncio.create_task(_receive(websocket, inbox))
    try:
        await _run(websocket, session, receiver, inbox)
    except WebSocketDisconnect:
        pass
    finally:
        receiver.cancel()
