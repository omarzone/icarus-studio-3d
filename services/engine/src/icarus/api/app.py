from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from icarus import __version__
from icarus.api import (
    attachments,
    brain,
    build,
    coach,
    copilot,
    events,
    health,
    ideas,
    library,
    model_settings,
    notes,
    play,
    project_runs,
    projects,
    runs,
    skins,
    storage,
    tasks,
)
from icarus.contracts import ApiError
from icarus.contracts.errors import ValidationErrorBody, ValidationIssue
from icarus.contracts.events import EngineEvent, RevisionCreatedEvent
from icarus.contracts.project import Revision
from icarus.copilot.agent.harness import worker_tools
from icarus.copilot.agent.tools.base import TurnScope
from icarus.copilot.agent.tools.coaching import Coaching
from icarus.copilot.architect import IdeaBook, NoValidIdeas, UnknownIdeas
from icarus.copilot.attachments import AttachmentRejected, AttachmentStore, UnknownAttachment
from icarus.copilot.autopilot import Autopilot, AutopilotBusy, NoAutopilot
from icarus.copilot.builds import BuildBoard, UnknownBuild
from icarus.copilot.builtin_hooks import default_registry
from icarus.copilot.chat import Copilot, CopilotBusy, Harness, ProposalClosed, ProposalOutdated, UnknownProposal
from icarus.copilot.chat_training import ChatTrainer
from icarus.copilot.checkpoint_coach import CheckpointCoach
from icarus.copilot.client import CopilotError, NotConnected
from icarus.copilot.coach import Coach, NothingToDiagnose
from icarus.copilot.conversation_store import ConversationStore
from icarus.copilot.early_look import EarlyLook, default_client
from icarus.copilot.film_strips import FilmStrips
from icarus.copilot.memory import CopilotMemory, memory_prompt
from icarus.copilot.run_frames import RunFrames
from icarus.copilot.settings import ModelSettingsStore, settings_dir
from icarus.copilot.subagents import Subagents
from icarus.event_log import EventLog
from icarus.events import EventBus
from icarus.library.templates import UnknownTemplate
from icarus.projects.operations import OperationError
from icarus.projects.skins import SkinRejected, SkinStore, UnknownSkin
from icarus.projects.store import (
    NothingToRedo,
    NothingToUndo,
    ProjectStore,
    RejectedBatch,
    UnknownProject,
    UnknownRevision,
)
from icarus.run_relay import CoachedSupervisor, RunRelay
from icarus.sim.views import ViewRenderer
from icarus.storage.data_folder import projects_dir, runs_dir
from icarus.storage.data_folder_move import DataFolderMover, MoveRefused
from icarus.tasks import TaskContext, TaskRegistry
from icarus.training.run_store import TERMINAL_STATES, RunStore, UnknownRun
from icarus.training.settings import SettingsRejected, TrainingSettingsStore
from icarus.training.supervisor import NotTrainable, RunInProgress, WarmStartRefused

_CODES = {
    400: "bad_request",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "invalid",
    500: "internal",
    503: "unavailable",
}


def _error(status: int, error: ApiError) -> JSONResponse:
    return JSONResponse(status_code=status, content=error.model_dump())


async def _http_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    if exc.status_code == 404 and exc.detail == "Not Found":
        message = f"No route for {request.method} {request.url.path}"
    else:
        message = str(exc.detail)
    return _error(exc.status_code, ApiError(code=_CODES.get(exc.status_code, "error"), message=message))


def _operation_issue(body: object, loc: tuple, message: str) -> ValidationIssue:
    """Point a rejected operation value at the project property it was meant for."""
    if len(loc) > 3 and loc[:2] == ("body", "operations") and isinstance(body, dict):
        operations = body.get("operations")
        index = loc[2]
        if isinstance(operations, list) and isinstance(index, int) and index < len(operations):
            operation = operations[index]
            if isinstance(operation, dict) and operation.get("op") == "set_property":
                fields = (operation.get("object"), operation.get("component"), operation.get("property"))
                if all(isinstance(field, str) for field in fields):
                    return ValidationIssue(path="objects.{}.components.{}.{}".format(*fields), message=message)
    return ValidationIssue(path=".".join(str(part) for part in loc), message=message)


async def _validation_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    if request.url.path.endswith("/operations"):
        return _rejected([_operation_issue(exc.body, tuple(e["loc"]), str(e["msg"])) for e in exc.errors()])
    details = {".".join(str(p) for p in e["loc"]): str(e["msg"]) for e in exc.errors()}
    return _error(422, ApiError(code="invalid", message="The request is not valid", details=details))


def _rejected(issues: list[ValidationIssue]) -> JSONResponse:
    body = ValidationErrorBody(code="invalid", message="The change was not applied", issues=issues)
    return JSONResponse(status_code=422, content=body.model_dump())


