import json

import numpy as np
import pytest

from icarus.contracts.training import MetricPoint, StartRun
from icarus.copilot.attachments import AttachmentStore
from icarus.copilot.checkpoint_coach import CheckpointCoach, LookBudget, gait_values, gait_worse
from icarus.copilot.early_look import EarlyLook
from icarus.copilot.run_frames import RunFrames
from icarus.copilot.settings import ModelSettingsStore
from icarus.projects.store import ProjectStore
from icarus.sim.views import ViewRenderer, encode_png
from icarus.training.episodes import CheckpointEpisodes, EpisodeRecord
from icarus.training.run_store import RunFolder
from tests.copilot.agent_script import scripted_client
from tests.copilot.test_agent_loop import make_copilot
from tests.copilot.test_autopilot import set_patience

# The beginner's ball-pushing tank: facing the goal and staying up pay almost the whole return of a brain that idles.
IDLE_TERMS = {"progress_to_goal": 0.03, "heading_alignment": 144.24, "stay_upright": 115.62, "time_penalty": -12.0}
FINE = {
    "moves": True,
    "ends_early": False,
    "why_it_ends": "",
    "blocker": "",
    "reward_makes_sense": True,
    "reward_note": "",
    "problem": False,
    "summary": "The tank drives and the episodes run their full time.",
}
PICTURE = encode_png(np.full((8, 8, 3), 90, np.uint8))
BLOCKED = FINE | {
    "moves": False,
    "reward_makes_sense": False,
    "reward_note": "heading_alignment and stay_upright pay 96% of the reward for idling.",
    "blocker": "The reward pays the tank to face the goal and stay upright, so it never needs to push the ball.",
    "problem": True,
    "summary": "The untrained tank already earns 247.89 per episode without moving toward the goal.",
}


@pytest.fixture(scope="module")
def views():
    renderer = ViewRenderer()
    yield renderer
    renderer.close()


@pytest.fixture
def copilot(tmp_path, views):
    store = ProjectStore(tmp_path / "projects")
    return make_copilot(tmp_path, store, ModelSettingsStore(tmp_path / "settings"), views)


@pytest.fixture
def run(copilot) -> RunFolder:
    store = copilot.services.projects
    state = store.state(store.create("Tank", "parking_car").project.id)
    status = copilot.services.runs.create(state, StartRun(total_steps=300_000, copies=1), 1)
    return copilot.services.runs.folder(status.run_id)


def checkpoint(folder: RunFolder, step: int, terms: dict[str, float], closer: float = 0.01, **record) -> None:
    """One evaluated checkpoint as the worker writes it: metrics, episode records and the pictures of two."""
    episodes = []
    for index in range(4):
        values = {
            "index": index,
            "seed": 10_000 + index,
            "success": False,
            "fell": False,
            "seconds": 30.0,
            "episode_return": sum(terms.values()),
            "start_distance": 8.85,
            "end_distance": 8.85 - closer,
            "forward": closer,
        }
        if index < 2:
            folder.write_frame(step, f"e{index}-sheet.png", PICTURE)
            values |= {"frames": [f"e{index}-start.png"], "sheet": f"e{index}-sheet.png"}
        episodes.append(EpisodeRecord.model_validate(values | record))
    folder.write_episodes(CheckpointEpisodes(step=step, has_goal=True, episode_seconds=30.0, episodes=episodes))
    folder.append_metric(
        MetricPoint(
            kind="eval",
            step=step,
            elapsed=1.0,
            episode_return=sum(terms.values()),
            episode_length=600,
            success_rate=0.0,
            failure_rate=0.0,
            reward_terms=terms,
        )
    )


def coach(copilot, tmp_path, replies: list[dict], **options):
    client, bodies = scripted_client([{"content": json.dumps(reply)} for reply in replies])
    diagnosed: list[tuple[str, int, list[str]]] = []
    frames = RunFrames(AttachmentStore(tmp_path / "projects"))
    watcher = CheckpointCoach(
        copilot,
        copilot.services.runs,
        lambda run_id, step, notes: diagnosed.append((run_id, step, notes)),
        look=EarlyLook(lambda: (client, True)),
        frames=frames,
        **options,
    )
    return watcher, bodies, diagnosed


