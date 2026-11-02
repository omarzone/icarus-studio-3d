import secrets
import threading

from icarus.contracts.copilot import BuildIdea, BuildStatus, BuildStep, DesignIdea
from icarus.contracts.operations import OperationBatch, RenameProject
from icarus.copilot.architect import IdeaBook, IdeaDraft, UnknownIdeas
from icarus.design.checks import design_report
from icarus.projects.store import ProjectStore, RejectedBatch

BUILD_STEPS = [
    ("read", "Reading the idea"),
    ("world", "Building the world"),
    ("body", "Building the body"),
    ("task", "Setting the task"),
    ("physics", "Testing the physics"),
]


class UnknownBuild(LookupError):
    pass


class UnusableBuild(Exception):
    pass


class _Build:
    def __init__(self, build_id: str) -> None:
        self.build_id = build_id
        self.project_id: str | None = None
        self.done = 0
        self.error: str | None = None

    def status(self) -> BuildStatus:
        steps = [
            BuildStep(
                id=step_id,
                label=label,
                status="done" if index < self.done else "running" if index == self.done and not self.error else "todo",
            )
            for index, (step_id, label) in enumerate(BUILD_STEPS)
        ]
        ready = self.done == len(BUILD_STEPS)
        if self.error:
            activity = f"Stopped: {self.error}"
        elif ready:
            activity = "Ready"
        else:
            activity = BUILD_STEPS[self.done][1]
        return BuildStatus(
            build_id=self.build_id,
            project_id=self.project_id,
            progress=self.done / len(BUILD_STEPS),
            steps=steps,
            activity=activity,
            ready=ready,
            error=self.error,
        )


class BuildBoard:
    """Builds a chosen idea into a project in the background; each step is marked done only once it happened."""

    def __init__(self, projects: ProjectStore, ideas: IdeaBook) -> None:
        self._projects = projects
        self._ideas = ideas
        self._builds: dict[str, _Build] = {}
        self._lock = threading.Lock()

    def start(self, request: BuildIdea) -> BuildStatus:
        idea_set, drafts = self._ideas.get(request.idea_set)
        idea = next((item for item in idea_set.ideas if item.id == request.idea), None)
        draft = drafts.get(request.idea)
        if idea is None or draft is None:
            raise UnknownIdeas(f"{request.idea_set}/{request.idea}")
        build = _Build(secrets.token_hex(6))
        with self._lock:
            self._builds[build.build_id] = build
            status = build.status()
        threading.Thread(target=self._run, args=(build, idea, draft), daemon=True).start()
        return status

    def status(self, build_id: str) -> BuildStatus:
        with self._lock:
            build = self._builds.get(build_id)
            if build is None:
                raise UnknownBuild(build_id)
            return build.status()

    def _advance(self, build: _Build, project_id: str | None = None) -> None:
        with self._lock:
            build.done += 1
            if project_id:
                build.project_id = project_id

    def _run(self, build: _Build, idea: DesignIdea, draft: IdeaDraft) -> None:
        try:
            self._advance(build)
            created = self._projects.create(draft.title, draft.template)
            self._advance(build, created.project.id)
            batch = OperationBatch(
                operations=[
                    RenameProject(op="rename_project", name=draft.title, description=draft.learns),
                    *draft.operations,
                ],
                author="copilot",
                summary=f"Built the idea “{draft.title}”",
            )
            state = self._projects.apply(created.project.id, batch)
            self._advance(build)
            if state.project.task.family != idea.family or not state.project.task.rewards:
                raise UnusableBuild(f"The project does not have the {idea.family} task the idea needs")
            self._advance(build)
            report, _ = design_report(state.project)
            if not report.ok:
                failed = next(check for check in report.checks if check.status == "fail")
                raise UnusableBuild(f"{failed.label}: {failed.detail}")
            self._advance(build)
        except (RejectedBatch, UnusableBuild) as error:
            self._fail(build, str(error))
        except Exception as error:  # noqa: BLE001 - the build reports any failure instead of dying silently
            self._fail(build, f"The build stopped unexpectedly: {error}")

    def _fail(self, build: _Build, error: str) -> None:
        """Stop the build and remove its half-built project, so only finished builds become projects."""
        with self._lock:
            project_id = build.project_id
        if project_id:
            try:
                self._projects.delete(project_id)
            except Exception as cleanup:  # noqa: BLE001 - the build error is still reported if cleanup fails
                error = f"{error} (its unfinished project could not be removed: {cleanup})"
        with self._lock:
            build.project_id = None
            build.error = error
