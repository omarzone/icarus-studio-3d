"""A checkpoint's recorded evaluation episode as an animated PNG, rendered from the MuJoCo states the worker kept."""

from pathlib import Path

from icarus.projects.files import write_atomic_bytes
from icarus.sim.animated_png import animated_png
from icarus.sim.model_state import build_world
from icarus.sim.views import RenderUnavailable, ViewRenderer
from icarus.training import film_strip
from icarus.training.run_store import RunFolder

FRAMES_PER_SECOND = 8
MAX_FRAMES = 120
RENDER_TIMEOUT_S = 180.0


class RecordingMissing(LookupError):
    pass


def export_path(folder: RunFolder, step: int, episode: int) -> Path:
    return folder.path / "exports" / f"step-{step}-e{episode}.png"


def export_recording(folder: RunFolder, step: int, episode: int, views: ViewRenderer) -> Path:
    """Render the episode once and keep it in the run folder; later exports read the kept file."""
    target = export_path(folder, step, episode)
    if target.is_file():
        return target
    states = film_strip.load_states(folder, step, episode)
    if states is None:
        raise RecordingMissing(f"Episode {episode + 1} of checkpoint {step:,} kept no states to render")
    duration = states.times[-1] - states.times[0] if len(states.times) > 1 else 0.0
    count = max(2, min(MAX_FRAMES, len(states.qpos), round(duration * FRAMES_PER_SECOND) + 1))
    project = folder.project()

    def render() -> film_strip.RenderedStrip:
        return film_strip.render_strip(build_world(project), states, count)

    rendered = views.run(render, RENDER_TIMEOUT_S)
    if not rendered.pictures:
        raise RenderUnavailable("Nothing could be rendered on this machine")
    delay = max(20, round(1000 * duration / max(1, len(rendered.pictures) - 1)))
    write_atomic_bytes(target, animated_png([picture.png for picture in rendered.pictures], delay))
    return target