def latest(copilot, folder: RunFolder):
    return copilot.conversation(folder.stored_status().project_id).messages[-1]


def test_the_first_checkpoints_get_a_look_with_the_pictures_and_later_ones_a_trend_line_only(copilot, run, tmp_path):
    watcher, bodies, diagnosed = coach(copilot, tmp_path, [FINE])
    for step in (0, 25_000):
        checkpoint(run, step, {"progress_to_goal": 4.0, "reach_goal": 3.0}, closer=2.0)
        watcher.comment(run.run_id, step)
        message = latest(copilot, run)
        assert message.title is not None and message.title.startswith("Early check")
        assert len(message.attachments) == 2 and message.steps[0].tool == "look"
    parts = bodies[0]["messages"][1]["content"]
    assert sum(part["type"] == "image_url" for part in parts) == 2
    assert "Facts:" in parts[0]["text"] and "progress_to_goal" in parts[0]["text"]

    checkpoint(run, 50_000, {"progress_to_goal": 5.0, "reach_goal": 3.0}, closer=2.5)
    watcher.comment(run.run_id, 50_000)
    watcher.comment(run.run_id, 50_000)
    assert len(bodies) == 2 and watcher.looks(run.run_id) == 2 and diagnosed == []
    message = latest(copilot, run)
    assert message.title == "Checkpoint 50,000" and message.steps == []


def test_a_design_problem_seen_at_the_untrained_checkpoint_starts_a_fix_at_once_with_the_evidence(
    copilot, run, tmp_path
):
    watcher, bodies, diagnosed = coach(copilot, tmp_path, [BLOCKED])
    checkpoint(run, 0, IDLE_TERMS)
    watcher.comment(run.run_id, 0)

    facts = bodies[0]["messages"][1]["content"][0]["text"]
    assert "heading_alignment (144.24" in facts and "that reward comes without doing the task" in facts
    assert len(diagnosed) == 1
    run_id, step, notes = diagnosed[0]
    assert (run_id, step) == (run.run_id, 0) and "never needs to push the ball" in notes[0]
    message = latest(copilot, run)
    assert "247.89" in message.text and any(item.tone == "warn" for item in message.checks)
    assert watcher.blocker(run.run_id) is None
    checkpoint(run, 25_000, IDLE_TERMS)
    watcher.comment(run.run_id, 25_000)
    assert len(bodies) == 2 and len(diagnosed) == 1
    # A new problem (the tank now touches painted lines) gets its own fix.
    checkpoint(run, 50_000, IDLE_TERMS, touched="Linea central", touched_at=8.0)
    watcher.comment(run.run_id, 50_000)
    assert len(bodies) == 3 and len(diagnosed) == 2


def test_under_an_autopilot_the_problem_becomes_a_blocker_for_the_loop_instead_of_a_diagnosis(copilot, run, tmp_path):
    watcher, _, diagnosed = coach(copilot, tmp_path, [BLOCKED], piloted=lambda _project: True)
    checkpoint(run, 0, IDLE_TERMS)
    watcher.comment(run.run_id, 0)
    found = watcher.blocker(run.run_id)
    assert diagnosed == [] and found is not None and found.rule == "design_blocker"
    assert "never needs to push the ball" in found.reason