async def _domain_error(request: Request, exc: Exception) -> JSONResponse:
    match exc:
        case UnknownProject():
            return _error(404, ApiError(code="not_found", message=f"There is no project {exc.args[0]!r}"))
        case UnknownRevision():
            return _error(404, ApiError(code="not_found", message=f"There is no revision {exc.args[0]}"))
        case NothingToUndo():
            return _error(409, ApiError(code="conflict", message="There is nothing to undo"))
        case NothingToRedo():
            return _error(409, ApiError(code="conflict", message="There is nothing to redo"))
        case RejectedBatch() | OperationError():
            return _rejected(exc.issues)
        case UnknownTemplate():
            return _rejected([ValidationIssue(path="template", message=f"There is no template {exc.args[0]!r}")])
        case UnknownRun():
            return _error(404, ApiError(code="not_found", message=f"There is no run {exc.args[0]!r}"))
        case RunInProgress():
            name = request.app.state.runs.folder(exc.run_id).status().name
            message = f"{name} is still training. Stop it before starting another run."
            return _error(409, ApiError(code="conflict", message=message))
        case NotTrainable():
            return _error(422, ApiError(code="invalid", message=f"This project cannot be trained: {exc}"))
        case WarmStartRefused():
            return _error(422, ApiError(code="invalid", message=str(exc)))
        case NothingToDiagnose() | AutopilotBusy():
            return _error(409, ApiError(code="conflict", message=str(exc)))
        case NoAutopilot():
            return _error(404, ApiError(code="not_found", message="The autopilot has not run for this project"))
        case NotConnected():
            return _error(503, ApiError(code="not_connected", message=str(exc)))
        case NoValidIdeas():
            return _error(502, ApiError(code="copilot_error", message=str(exc), details=exc.reasons or None))
        case CopilotError():
            return _error(502, ApiError(code="copilot_error", message=str(exc)))
        case UnknownProposal():
            return _error(404, ApiError(code="not_found", message=f"There is no proposal {exc.args[0]!r}"))
        case ProposalOutdated():
            message = "The project changed since this proposal was made. Ask the copilot again."
            return _error(409, ApiError(code="outdated", message=message))
        case CopilotBusy():
            return _error(409, ApiError(code="conflict", message=str(exc)))
        case ProposalClosed():
            return _error(409, ApiError(code="conflict", message=f"This proposal was already {exc.args[0]}"))
        case UnknownIdeas():
            return _error(404, ApiError(code="not_found", message=f"There are no ideas {exc.args[0]!r}"))
        case UnknownAttachment():
            return _error(404, ApiError(code="not_found", message="There is no such attachment"))
        case UnknownSkin():
            return _error(404, ApiError(code="not_found", message="There is no such model"))
        case AttachmentRejected() | SkinRejected():
            return _error(422, ApiError(code="invalid", message=str(exc)))
        case UnknownBuild():
            return _error(404, ApiError(code="not_found", message=f"There is no build {exc.args[0]!r}"))
        case MoveRefused():
            return _error(
                409 if exc.conflict else 422, ApiError(code="conflict" if exc.conflict else "invalid", message=str(exc))
            )
        case SettingsRejected():
            details = {exc.field: exc.message}
            return _error(422, ApiError(code="invalid", message=exc.message, details=details))
        case _:
            raise exc


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    supervisor: CoachedSupervisor = app.state.supervisor
    supervisor.recover()
    app.state.event_log.start()
    app.state.run_relay.start()
    yield
    app.state.autopilot.shutdown()
    supervisor.shutdown()
    app.state.run_relay.stop()
    app.state.event_log.stop()
    app.state.events.close()


def _revision_publisher(bus: EventBus):
    def publish(project_id: str, revision: Revision) -> None:
        event = RevisionCreatedEvent(
            type="revision_created", revision=revision.number, author=revision.author, summary=revision.summary
        )
        bus.publish(event, project_id)

    return publish


def _memory(projects_folder: Path, data_folder: Path):
    def facts(scope: TurnScope, message: str) -> str:
        return memory_prompt(CopilotMemory(projects_folder, data_folder).turn_facts(scope.project_id, message))

    return facts


def _diagnosis_starter(registry: TaskRegistry, coach_: Coach, runs_: RunStore):
    """A watch rule fired at a coached checkpoint: the coach diagnoses it as a task."""

    def start(run_id: str, step: int, notes: list[str]) -> None:
        status = runs_.folder(run_id).status()

        def work(context: TaskContext) -> None:
            context.progress(0.1, f"Diagnosing {status.name} at step {step:,}")
            coach_.diagnose(run_id, step, notes=notes)

        registry.start("diagnosis", f"Diagnose {status.name} at step {step:,}", work, status.project_id)

    return start


def _training_now(runs_: RunStore, supervisor: CoachedSupervisor, autopilot: Autopilot):
    """Why the data folder cannot move now: a run is training or the autopilot drives a project."""

    def reason() -> str | None:
        run_id = supervisor.active_run()
        if run_id is not None:
            status = runs_.folder(run_id).status()
            if status.state not in TERMINAL_STATES:
                return f"{status.name} is training. Stop it before moving the data folder."
        if autopilot.driving():
            return "The autopilot is training a project. Stop it before moving the data folder."
        return None

    return reason


