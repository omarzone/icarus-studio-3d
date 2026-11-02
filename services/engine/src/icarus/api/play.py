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
from icarus.contracts.project import Project
from icarus.copilot.language import Language
from icarus.design.compiler import CompileError, compile_project
from icarus.projects.store import ProjectStore, UnknownProject
from icarus.sim.model_state import build_world, observation
from icarus.sim.play import PlayReply, PlaySession
from icarus.sim.policy import UNTRAINED_BRAIN, CheckpointPolicy, Policy, RandomPolicy, untrained_after
from icarus.training.run_store import RunStore

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


def _brain(runs: RunStore, project: Project, revision: int) -> Policy:
    """The best trained brain of this revision when one exists, otherwise random actions."""
    trained = runs.trained_checkpoint(project.id, revision)
    if trained is not None:
        status, path = trained
        label = f"Trained brain: {status.name} at {status.best_step:,} steps"
        try:
            return CheckpointPolicy.load(path, label, observation(build_world(project)).shape[0])
        except Exception:  # noqa: BLE001 - an unreadable checkpoint falls back to the untrained brain
            pass
    ended = runs.latest_ended(project.id, revision)
    label = untrained_after(ended.name) if ended is not None and not ended.best_step else UNTRAINED_BRAIN
    return RandomPolicy(compile_project(project).model.nu, project.brain.seed, label)


def _open_session(store: ProjectStore, runs: RunStore, project_id: str, language: Language) -> PlaySession:
    state = store.state(project_id)
    brain = _brain(runs, state.project, state.revision.number)
    return PlaySession(state.project, state.revision.number, brain, state.project.brain.seed, language)


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
            try:
                replies = [item] if isinstance(item, PlayErrorMessage) else session.apply(item)
            except Exception as error:  # noqa: BLE001 - one failed command never ends the session
                replies = [_error(f"That did not work: {error}")]
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
        state = websocket.app.state
        language = await asyncio.to_thread(state.copilot.language, project_id)
        session = await asyncio.to_thread(_open_session, state.store, state.runs, project_id, language)
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