def test_later_looks_come_only_from_new_problems_and_stay_within_the_budget(copilot, run, tmp_path):
    budget = LookBudget(early_checkpoints=1, per_run=2, after_problem=0)
    watcher, bodies, _ = coach(copilot, tmp_path, [FINE], budget=budget)
    checkpoint(run, 0, {"progress_to_goal": 4.0, "reach_goal": 3.0}, closer=2.0)
    watcher.comment(run.run_id, 0)
    checkpoint(run, 25_000, {"progress_to_goal": 4.0, "reach_goal": 3.0}, closer=2.0)
    watcher.comment(run.run_id, 25_000)
    assert len(bodies) == 1
    checkpoint(run, 50_000, {"progress_to_goal": 4.0}, closer=2.0, touched="Linea central", touched_at=8.0)
    watcher.comment(run.run_id, 50_000)
    assert len(bodies) == 2 and latest(copilot, run).title == "Coach look · step 50,000"
    checkpoint(run, 100_000, {"progress_to_goal": 4.0}, closer=0.0, fell=True, seconds=0.5)
    watcher.comment(run.run_id, 100_000)
    assert len(bodies) == 2 and watcher.looks(run.run_id) == 2


def test_a_number_the_model_made_up_is_sent_back_once_and_then_left_out(copilot, run, tmp_path):
    invented = FINE | {"summary": "The tank moved 42.5 m. It drives well."}
    watcher, bodies, _ = coach(copilot, tmp_path, [invented, invented])
    checkpoint(run, 0, {"progress_to_goal": 4.0, "reach_goal": 3.0}, closer=2.0)
    watcher.comment(run.run_id, 0)
    assert len(bodies) == 2 and "42.5" in bodies[1]["messages"][-1]["content"]
    text = latest(copilot, run).text
    assert "42.5" not in text and "It drives well." in text


CRAWLS = FINE | {
    "gait": [
        {
            "behavior": "crawls_on_knees",
            "seen": "The body rests on its knees and pushes itself along.",
            "area": "reward",
            "change": "Pay for keeping the torso up.",
        },
        {"behavior": "moves_well", "seen": "It keeps moving forward.", "area": "reward", "change": ""},
    ]
}


def test_how_the_body_moves_reaches_the_message_as_findings_with_their_design_area(copilot, run, tmp_path):
    watcher, bodies, _ = coach(copilot, tmp_path, [CRAWLS])
    checkpoint(run, 0, {"progress_to_goal": 4.0, "reach_goal": 3.0}, closer=2.0)
    watcher.comment(run.run_id, 0)

    assert "HOW the body moves" in bodies[0]["messages"][0]["content"]
    findings = latest(copilot, run).findings
    assert [(item.area, item.change) for item in findings] == [("reward", "Pay for keeping the torso up.")]
    assert findings[0].proposal_id is None


def test_a_learning_curve_that_turns_flat_gets_one_more_look_within_the_budget(copilot, run, tmp_path):
    # Flat by 100k steps counts once the brain has trained a tenth of navigation's budget.
    set_patience(0.1)
    budget = LookBudget(early_checkpoints=1, per_run=3, after_problem=0)
    watcher, bodies, _ = coach(copilot, tmp_path, [FINE], budget=budget)
    # The return rises once at 50k and then holds: a flat curve, but not yet three checkpoints without a gain.
    for step in (0, 25_000):
        checkpoint(run, step, {"progress_to_goal": 0.0, "reach_goal": 0.0}, closer=2.0)
        watcher.comment(run.run_id, step)
    for step in (50_000, 75_000, 100_000):
        checkpoint(run, step, {"progress_to_goal": 4.0, "reach_goal": 3.0}, closer=2.0)
        watcher.comment(run.run_id, step)

    assert len(bodies) == 2
    facts = bodies[1]["messages"][1]["content"][0]["text"]
    assert '"why_this_look":["progress stalled"]' in facts and '"step":100000' in facts


def test_a_gait_signal_counts_as_worse_only_when_it_moved_the_wrong_way_clearly():
    assert gait_worse({"twitching": 0.4, "body_low": 0.8}, {"twitching": 0.6, "body_low": 0.79}) == ["twitching"]
    assert gait_worse({"body_low": 0.8}, {"body_low": 0.5}) == ["body_low"]
    assert gait_worse({}, {"hopping": 0.9}) == [] and gait_values([]) == {}
