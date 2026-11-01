import secrets
import threading

from icarus.contracts.copilot import BuildIdea, BuildStatus, BuildStep, DesignIdea
from icarus.contracts.operations import EditOperation, OperationBatch, RenameProject
from icarus.contracts.project import ProjectState
from icarus.copilot.architect import IdeaBook, PlannedIdea, UnknownIdeas
from icarus.copilot.scratch_stages import ScratchDesign, trainability_problem
from icarus.design.checks import design_report
from icarus.projects.store import ProjectStore, RejectedBatch

BUILD_STEPS = [
    ("read", "Reading the idea"),
    ("world", "Building the world"),
    ("body", "Building the body"),
    ("task", "Setting the task"),
    ("physics", "Testing the physics"),
]


def scratch_steps(design: ScratchDesign) -> list[tuple[str, str]]:
    return [("plan", "Planning the design"), *((stage.id, stage.label) for stage in design.stages), BUILD_STEPS[-1]]


class UnknownBuild(LookupError):
    pass


class UnusableBuild(Exception):
    pass


class _Build:
    def __init__(self, build_id: str, steps: list[tuple[str, str]]) -> None:
        self.build_id = build_id
        self.steps = steps
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
            for index, (step_id, label) in enumerate(self.steps)
        ]
        ready = self.done == len(self.steps)
        if self.error:
            activity = f"Stopped: {self.error}"
        elif ready:
            activity = "Ready"
        else:
            activity = self.steps[self.done][1]
        return BuildStatus(
            build_id=self.build_id,
            project_id=self.project_id,
            progress=self.done / len(self.steps),
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
        self._by_idea: dict[tuple[str, str], _Build] = {}
        self._lock = threading.Lock()

    def start(self, request: BuildIdea) -> BuildStatus:
        idea_set, planned = self._ideas.get(request.idea_set)
        idea = next((item for item in idea_set.ideas if item.id == request.idea), None)
        chosen = planned.get(request.idea)
        if idea is None or chosen is None:
            raise UnknownIdeas(f"{request.idea_set}/{request.idea}")
        key = (request.idea_set, request.idea)
        steps = scratch_steps(chosen.design) if chosen.design else BUILD_STEPS
        with self._lock:
            # Building the same idea again returns the build already made or running, not a second project.
            earlier = self._by_idea.get(key)
            if earlier is not None and earlier.error is None:
                return earlier.status()
            build = _Build(secrets.token_hex(6), steps)
            self._builds[build.build_id] = build
            self._by_idea[key] = build
            status = build.status()
        threading.Thread(target=self._run, args=(build, idea, chosen), daemon=True).start()
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

    def _apply(self, project_id: str, operations: list[EditOperation], summary: str) -> ProjectState:
        batch = OperationBatch(operations=operations, author="copilot", summary=summary)
        return self._projects.apply(project_id, batch)

    def _run_template(self, build: _Build, idea: DesignIdea, chosen: PlannedIdea) -> None:
        draft = chosen.draft
        self._advance(build)
        created = self._projects.create(draft.title, draft.template)
        self._advance(build, created.project.id)
        rename = RenameProject(op="rename_project", name=draft.title, description=draft.learns)
        state = self._apply(created.project.id, [rename, *draft.operations], f"Built the idea “{draft.title}”")
        self._advance(build)
        if state.project.task.family != idea.family or not state.project.task.rewards:
            raise UnusableBuild(f"The project does not have the {idea.family} task the idea needs")
        self._advance(build)
        report, _ = design_report(state.project)
        if not report.ok:
            failed = next(check for check in report.checks if check.status == "fail")
            raise UnusableBuild(f"{failed.label}: {failed.detail}")
        self._advance(build)

    def _run_scratch(self, build: _Build, chosen: PlannedIdea, design: ScratchDesign) -> None:
        """Each tested stage becomes its own copilot revision, so the project's history shows how it was built."""
        draft = chosen.draft
        self._advance(build)
        project_id = self._projects.create(draft.title, "empty_world").project.id
        with self._lock:
            build.project_id = project_id
        for stage in design.stages:
            operations = stage.operations
            summary = stage.label.replace("Building", "Built").replace("Setting", "Set")
            if stage.id == "world":
                rename = RenameProject(op="rename_project", name=draft.title, description=draft.learns)
                operations = [rename, *operations]
                summary = f"Built the world of “{draft.title}”"
            self._apply(project_id, operations, summary)
            self._advance(build)
        problem = trainability_problem(self._projects.state(project_id).project)
        if problem:
            raise UnusableBuild(problem)
        self._advance(build)

    def _run(self, build: _Build, idea: DesignIdea, chosen: PlannedIdea) -> None:
        try:
            if chosen.design:
                self._run_scratch(build, chosen, chosen.design)
            else:
                self._run_template(build, idea, chosen)
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
