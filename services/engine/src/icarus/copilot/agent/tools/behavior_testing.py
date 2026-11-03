from typing import Any, Literal

from pydantic import Field

from icarus.contracts.behavior import MAX_SHIFTS, MAX_TEST_STARTS, BehaviorTestDraft, BehaviorTestResult, ObjectShift
from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TurnScope
from icarus.copilot.agent.tools.inspect import compact
from icarus.copilot.step_words import step_said
from icarus.training.behavior_match import NotComparable, compare
from icarus.training.behavior_tests import BehaviorTestStore, TestRefused, UnknownTest, run_test, stored_result
from icarus.training.run_store import RunFolder, UnknownRun


class BehaviorTestArgs(ToolArgs):
    action: Literal["list", "add", "run"]
    name: str | None = Field(default=None, max_length=60, description="Add: the new test's name.")
    start_count: int = Field(default=5, ge=1, le=MAX_TEST_STARTS, description="Add: how many fixed starts.")
    shifts: list[ObjectShift] = Field(
        default=[], max_length=MAX_SHIFTS, description="Add: world objects moved along the ground, in metres."
    )
    test: str | None = Field(default=None, description="Run: the test id; none runs Standard starts.")
    run: str | None = Field(default=None, description="Run: the run id; none means the newest run.")
    step: int | None = Field(default=None, ge=0, description="Run: the checkpoint step; none means the run's best.")
    compare_step: int | None = Field(
        default=None, ge=0, description="Run: another checkpoint of the same run to run the test on and compare."
    )


def _facts(result: BehaviorTestResult) -> dict[str, Any]:
    return {
        "step": result.step,
        "passed": result.passed,
        "passed_share": round(result.passed_share, 3),
        "fall_share": round(result.fall_share, 3),
        "mean_seconds": result.mean_seconds,
        "mean_path_length": result.mean_path_length,
        "mean_end_distance": result.mean_end_distance,
        "endings": [episode.ending for episode in result.episodes],
    }


def _folder(scope: TurnScope, run_id: str | None) -> RunFolder | None:
    runs = scope.services.runs
    if run_id is not None:
        try:
            folder = runs.folder(run_id)
        except UnknownRun:
            return None
        return folder if folder.config().project_id == scope.project_id else None
    newest = runs.list_runs(scope.project_id)
    return runs.folder(newest[0].run_id) if newest else None


def _judged(folder: RunFolder, test_id: str, step: int, store: BehaviorTestStore) -> BehaviorTestResult:
    test = store.test(folder.config().project_id, test_id)
    known = stored_result(folder, step, test_id)
    return known if known is not None and known.test == test else run_test(folder, step, test)


def _run(scope: TurnScope, args: BehaviorTestArgs, store: BehaviorTestStore) -> Observation:
    folder = _folder(scope, args.run)
    if folder is None:
        return Observation(
            "There is no such run of this project yet.", ok=False, summary=step_said("run_missing", scope.language)
        )
    status = folder.status()
    step = args.step if args.step is not None else status.best_step
    if step is None:
        return Observation(
            f"{status.name} has no checkpoint yet.", ok=False, summary=step_said("run_missing", scope.language)
        )
    test_id = args.test or "standard-starts"
    try:
        result = _judged(folder, test_id, step, store)
        facts: dict[str, Any] = {"run": status.name, "test": result.test.name, **_facts(result)}
        if args.compare_step is not None:
            other = _judged(folder, test_id, args.compare_step, store)
            comparison = compare(other, result)
            facts["compared"] = _facts(other)
            facts["path_gap_m"] = comparison.path_gap
            facts["similarity"] = comparison.similarity
    except UnknownTest:
        ids = [test.id for test in store.tests(scope.project_id)]
        return Observation(
            f"There is no test {test_id!r}. Tests: {ids}",
            ok=False,
            summary=step_said("behavior_test_failed", scope.language),
        )
    except (TestRefused, NotComparable) as error:
        return Observation(str(error), ok=False, summary=step_said("behavior_test_failed", scope.language))
    verdict = "behavior_test_passed" if result.passed else "behavior_test_not_passed"
    summary = step_said(verdict, scope.language, name=result.test.name, step=f"{step:,}")
    return Observation(compact(facts), summary=summary, run_facts=True)


def behavior_test(scope: TurnScope, args: BehaviorTestArgs) -> Observation:
    store = BehaviorTestStore(scope.services.runs.root)
    match args.action:
        case "list":
            tests = [test.model_dump() for test in store.tests(scope.project_id)]
            return Observation(
                compact(tests), summary=step_said("behavior_tests_listed", scope.language, count=len(tests))
            )
        case "add":
            if not args.name:
                return Observation(
                    "A new test needs a name.", ok=False, summary=step_said("behavior_test_failed", scope.language)
                )
            objects = {obj.id for obj in scope.state.project.world.objects}
            unknown = [shift.object for shift in args.shifts if shift.object not in objects]
            if unknown:
                text = f"These objects are not in the world: {', '.join(unknown)}. Use find_objects for their ids."
                return Observation(text, ok=False, summary=step_said("behavior_test_failed", scope.language))
            draft = BehaviorTestDraft(name=args.name, start_count=args.start_count, shifts=args.shifts)
            try:
                test = store.add(scope.project_id, draft)
            except TestRefused as error:
                return Observation(str(error), ok=False, summary=step_said("behavior_test_failed", scope.language))
            scope.side_effects.append(f"Added the behavior test {test.name}.")
            return Observation(
                compact(test.model_dump()), summary=step_said("behavior_test_added", scope.language, name=test.name)
            )
        case "run":
            return _run(scope, args, store)


BEHAVIOR_TEST = Tool(
    name="behavior_test",
    description=(
        "Behavior tests judge a checkpoint on fixed scenarios: the same starts, optionally with world objects moved. "
        "list shows the project's tests; add defines one (name, number of starts, object shifts); run judges a "
        "checkpoint (the newest run's best by default) on a test with MuJoCo and reports pass or fail with its "
        "numbers, and with compare_step also runs it on another checkpoint and says how alike their paths are."
    ),
    args=BehaviorTestArgs,
    step="inspect",
    effect="write",
    run=behavior_test,
    per_turn=4,
    timeout_s=240,
    reads_when=lambda args: args.action != "add",
)
