from icarus.training.live_motion import LEAD, LiveMotion, frame_rate

STEP = 0.05
ROWS = [[0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0]]


class OneCopy:
    """One training copy stepping its episodes, capturing a frame only on the steps the live motion asks for."""

    def __init__(self, motion: LiveMotion, episode_steps: int) -> None:
        self.motion = motion
        self.episode_steps = episode_steps
        self.episode, self.steps = 1, 0
        self.capture = True

    def step(self, now: float) -> None:
        self.steps += 1
        done = self.steps == self.episode_steps
        info = {"live_frame": (self.episode, round(self.steps * STEP, 3), ROWS, [])} if self.capture else {}
        self.capture = self.motion.record([info], [done], now)[0]
        if done:
            self.episode, self.steps = self.episode + 1, 0


def stream_seconds(sent: list[tuple[int, float]]) -> float:
    """Sim time a 1x view takes to play what was sent: each episode's own time, a frame at each cut."""
    pairs = zip(sent, sent[1:], strict=False)
    return STEP + sum(now - before if episode == previous else STEP for (previous, before), (episode, now) in pairs)


def streamed(motion: LiveMotion, now: float) -> list[tuple[int, float]]:
    return [(segment.episode, time) for segment in motion.flush(now)[0] for time in segment.times]


def test_realtime_streams_one_episode_contiguously_and_no_further_ahead_than_playback_allows():
    motion = LiveMotion("realtime", copies=1, fps=20)
    copy = OneCopy(motion, episode_steps=200)
    sent: list[tuple[int, float]] = []
    # Training runs ten times faster than real time: 40 steps (2 s of sim) every 0.2 s of wall time.
    for tick in range(60):
        for _ in range(40):
            copy.step(tick * 0.2)
        sent += streamed(motion, tick * 0.2)
        assert stream_seconds(sent) <= tick * 0.2 + LEAD + 2 * STEP

    episodes = [episode for episode, _ in sent]
    assert episodes == sorted(episodes)
    first = [time for episode, time in sent if episode == 1]
    assert first == [round(STEP * step, 3) for step in range(1, 201)]
    # The next episode shown is the one the copy was in when the first had been sent, not the one right after it.
    assert sent[len(first)][0] > 2


def test_realtime_asks_for_no_frames_while_a_shown_episode_waits_to_be_sent():
    motion = LiveMotion("realtime", copies=1, fps=20)
    copy = OneCopy(motion, episode_steps=10)
    for _ in range(10):
        copy.step(0.0)
    asked = []
    for _ in range(30):
        copy.step(0.0)
        asked.append(copy.capture)
    assert not any(asked)
    streamed(motion, 0.0)
    copy.step(0.0)
    assert copy.capture


def test_fast_streams_every_episode_thinned_to_the_frame_rate_in_wall_time():
    motion = LiveMotion("fast", copies=1, fps=10)
    copy = OneCopy(motion, episode_steps=20)
    sent: list[tuple[int, float]] = []
    for tick in range(10):
        for step in range(40):
            copy.step(tick * 0.2 + step * 0.005)
        sent += streamed(motion, tick * 0.2 + 0.2)
    assert 15 <= len(sent) <= 25
    episodes = [episode for episode, _ in sent]
    assert episodes == sorted(episodes) and len(set(episodes)) > 10


def test_bigger_streams_get_fewer_frames_but_never_fewer_than_five_a_second():
    assert frame_rate(copies=1, geoms=7, rays=0, snapshots_per_second=5) == 20
    assert 5 < frame_rate(copies=4, geoms=20, rays=0, snapshots_per_second=5) < 20
    assert frame_rate(copies=64, geoms=40, rays=48, snapshots_per_second=5) == 5
