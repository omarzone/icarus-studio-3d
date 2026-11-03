"""Behavior tests: fixed scenarios (the same starts, objects moved) a checkpoint is judged on, run on the engine and
kept under the run folder so two brains are always compared on exactly the same episodes."""

import math
import re
from datetime import UTC, datetime
from pathlib import Path
from statistics import mean

from pydantic import TypeAdapter

from icarus.contracts.behavior import BehaviorEpisode, BehaviorTest, BehaviorTestDraft, BehaviorTestResult
from icarus.contracts.project import Project
from icarus.contracts.properties import VectorValue
from icarus.projects.files import write_atomic
from icarus.projects.store import PROJECT_ID, UnknownProject
from icarus.sim.env import EPISODE_SECONDS, ProjectEnv
from icarus.sim.model_state import control_substeps
from icarus.sim.policy import CheckpointPolicy
from icarus.training.episodes import CheckpointEpisodes, succeeded
from icarus.training.evaluation import Evaluation, evaluate
from icarus.training.failure_groups import ending_label
from icarus.training.run_store import RunFolder

# Test seeds sit apart from training and evaluation seeds; each test gets its own block.
TEST_SEED = 20_000
SEED_BLOCK = 100
MAX_TESTS = 24
# Seconds between kept path points.
PATH_INTERVAL = 0.25
STANDARD = BehaviorTest(
    id="standard-starts", name="Standard starts", starts=[TEST_SEED + k for k in range(5)], shifts=[]
)
_TESTS = TypeAdapter(list[BehaviorTest])
_TEST_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,47}$")


class UnknownTest(LookupError):
    pass


class TestRefused(ValueError):
    """The test cannot run or be added as asked; the message says why in plain words."""


def _slug(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40]
    return slug or "test"