def create_app(
    projects_root: Path | None = None, runs_root: Path | None = None, settings_root: Path | None = None
) -> FastAPI:
    app = FastAPI(title="Icarus engine", version=__version__, lifespan=_lifespan)
    projects_folder = projects_root or projects_dir()
    runs_folder = runs_root or runs_dir()
    data_folder = settings_root or settings_dir()
    bus = EventBus()

    def publish(event: EngineEvent, project_id: str | None) -> None:
        bus.publish(event, project_id)

    app.state.events = bus
    app.state.event_log = EventLog(bus, data_folder / "logs")
    app.state.tasks = TaskRegistry(publish, data_folder / "tasks.json")
    app.state.store = ProjectStore(projects_folder)
    app.state.store.observe(_revision_publisher(bus))
    app.state.runs = RunStore(runs_folder)
    app.state.supervisor = CoachedSupervisor(app.state.runs)
    app.state.training_settings = TrainingSettingsStore(runs_folder, projects_folder)
    app.state.model_settings = ModelSettingsStore(data_folder)
    trainer = ChatTrainer(app.state.store, app.state.runs, app.state.supervisor, app.state.training_settings)
    app.state.attachments = AttachmentStore(projects_folder)
    app.state.skins = SkinStore(projects_folder)
    views = ViewRenderer()
    conversations = ConversationStore(projects_folder)
    app.state.copilot = Copilot(
        app.state.store,
        app.state.runs,
        conversations,
        app.state.model_settings,
        trainer,
        app.state.attachments,
        views,
    )
    app.state.run_frames = RunFrames(app.state.attachments)
    app.state.coach = Coach(app.state.copilot, app.state.run_frames)
    app.state.autopilot = Autopilot(
        app.state.store,
        app.state.runs,
        app.state.supervisor,
        app.state.training_settings,
        app.state.copilot,
        app.state.coach,
        conversations.folder,
    )
    app.state.copilot.attach_coaching(Coaching(app.state.coach, app.state.autopilot))
    app.state.coach.attach_publisher(publish)
    hub = Subagents(app.state.tasks, app.state.copilot.subagent_loop, frozenset(worker_tools()))
    app.state.subagents = hub
    harness = Harness(publish, default_registry(), _memory(projects_folder, data_folder), hub, welcome=True)
    app.state.copilot.attach_harness(harness)
    starter = _diagnosis_starter(app.state.tasks, app.state.coach, app.state.runs)
    checkpoints = CheckpointCoach(
        app.state.copilot,
        app.state.runs,
        starter,
        look=EarlyLook(default_client(app.state.model_settings), FilmStrips(views, app.state.attachments)),
        frames=app.state.run_frames,
        piloted=app.state.autopilot.drives,
        background=True,
    )
    app.state.autopilot.attach_watcher(checkpoints)
    app.state.checkpoint_coach = checkpoints
    app.state.run_relay = RunRelay(app.state.runs, app.state.supervisor.active_runs, publish, checkpoints.comment)
    app.state.supervisor.relay = app.state.run_relay
    app.state.data_folder = DataFolderMover(
        projects_folder,
        runs_folder,
        _training_now(app.state.runs, app.state.supervisor, app.state.autopilot),
        app.state.supervisor.hold,
        data_folder,
    )
    app.state.ideas = IdeaBook()
    app.state.builds = BuildBoard(app.state.store, app.state.ideas)
    # The app window loads from files when packaged ("null") and from the local dev server in development.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["null"],
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(library.router)
    app.include_router(projects.router)
    app.include_router(play.router)
    app.include_router(runs.router)
    app.include_router(copilot.router)
    app.include_router(attachments.router)
    app.include_router(skins.router)
    app.include_router(coach.router)
    app.include_router(ideas.router)
    app.include_router(model_settings.router)
    app.include_router(events.router)
    app.include_router(tasks.router)
    app.include_router(brain.router)
    app.include_router(build.router)
    app.include_router(notes.router)
    app.include_router(project_runs.router)
    app.include_router(storage.router)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    for error in (
        UnknownProject,
        UnknownRevision,
        NothingToUndo,
        NothingToRedo,
        RejectedBatch,
        OperationError,
        UnknownTemplate,
        UnknownRun,
        RunInProgress,
        NotTrainable,
        SettingsRejected,
        CopilotError,
        UnknownProposal,
        ProposalOutdated,
        ProposalClosed,
        CopilotBusy,
        UnknownIdeas,
        UnknownBuild,
        UnknownAttachment,
        AttachmentRejected,
        SkinRejected,
        UnknownSkin,
        WarmStartRefused,
        NothingToDiagnose,
        AutopilotBusy,
        NoAutopilot,
        MoveRefused,
    ):
        app.add_exception_handler(error, _domain_error)
    return app
