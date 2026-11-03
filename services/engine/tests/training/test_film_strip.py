import numpy as np

from icarus.contracts.training import StartRun
from icarus.training import film_strip
from icarus.training.evaluation import EpisodeStates
from icarus.training.run_store import RunStore


def _states(steps: int, failure: int | None) -> EpisodeStates:
    return EpisodeStates(
        [0.05 * i for i in range(steps + 1)], [np.full(3, i, np.float64) for i in range(steps + 1)], failure
    )


def test_a_strip_samples_the_episode_at_a_fixed_interval_and_adds_the_failure_moment():
    indices = film_strip.strip_indices(_states(600, 333))

    assert indices[0] == 0 and indices[-1] == 600
    assert 333 in indices and len(indices) == film_strip.STRIP_FRAMES + 1
    regular = [index for index in indices if index != 333]
    gaps = {b - a for a, b in zip(regular, regular[1:], strict=False)}
    assert max(gaps) - min(gaps) <= 1


def test_kept_states_read_back_as_the_episode_the_worker_recorded(tmp_path, parking_state):
    store = RunStore(tmp_path)
    folder = store.folder(store.create(parking_state, StartRun(total_steps=10_000, copies=1), threads=1).run_id)
    film_strip.save_states(folder, 0, [_states(40, None), _states(10, 7)])

    assert film_strip.stored_episodes(folder, 0) == [0, 1]
    second = film_strip.load_states(folder, 0, 1)
    assert second is not None and second.failure_index == 7 and len(second.qpos) == 11
    assert second.times[-1] == 0.5 and float(second.qpos[4][0]) == 4.0
    assert film_strip.load_states(folder, 0, 2) is None


def test_the_sheet_lays_frames_in_rows_and_frames_the_failure_in_red():
    pixels = np.full((film_strip.FRAME_HEIGHT, film_strip.FRAME_WIDTH, 3), 90, np.uint8)
    sheet = film_strip.strip_sheet([(pixels, False)] * 8 + [(pixels, True)])

    height, width = film_strip.FRAME_HEIGHT // 2, film_strip.FRAME_WIDTH // 2
    assert sheet.shape == (2 * height, film_strip.COLUMNS * width, 3)
    # The ninth frame is the second of the second row, with a red edge and grey inside.
    assert sheet[height, width + width // 2].tolist() == film_strip.FAILURE_COLOR.tolist()
    assert sheet[height + height // 2, width + width // 2].tolist() == [90, 90, 90]
    assert film_strip.stacked(sheet, sheet[:height]).shape[0] == 3 * height + film_strip.GAP
