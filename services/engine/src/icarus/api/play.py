import asyncio
from dataclasses import dataclass

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from icarus.contracts.play import (
    PlayBrainOption,
    PlayCommand,
    PlayCommandEnvelope,
    PlayErrorMessage,
    PlayEventMessage,
    PlayFrameMessage,
    PlayMessageEnvelope,
    PlayProgressMessage,
    PlayReady,
    PlaySessionInfo,
)
from icarus.contracts.project import Project
from icarus.contracts.training import WarmStart
from icarus.copilot.language import Language
from icarus.design.compiler import CompileError
from icarus.projects.agents import agent_project
from icarus.projects.store import ProjectStore, UnknownProject
from icarus.sim.model_state import build_world, observation
from icarus.sim.play import PlayReply, PlaySession
from icarus.sim.play_agents import AgentBrain, AgentsPlay
from icarus.sim.policy import UNTRAINED_BRAIN, CheckpointPolicy, Policy, RandomPolicy, untrained_after
from icarus.training.play_brains import BrainUnavailable, brain_options, chosen_checkpoint, default_checkpoint
from icarus.training.run_store import RunStore
from icarus.training.warm_start import warm_start_problem

router = APIRouter()

FRAME_PERIOD = 1 / 30
# Longest real time one tick may simulate, so a stalled loop never catches up in one huge step.
MAX_TICK = 0.1
UNKNOWN_PROJECT = 4404
UNPLAYABLE = 4422

Inbound = PlayCommand | PlayErrorMessage


async def _send(websocket: WebSocket, message: PlayReply | PlayFrameMessage | PlayProgressMessage) -> None:
    await websocket.send_text(PlayMessageEnvelope(message=message).model_dump_json())


def _error(text: str) -> PlayErrorMessage:
    return PlayErrorMessage(type="error", message=text)


@dataclass(frozen=True)
class _Choice:
    run_id: str
    step: int


@dataclass(frozen=True)
class _Brain:
    policy: Policy
    run_id: str | None = None
    step: int | None = None


@dataclass(frozen=True)
class _World:
    project: Project
    revision: int
    # What the brain reads and drives: observation length and motor count of the compiled world.
    senses: int
    motors: int


def _brain(runs: RunStore, world: _World, agent: str | None = None) -> _Brain:
    """The best trained brain of this revision, else the newest one that still fits the body, else random actions;
    with several agents, `world` is one agent's world and only that agent's runs count."""
    project, revision = world.project, world.revision
    trained = runs.trained_checkpoint(project.id, revision, project, agent)
    earlier = trained is None and agent is None
    if earlier:
        trained = default_checkpoint(runs, project, revision)
    if trained is not None:
        status, path = trained
        label = f"Trained brain: {status.name} at {status.best_step:,} steps"
        if earlier:
            label = f"{label}, from revision {status.revision_number}"
        try:
            policy = CheckpointPolicy.load(path, label, world.senses)
            return _Brain(policy, status.run_id, status.best_step)
        except Exception:  # noqa: BLE001 - an unreadable checkpoint falls back to the untrained brain
            pass
    loaded = _loaded_brain(runs, world)
    if loaded is not None:
        return loaded
    ended = runs.latest_ended(project.id, revision, project, agent)
    label = untrained_after(ended.name) if ended is not None and not ended.best_step else UNTRAINED_BRAIN
    return _Brain(RandomPolicy(world.motors, project.brain.seed, label))


def _loaded_brain(runs: RunStore, world: _World) -> _Brain | None:
    """The trained brain the project starts from, until a run of its own trains one; None when it has none or it no
    longer fits the body."""
    start = world.project.brain.start_from
    if start is None:
        return None
    warm = WarmStart(run_id=start.run_id, step=start.step)
    try:
        if warm_start_problem(runs, world.project, warm) is not None:
            return None
        folder = runs.folder(start.run_id)
        label = f"Loaded brain: {folder.stored_status().name} at {start.step:,} steps"
        policy = CheckpointPolicy.load(folder.checkpoint_path(start.step), label, world.senses)
    except Exception:  # noqa: BLE001 - a brain that cannot load falls back to the untrained brain
        return None
    return _Brain(policy, start.run_id, start.step)


def _chosen_brain(runs: RunStore, world: _World, choice: _Choice) -> _Brain:
    path, label = chosen_checkpoint(runs, world.project, choice.run_id, choice.step)
    try:
        policy = CheckpointPolicy.load(path, label, world.senses)
    except Exception as error:  # noqa: BLE001 - a checkpoint that will not load is reported, not played
        raise BrainUnavailable(f"That brain could not be loaded: {error}") from error
    return _Brain(policy, choice.run_id, choice.step)


