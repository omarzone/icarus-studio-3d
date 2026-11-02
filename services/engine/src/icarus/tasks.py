"""Long engine work as background tasks: one registry, cooperative cancelling and always a final event."""

import json
import logging
import math
import os
import secrets
import threading
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from pydantic import TypeAdapter, ValidationError

from icarus.contracts.events import (
    EngineEvent,
    TaskFinishedEvent,
    TaskInfo,
    TaskKind,
    TaskProgressEvent,
    TaskStartedEvent,
)

Publisher = Callable[[EngineEvent, str | None], None]
FinalState = Literal["done", "stopped", "failed"]

KEPT_FINISHED = 200
STOPPED_ON_REQUEST = "Stopped on request"
STOPPED_BY_RESTART = "The engine restarted before the task finished"

_log = logging.getLogger(__name__)
_stored = TypeAdapter(list[TaskInfo])


class UnknownTask(LookupError):
    pass


class TaskCancelled(Exception):
    pass


class CancelToken:
    """What a task checks between steps to know it should stop."""

    def __init__(self) -> None:
        self._event = threading.Event()

    @property
    def cancelled(self) -> bool:
        return self._event.is_set()

    def cancel(self) -> None:
        self._event.set()

    def check(self) -> None:
        if self._event.is_set():
            raise TaskCancelled

    def wait(self, seconds: float) -> bool:
        """Sleep that ends early on cancel; True when cancelled."""
        return self._event.wait(seconds)


class TaskContext:
    """Handed to the work function: its id, its cancel token and a way to report progress."""

    def __init__(self, task_id: str, token: CancelToken, report: Callable[[str, float, str], None]) -> None:
        self.task_id = task_id
        self.token = token
        self._report = report

    def progress(self, fraction: float, text: str) -> None:
        self._report(self.task_id, fraction, text)


class _Task:
    def __init__(self, info: TaskInfo) -> None:
        self.info = info
        self.token = CancelToken()
        self.finished = threading.Event()


def _now() -> datetime:
    return datetime.now(UTC)


