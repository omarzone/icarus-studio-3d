"""Displays show values the engine measures per frame, in training copies, evaluation replays and Play; eyes and
displays are look-only."""

import math

import numpy as np
import pytest

from icarus.contracts.operations import CreateObject, SetProperty
from icarus.contracts.project import Project
from icarus.contracts.properties import ListValue, NumberValue
from icarus.design.scene import scene_description
from icarus.library.look_properties import training_content
from icarus.library.templates import Part, Raw
from icarus.projects.operations import apply_operations
from icarus.projects.validation import validate_project
from icarus.sim.displays import stamp_training_steps, training_step_displays
from icarus.sim.env import ProjectEnv
from icarus.sim.play import PlaySession
from icarus.sim.policy import RandomPolicy
from icarus.training.evaluation import evaluate
from tests.sim.conftest import project_from

THROTTLE = np.array([1.0, -1.0, 0.0], dtype=np.float32)
SOURCES = (
    "episode_time",
    "step",
    "try",
    "training_steps",
    "successes",
    "reward",
    "goal_distance",
    "goal_progress",
    "sensor",
    "plates",
    "fixed",
)


def panel(source: str, **settings: Raw) -> CreateObject:
    display: dict[str, Raw] = {"source": source} | settings
    part = Part(
        f"show_{source}",
        source,
        None,
        {
            "transform": {"position": (0, 6, 2)},
            "mesh": {"shape": "box", "size": (0.1, 2, 0.8)},
            "material": {},
            "display": display,
        },
    )
    return CreateObject(op="create_object", target="world", object=part.spec())


def with_panels(template: str = "parking_car") -> Project:
    operations = [panel(source, sensor="car" if source == "sensor" else "") for source in SOURCES]
    return apply_operations(project_from(template), operations)


def values(signals) -> dict[str, float | None]:
    assert signals is not None
    return {reading.object.removeprefix("show_"): reading.value for reading in signals.displays}


def test_every_display_reads_the_live_world_at_this_step():
    env = ProjectEnv(with_panels())
    env.reset(seed=0)
    total = 0.0
    for _ in range(20):
        total += env.step(THROTTLE)[1]
    shown = values(env.poses().signals)
    state, world = env.state, env.world
    assert state.goal is not None
    distance = math.hypot(state.goal[0] - state.position[0], state.goal[1] - state.position[1])
    assert shown["episode_time"] == pytest.approx(float(world.data.time), abs=1e-3)
    assert shown["step"] == 20
    assert shown["try"] == 1
    assert shown["reward"] == pytest.approx(total, abs=1e-3)
    assert shown["goal_distance"] == pytest.approx(distance, abs=1e-3)
    start = world.tally.start_distance
    assert start is not None and shown["goal_progress"] == pytest.approx(1 - distance / start, abs=1e-3)
    assert shown["sensor"] is not None and 0 <= shown["sensor"] <= 10
    assert (shown["successes"], shown["plates"]) == (0, 0)
    # Nothing trains this copy and a fixed display shows its own text, so the engine reports no value for either.
    assert (shown["training_steps"], shown["fixed"]) == (None, None)
    env.reset(seed=1)
    assert values(env.poses().signals)["try"] == 2


def test_a_goal_display_shows_nothing_without_a_goal():
    env = ProjectEnv(apply_operations(project_from("walker_robot"), [panel("goal_distance")]))
    env.reset(seed=0)
    env.step(np.zeros(len(env.world.actuators), dtype=np.float32))
    assert values(env.poses().signals) == {"goal_distance": None}


def test_a_replayed_checkpoint_shows_its_training_steps_and_live_frames_get_the_run_step():
    project = apply_operations(project_from("parking_car"), [panel("training_steps"), panel("episode_time")])
    rollout = evaluate(project, RandomPolicy(3, seed=0), episodes=1, step=25_000).rollout
    assert {values(frame.signals)["training_steps"] for frame in rollout.frames} == {25_000}
    times = [values(frame.signals)["episode_time"] for frame in rollout.frames]
    assert times == pytest.approx([frame.time for frame in rollout.frames], abs=1e-3)
    env = ProjectEnv(project)
    env.live_recording = True
    env.reset(seed=0)
    signals = env.step(THROTTLE)[4]["live_frame"][4]
    stamp_training_steps(signals, training_step_displays(project), 40_960)
    assert values(signals)["training_steps"] == 40_960


def test_play_shows_the_brains_training_steps_and_the_try_count():
    project = apply_operations(project_from("parking_car"), [panel("training_steps"), panel("try")])
    session = PlaySession(project, 1, RandomPolicy(3, seed=0), seed=0, brain_steps=500_000)
    session.step_realtime(0.2)
    assert values(session.frame().signals) == {"training_steps": 500_000, "try": 1}


def test_scenes_describe_displays_and_eyes_on_the_part_they_sit_on():
    scene = scene_description(ProjectEnv(with_panels("walker_robot")).world.compiled, 0)
    clock = next(item for item in scene.displays if item.source == "episode_time")
    assert (clock.anchor.geom, clock.format, clock.anchor.size) == ("show_episode_time", "time", (0.1, 2, 0.8))
    eyes = scene.eyes[0]
    assert (eyes.anchor.geom, eyes.look) == ("torso", "movement")
    assert eyes.anchor.position == pytest.approx((0, 0, 1))


def test_displays_and_eyes_never_change_what_a_brain_learned():
    project = apply_operations(project_from("walker_robot"), [panel("reward")])
    changes = [
        SetProperty(
            op="set_property",
            object="torso",
            component="eyes",
            property="size",
            value=NumberValue(type="number", value=0.2),
        ),
        SetProperty(
            op="set_property",
            object="show_reward",
            component="display",
            property="source",
            value=ListValue(type="list", value="successes"),
        ),
    ]
    assert training_content(apply_operations(project, changes)) == training_content(project)


def test_eyes_outside_their_range_are_refused():
    change = SetProperty(
        op="set_property", object="torso", component="eyes", property="size", value=NumberValue(type="number", value=5)
    )
    issues = validate_project(apply_operations(project_from("walker_robot"), [change]))
    assert [issue.path for issue in issues] == ["objects.torso.components.eyes.size"]
