"""Re-publishes the training run's events on the engine bus and tells the checkpoint coach about coached runs."""

import logging
import threading
from collections.abc import Callable

from icarus.api.runs import _EventCursor
from icarus.contracts.events import RunEventWrapper
from icarus.contracts.project import ProjectState
from icarus.contracts.training import CheckpointEvent, RunGroup, RunStatus, StartRun
from icarus.tasks import Publisher
from icarus.training.run_store import RunStore, UnknownRun
from icarus.training.supervisor import Supervisor

POLL_PERIOD = 1.0
# Snapshots stay on the run's own stream: they are frequent and only the open Train view draws them.
RELAYED = frozenset({"status", "metric", "checkpoint", "log"})

log = logging.getLogger(__name__)


class RunRelay:
    def __init__(
        self,
        runs: RunStore,
        active_runs: Callable[[], list[str]],
        publish: Publisher,
        on_checkpoint: Callable[[str, int], None] | None = None,
    ) -> None:
        self._runs = runs
        self._active_runs = active_runs
        self._publish = publish
        self._on_checkpoint = on_checkpoint
        self._cursors: dict[str, _EventCursor] = {}
        self._coached: set[str] = set()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def coach(self, run_id: str) -> None:
        """The person asked the copilot to coach this run: it comments at each of its checkpoints."""
        self._coached.add(run_id)

    def start(self) -> None:
        self._thread = threading.Thread(target=self._follow, name="run-relay", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join()

    def poll(self) -> None:
        for active in self._active_runs():
            if active in self._cursors:
                continue
            try:
                self._cursors[active] = _EventCursor(self._runs.folder(active))
            except UnknownRun:
                continue
        for run_id, cursor in list(self._cursors.items()):
            events, finished = cursor.poll()
            project_id = cursor.folder.config().project_id
            for event in events:
                if event.type in RELAYED:
                    self._publish(RunEventWrapper(type="run_event", run_id=run_id, event=event), project_id)
                if isinstance(event, CheckpointEvent) and run_id in self._coached and self._on_checkpoint:
                    self._on_checkpoint(run_id, event.checkpoint.step)
            if finished:
                del self._cursors[run_id]
                self._coached.discard(run_id)

    def _follow(self) -> None:
        while not self._stop.wait(POLL_PERIOD):
            try:
                self.poll()
            except Exception:  # A broken run folder must not stop the relay for the next one.
                log.exception("run relay poll failed")


class CoachedSupervisor(Supervisor):
    """The supervisor that hands runs started with `coach` to the relay, so every start path honors the switch."""

    relay: RunRelay | None = None

    def start(self, state: ProjectState, start: StartRun, threads: int, use_graphics_card: bool) -> RunStatus:
        status = super().start(state, start, threads, use_graphics_card)
        if start.coach and self.relay is not None:
            self.relay.coach(status.run_id)
        return status

    def start_group(self, state: ProjectState, start: StartRun, threads: int, use_graphics_card: bool) -> RunGroup:
        group = super().start_group(state, start, threads, use_graphics_card)
        if start.coach and self.relay is not None:
            for status in group.runs:
                self.relay.coach(status.run_id)
        return group