class TaskRegistry:
    """Owns every task of the API process; work runs on threads and never trains in-process."""

    def __init__(
        self,
        publisher: Publisher | None = None,
        store_path: Path | None = None,
        kept_finished: int = KEPT_FINISHED,
    ) -> None:
        self._publisher = publisher
        self._store_path = store_path
        self._kept_finished = kept_finished
        self._tasks: dict[str, _Task] = {}
        self._lock = threading.Lock()
        self._write_lock = threading.Lock()
        self._recover()

    def start(
        self,
        kind: TaskKind,
        title: str,
        work: Callable[[TaskContext], object],
        project_id: str | None = None,
        parent_task_id: str | None = None,
    ) -> TaskInfo:
        info = TaskInfo(
            id=secrets.token_hex(6),
            project_id=project_id,
            kind=kind,
            state="running",
            title=title[:200],
            started_at=_now(),
            parent_task_id=parent_task_id,
        )
        task = _Task(info)
        with self._lock:
            self._tasks[info.id] = task
        # Published before the thread starts, so task_started always comes before its progress.
        self._publish(TaskStartedEvent(type="task_started", task=info), project_id)
        context = TaskContext(info.id, task.token, self._progress)
        threading.Thread(target=self._run, args=(task, work, context), name=f"task-{info.id}", daemon=True).start()
        self._save()
        return info

    def get(self, task_id: str) -> TaskInfo:
        return self._task(task_id).info

    def list(self, project_id: str | None = None) -> list[TaskInfo]:
        with self._lock:
            infos = [task.info for task in self._tasks.values()]
        mine = [info for info in infos if project_id is None or info.project_id == project_id]
        return sorted(mine, key=lambda info: info.started_at)

    def cancel(self, task_id: str) -> TaskInfo:
        """Ask the task and its running children to stop; their final event comes when they do."""
        task = self._task(task_id)
        task.token.cancel()
        with self._lock:
            children = [child for child in self._tasks.values() if child.info.parent_task_id == task_id]
        for child in children:
            if child.info.state == "running":
                self.cancel(child.info.id)
        return task.info

    def wait(self, task_id: str, timeout: float | None = None) -> TaskInfo:
        task = self._task(task_id)
        task.finished.wait(timeout)
        return task.info

    def _task(self, task_id: str) -> _Task:
        with self._lock:
            task = self._tasks.get(task_id)
        if task is None:
            raise UnknownTask(task_id)
        return task

    def _run(self, task: _Task, work: Callable[[TaskContext], object], context: TaskContext) -> None:
        state: FinalState = "done"
        reason: str | None = None
        try:
            work(context)
            if task.token.cancelled:
                state, reason = "stopped", STOPPED_ON_REQUEST
        except TaskCancelled:
            state, reason = "stopped", STOPPED_ON_REQUEST
        except Exception as error:  # noqa: BLE001 - any failure becomes a failed task with its reason
            state, reason = "failed", (str(error) or type(error).__name__)[:400]
        self._finish(task, state, reason)

    def _progress(self, task_id: str, fraction: float, text: str) -> None:
        if math.isnan(fraction):
            return
        fraction = min(max(fraction, 0.0), 1.0)
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None or task.info.state != "running":
                return
            task.info = task.info.model_copy(update={"progress": fraction})
            project_id = task.info.project_id
        event = TaskProgressEvent(type="task_progress", task_id=task_id, progress=fraction, text=text[:200])
        self._publish(event, project_id)

    def _finish(self, task: _Task, state: FinalState, reason: str | None) -> None:
        with self._lock:
            task.info = task.info.model_copy(update={"state": state, "finished_at": _now()})
            self._prune()
        try:
            self._save()
        finally:
            event = TaskFinishedEvent(type="task_finished", task_id=task.info.id, state=state, reason=reason)
            self._publish(event, task.info.project_id)
            task.finished.set()

    def _prune(self) -> None:
        finished = sorted(
            (task.info for task in self._tasks.values() if task.info.state != "running"),
            key=lambda info: info.started_at,
        )
        for info in finished[: max(0, len(finished) - self._kept_finished)]:
            del self._tasks[info.id]

    def _publish(self, event: EngineEvent, project_id: str | None) -> None:
        if self._publisher is None:
            return
        try:
            self._publisher(event, project_id)
        except Exception:  # noqa: BLE001 - a broken subscriber must not break the work it reports on
            _log.exception("Could not publish %s", event.type)

    def _recover(self) -> None:
        if self._store_path is None or not self._store_path.exists():
            return
        try:
            infos = _stored.validate_json(self._store_path.read_bytes())
        except (OSError, ValidationError, ValueError):
            _log.warning("Ignoring an unreadable task list at %s", self._store_path)
            return
        interrupted: list[TaskInfo] = []
        for info in infos:
            if info.state == "running":
                info = info.model_copy(update={"state": "stopped", "finished_at": _now()})
                interrupted.append(info)
            task = _Task(info)
            task.finished.set()
            self._tasks[info.id] = task
        self._prune()
        self._save()
        for info in interrupted:
            event = TaskFinishedEvent(type="task_finished", task_id=info.id, state="stopped", reason=STOPPED_BY_RESTART)
            self._publish(event, info.project_id)

    def _save(self) -> None:
        """Best effort: a failed write is logged, since tasks must always reach their final event."""
        if self._store_path is None:
            return
        # The snapshot is taken under the write lock so a later write never carries older state.
        with self._write_lock:
            with self._lock:
                infos = sorted((task.info for task in self._tasks.values()), key=lambda info: info.started_at)
                kept = [info.model_dump(mode="json") for info in infos]
            try:
                self._store_path.parent.mkdir(parents=True, exist_ok=True)
                temporary = self._store_path.with_suffix(".tmp")
                temporary.write_text(json.dumps(kept), encoding="utf-8")
                os.replace(temporary, self._store_path)
            except OSError:
                _log.warning("Could not save the task list to %s", self._store_path, exc_info=True)