class BehaviorTestStore:
    """The behavior tests of each project, kept beside the runs they judge; "Standard starts" is always first."""

    def __init__(self, runs_root: Path) -> None:
        self._root = runs_root / "behavior-tests"

    def _path(self, project_id: str) -> Path:
        if not PROJECT_ID.fullmatch(project_id):
            raise UnknownProject(project_id)
        return self._root / f"{project_id}.json"

    def _added(self, project_id: str) -> list[BehaviorTest]:
        path = self._path(project_id)
        return _TESTS.validate_json(path.read_text(encoding="utf-8")) if path.is_file() else []

    def tests(self, project_id: str) -> list[BehaviorTest]:
        return [STANDARD, *self._added(project_id)]

    def test(self, project_id: str, test_id: str) -> BehaviorTest:
        found = next((test for test in self.tests(project_id) if test.id == test_id), None)
        if found is None:
            raise UnknownTest(test_id)
        return found

    def add(self, project_id: str, draft: BehaviorTestDraft) -> BehaviorTest:
        added = self._added(project_id)
        if len(added) >= MAX_TESTS:
            raise TestRefused(f"A project keeps at most {MAX_TESTS} behavior tests; remove one first")
        taken = {test.id for test in self.tests(project_id)}
        base = _slug(draft.name)
        test_id = next(
            candidate for n in range(1, 1000) if (candidate := base if n == 1 else f"{base}-{n}") not in taken
        )
        used = [(test.starts[0] - TEST_SEED) // SEED_BLOCK for test in added]
        block = TEST_SEED + SEED_BLOCK * (max(used, default=0) + 1)
        test = BehaviorTest(
            id=test_id,
            name=draft.name,
            starts=[block + k for k in range(draft.start_count)],
            shifts=draft.shifts,
            pass_share=draft.pass_share,
        )
        self._save(project_id, [*added, test])
        return test

    def remove(self, project_id: str, test_id: str) -> list[BehaviorTest]:
        if test_id == STANDARD.id:
            raise TestRefused("Standard starts is built in and cannot be removed")
        added = self._added(project_id)
        if not any(test.id == test_id for test in added):
            raise UnknownTest(test_id)
        self._save(project_id, [test for test in added if test.id != test_id])
        return self.tests(project_id)

    def _save(self, project_id: str, tests: list[BehaviorTest]) -> None:
        write_atomic(self._path(project_id), _TESTS.dump_json(tests).decode("utf-8"))


def shifted(project: Project, test: BehaviorTest) -> Project:
    """A copy of the project with the test's objects moved along the ground; the project itself is untouched."""
    copy = project.model_copy(deep=True)
    objects = {obj.id: obj for obj in copy.world.objects}
    for shift in test.shifts:
        obj = objects.get(shift.object)
        if obj is None:
            raise TestRefused(f"The world of this run has no object {shift.object!r}")
        transform = next((item for item in obj.components if item.kind == "transform"), None)
        if transform is None:
            raise TestRefused(f"{obj.name} has no position to move")
        current = transform.properties.get("position")
        x, y, z = current.value if isinstance(current, VectorValue) else (0.0, 0.0, 0.0)
        transform.properties["position"] = VectorValue(type="vector", value=(x + shift.dx, y + shift.dy, z))
    return copy


def _every(path: list[tuple[float, float]], stride: int) -> list[tuple[float, float]]:
    kept = path[::stride]
    return kept if kept[-1] == path[-1] else [*kept, path[-1]]


def _length(path: list[tuple[float, float]]) -> float:
    return sum(math.dist(a, b) for a, b in zip(path, path[1:], strict=False))


def measured_result(
    folder: RunFolder, step: int, test: BehaviorTest, result: Evaluation, control_dt: float
) -> BehaviorTestResult:
    """The test's numbers from the evaluation of its starts."""
    has_goal = result.success_rate is not None
    records = CheckpointEpisodes(
        step=step, has_goal=has_goal, episode_seconds=EPISODE_SECONDS, episodes=result.episodes
    )
    stride = max(1, round(PATH_INTERVAL / control_dt))
    episodes = [
        BehaviorEpisode(
            seed=record.seed,
            passed=succeeded(record, has_goal),
            ending=ending_label(record, records),
            seconds=record.seconds,
            episode_return=round(record.episode_return, 4),
            path=_every(path, stride),
        )
        for record, path in zip(result.episodes, result.paths, strict=True)
    ]
    passed_share = mean(episode.passed for episode in episodes)
    ends = [record.end_distance for record in result.episodes if record.end_distance is not None]
    return BehaviorTestResult(
        test=test,
        run_id=folder.config().run_id,
        step=step,
        ran_at=datetime.now(UTC),
        passed=passed_share >= test.pass_share,
        has_goal=has_goal,
        path_interval=round(stride * control_dt, 4),
        passed_share=passed_share,
        fall_share=mean(record.fell for record in result.episodes),
        mean_seconds=round(mean(record.seconds for record in result.episodes), 3),
        mean_return=round(mean(record.episode_return for record in result.episodes), 4),
        mean_path_length=round(mean(_length(path) for path in result.paths), 3),
        mean_displacement=round(mean(math.dist(path[0], path[-1]) for path in result.paths), 3),
        mean_end_distance=round(mean(ends), 3) if has_goal and ends else None,
        episodes=episodes,
    )


def _result_path(folder: RunFolder, step: int, test_id: str) -> Path:
    if not _TEST_ID.fullmatch(test_id):
        raise UnknownTest(test_id)
    return folder.path / "tests" / str(step) / f"{test_id}.json"


def run_test(folder: RunFolder, step: int, test: BehaviorTest) -> BehaviorTestResult:
    """Judge a checkpoint on a test with MuJoCo and keep the result in the run folder."""
    path = folder.checkpoint_path(step)
    if not path.is_file():
        raise TestRefused(f"There is no checkpoint at step {step:,}")
    project = shifted(folder.project(), test)
    try:
        env = ProjectEnv(project)
    except ValueError as error:
        raise TestRefused(str(error)) from error
    size = env.observation_space.shape[0] if env.observation_space.shape else 0
    control_dt = float(env.world.model.opt.timestep) * control_substeps(env.world)
    try:
        policy = CheckpointPolicy.load(path, f"Checkpoint {step}", size)
    except ValueError as error:
        raise TestRefused(str(error)) from error
    evaluation = evaluate(project, policy, len(test.starts), step, seeds=test.starts, pictured=0)
    result = measured_result(folder, step, test, evaluation, control_dt)
    write_atomic(_result_path(folder, step, test.id), result.model_dump_json())
    return result


def stored_result(folder: RunFolder, step: int, test_id: str) -> BehaviorTestResult | None:
    path = _result_path(folder, step, test_id)
    return BehaviorTestResult.model_validate_json(path.read_text(encoding="utf-8")) if path.is_file() else None


def stored_results(folder: RunFolder) -> list[BehaviorTestResult]:
    """Every test result of a run, by checkpoint then test."""
    root = folder.path / "tests"
    if not root.is_dir():
        return []
    files = sorted(
        root.glob("*/*.json"),
        key=lambda file: (int(file.parent.name), file.stem) if file.parent.name.isdigit() else (-1, ""),
    )
    return [
        BehaviorTestResult.model_validate_json(file.read_text(encoding="utf-8"))
        for file in files
        if file.parent.name.isdigit()
    ]