def _world_of(project: Project, revision: int) -> _World:
    built = build_world(project)
    return _World(project, revision, observation(built).shape[0], built.model.nu)


def _load_world(store: ProjectStore, project_id: str) -> _World:
    state = store.state(project_id)
    return _world_of(state.project, state.revision.number)


def _agents_brains(runs: RunStore, world: _World) -> list[AgentBrain]:
    """Each agent's best trained brain, from its own runs, in the agents' order."""
    brains: list[AgentBrain] = []
    for agent in world.project.agents:
        alone = _world_of(agent_project(world.project, agent.id), world.revision)
        brain = _brain(runs, alone, agent.id)
        brains.append(AgentBrain(brain.policy, brain.run_id, brain.step))
    return brains


def _load_brain(runs: RunStore, world: _World, choice: _Choice | None) -> _Brain:
    return _brain(runs, world) if choice is None else _chosen_brain(runs, world, choice)


def _start(world: _World, brain: _Brain, language: Language) -> tuple[PlaySession, PlaySessionInfo]:
    session = PlaySession(
        world.project, world.revision, brain.policy, world.project.brain.seed, language, brain.step or 0
    )
    return session, session.info().model_copy(update={"run_id": brain.run_id, "step": brain.step})


async def _open_session(websocket: WebSocket, project_id: str) -> tuple[PlaySession | AgentsPlay, PlaySessionInfo]:
    """Compile the world, load the brain and start, telling the app which of the three it is waiting for."""
    state = websocket.app.state
    language = await asyncio.to_thread(state.copilot.language, project_id)
    await _send(websocket, PlayProgressMessage(type="progress", stage="world"))
    world = await asyncio.to_thread(_load_world, state.store, project_id)
    await _send(websocket, PlayProgressMessage(type="progress", stage="brain"))
    if world.project.agents:
        brains = await asyncio.to_thread(_agents_brains, state.runs, world)
        await _send(websocket, PlayProgressMessage(type="progress", stage="starting"))
        agents = await asyncio.to_thread(AgentsPlay, world.project, world.revision, brains, language)
        return agents, agents.info()
    brain = await asyncio.to_thread(_load_brain, state.runs, world, _choice(websocket))
    await _send(websocket, PlayProgressMessage(type="progress", stage="starting"))
    return await asyncio.to_thread(_start, world, brain, language)


def _choice(websocket: WebSocket) -> _Choice | None:
    """The brain the user picked for this session (`?run=<id>&step=<n>`); without one, Play picks the default."""
    run_id = websocket.query_params.get("run")
    step = websocket.query_params.get("step")
    if run_id is None or step is None or not step.isdigit():
        return None
    return _Choice(run_id, int(step))


@router.get("/projects/{project_id}/play/brains")
def play_brains(request: Request, project_id: str) -> list[PlayBrainOption]:
    """Every trained brain of the project Play could use, newest first, with whether it fits the body now."""
    state = request.app.state.store.state(project_id)
    return brain_options(request.app.state.runs, state.project, state.revision.number)


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


async def _run(websocket: WebSocket, session: PlaySession | AgentsPlay, receiver: asyncio.Task[None], inbox) -> None:
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
        for reply in await asyncio.to_thread(session.due):
            await _send(websocket, reply)
        await _send(websocket, PlayFrameMessage(type="frame", frame=await asyncio.to_thread(session.frame)))
        await asyncio.sleep(max(0.0, FRAME_PERIOD - (loop.time() - now)))


@router.websocket("/projects/{project_id}/play")
async def play(websocket: WebSocket, project_id: str) -> None:
    await websocket.accept()
    try:
        session, info = await _open_session(websocket, project_id)
    except UnknownProject:
        await _send(websocket, _error(f"There is no project {project_id!r}"))
        await websocket.close(code=UNKNOWN_PROJECT)
        return
    except (CompileError, BrainUnavailable) as error:
        await _send(websocket, _error(str(error)))
        await websocket.close(code=UNPLAYABLE, reason=str(error)[:120])
        return
    await _send(websocket, PlayReady(type="ready", session=info))
    inbox: asyncio.Queue[Inbound] = asyncio.Queue()
    receiver = asyncio.create_task(_receive(websocket, inbox))
    try:
        await _run(websocket, session, receiver, inbox)
    except WebSocketDisconnect:
        pass
    finally:
        receiver.cancel()
