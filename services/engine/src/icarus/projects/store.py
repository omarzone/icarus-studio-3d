import re
import shutil
import threading
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel, ConfigDict, ValidationError

from icarus.contracts.design import DesignReport
from icarus.contracts.errors import ValidationIssue
from icarus.contracts.operations import EditOperation, OperationBatch, RenameProject
from icarus.contracts.project import Project, ProjectState, ProjectSummary, Revision
from icarus.design.checks import design_report
from icarus.library.templates import TEMPLATES, template_operations
from icarus.projects.files import append_line, write_atomic
from icarus.projects.operations import OperationError, apply_operations, empty_project
from icarus.projects.validation import validate_project

PROJECT_ID = re.compile(r"^[0-9a-f]{12}$")


class UnknownProject(LookupError):
    pass


class UnknownRevision(LookupError):
    pass


class NothingToUndo(Exception):
    pass


class NothingToRedo(Exception):
    pass


class RejectedBatch(Exception):
    def __init__(self, issues: list[ValidationIssue], report: DesignReport | None) -> None:
        super().__init__("; ".join(issue.message for issue in issues))
        self.issues = issues
        self.report = report


class _Snapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revision: Revision
    project: Project
    report: DesignReport


class _Head(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current: int
    redo: list[int]


def _report_issues(report: DesignReport) -> list[ValidationIssue]:
    return [ValidationIssue(path=check.id, message=check.detail) for check in report.checks if check.status == "fail"]


class ProjectStore:
    """Projects on disk: an append-only revision log, one snapshot per revision and a head pointer."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self._locks: dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()
        self._observers: list[Callable[[str, Revision], None]] = []

    def observe(self, observer: Callable[[str, Revision], None]) -> None:
        """Called with the project id and each new revision; it runs under the project's lock, so it must not call
        the store."""
        self._observers.append(observer)

    @contextmanager
    def _locked(self, project_id: str) -> Iterator[Path]:
        """One request at a time per project, so concurrent edits never share a revision number."""
        directory = self._dir(project_id)
        with self._locks_guard:
            lock = self._locks.setdefault(project_id, threading.Lock())
        with lock:
            yield directory

    def _dir(self, project_id: str) -> Path:
        if not PROJECT_ID.fullmatch(project_id):
            raise UnknownProject(project_id)
        directory = self.root / project_id
        if not (directory / "head.json").is_file():
            raise UnknownProject(project_id)
        return directory

    def _head(self, directory: Path) -> _Head:
        return _Head.model_validate_json((directory / "head.json").read_text(encoding="utf-8"))

    def _snapshot(self, directory: Path, number: int) -> _Snapshot:
        return _Snapshot.model_validate_json((directory / "snapshots" / f"{number}.json").read_text(encoding="utf-8"))

    def _state(self, directory: Path, head: _Head) -> ProjectState:
        snapshot = self._snapshot(directory, head.current)
        return ProjectState(
            project=snapshot.project,
            revision=snapshot.revision,
            report=snapshot.report,
            can_undo=snapshot.revision.parent is not None,
            can_redo=bool(head.redo),
        )

    def _commit(
        self,
        directory: Path,
        project: Project,
        report: DesignReport,
        batch: OperationBatch,
        parent: int | None,
        restored_from: int | None = None,
    ) -> ProjectState:
        numbers = [int(path.stem) for path in (directory / "snapshots").glob("*.json")]
        revision = Revision(
            number=max(numbers, default=0) + 1,
            parent=parent,
            author=batch.author,
            summary=batch.summary,
            operations=batch.operations,
            created_at=datetime.now(UTC),
            restored_from=restored_from,
        )
        snapshot = _Snapshot(revision=revision, project=project, report=report)
        write_atomic(directory / "snapshots" / f"{revision.number}.json", snapshot.model_dump_json())
        head = _Head(current=revision.number, redo=[])
        write_atomic(directory / "head.json", head.model_dump_json())
        append_line(directory / "revisions.jsonl", revision.model_dump_json())
        for observer in self._observers:
            observer(directory.name, revision)
        return self._state(directory, head)

    def _candidate(self, project: Project, operations: list[EditOperation]) -> tuple[Project, DesignReport]:
        try:
            candidate = apply_operations(project, operations)
        except OperationError as error:
            raise RejectedBatch(error.issues, None) from error
        report, _ = design_report(candidate)
        if not report.ok:
            raise RejectedBatch(validate_project(candidate) or _report_issues(report), report)
        return candidate, report

    def list_projects(self) -> list[ProjectSummary]:
        summaries: list[ProjectSummary] = []
        for directory in self.root.glob("*/head.json"):
            try:
                state = self._state(directory.parent, self._head(directory.parent))
            except (OSError, ValidationError):
                continue
            summaries.append(
                ProjectSummary(
                    id=state.project.id,
                    name=state.project.name,
                    description=state.project.description,
                    revision=state.revision.number,
                    updated_at=state.revision.created_at,
                )
            )
        return sorted(summaries, key=lambda summary: summary.updated_at, reverse=True)

    def create(self, name: str, template: str) -> ProjectState:
        operations = template_operations(template)
        project_id = uuid.uuid4().hex[:12]
        project, report = self._candidate(empty_project(project_id, name), operations)
        directory = self.root / project_id
        directory.mkdir(parents=True)
        batch = OperationBatch(operations=operations, summary=f"Created from {TEMPLATES[template].label}")
        return self._commit(directory, project, report, batch, None)

    def duplicate(self, project_id: str, name: str) -> ProjectState:
        source = self.state(project_id).project
        copy_id = uuid.uuid4().hex[:12]
        project = source.model_copy(update={"id": copy_id, "name": name})
        report, _ = design_report(project)
        directory = self.root / copy_id
        directory.mkdir(parents=True)
        # Skins are project data the copy's document still points to (ADR 008).
        skins = self.root / project_id / "skins"
        if skins.is_dir():
            shutil.copytree(skins, directory / "skins")
        batch = OperationBatch(
            operations=[RenameProject(op="rename_project", name=name)], summary=f"Duplicated from {source.name}"
        )
        return self._commit(directory, project, report, batch, None)

    def restore(self, project_id: str, number: int) -> ProjectState:
        with self._locked(project_id) as directory:
            if not (directory / "snapshots" / f"{number}.json").is_file():
                raise UnknownRevision(number)
            head = self._head(directory)
            old = self._snapshot(directory, number)
            batch = OperationBatch(
                operations=[RenameProject(op="rename_project", name=old.project.name)],
                summary=f"Restored revision {number}",
            )
            return self._commit(directory, old.project, old.report, batch, head.current, restored_from=number)

    def project_at(self, project_id: str, number: int) -> Project:
        """The project document as revision `number` left it."""
        with self._locked(project_id) as directory:
            if not (directory / "snapshots" / f"{number}.json").is_file():
                raise UnknownRevision(number)
            return self._snapshot(directory, number).project

    def state(self, project_id: str) -> ProjectState:
        with self._locked(project_id) as directory:
            return self._state(directory, self._head(directory))

    def apply(self, project_id: str, batch: OperationBatch) -> ProjectState:
        with self._locked(project_id) as directory:
            head = self._head(directory)
            current = self._snapshot(directory, head.current)
            project, report = self._candidate(current.project, batch.operations)
            return self._commit(directory, project, report, batch, head.current)

    def revisions(self, project_id: str) -> list[Revision]:
        with self._locked(project_id) as directory:
            log = directory / "revisions.jsonl"
            lines = log.read_text(encoding="utf-8").splitlines() if log.is_file() else []
            return [Revision.model_validate_json(line) for line in lines if line.strip()]

    def undo(self, project_id: str) -> ProjectState:
        with self._locked(project_id) as directory:
            head = self._head(directory)
            parent = self._snapshot(directory, head.current).revision.parent
            if parent is None:
                raise NothingToUndo(project_id)
            moved = _Head(current=parent, redo=[*head.redo, head.current])
            write_atomic(directory / "head.json", moved.model_dump_json())
            return self._state(directory, moved)

    def redo(self, project_id: str) -> ProjectState:
        with self._locked(project_id) as directory:
            head = self._head(directory)
            if not head.redo:
                raise NothingToRedo(project_id)
            moved = _Head(current=head.redo[-1], redo=head.redo[:-1])
            write_atomic(directory / "head.json", moved.model_dump_json())
            return self._state(directory, moved)

    def delete(self, project_id: str) -> None:
        with self._locked(project_id) as directory:
            shutil.rmtree(directory)
