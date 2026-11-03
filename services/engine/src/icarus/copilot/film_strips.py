"""Film strips of recorded episodes for the coach: rendered on the engine's render thread from the states the worker
kept, published once as chat attachments, and read back from them on the next look."""

import logging
import threading
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel, ConfigDict

from icarus.contracts.coach import FilmStrip, FilmStripFrame
from icarus.copilot.attachments import AttachmentStore, UnknownAttachment
from icarus.sim.model_state import build_world
from icarus.sim.views import RenderUnavailable, ViewRenderer, encode_png
from icarus.training import film_strip
from icarus.training.episodes import CheckpointEpisodes
from icarus.training.run_store import RunFolder

log = logging.getLogger(__name__)

RENDER_TIMEOUT_S = 60.0
SHEET_LAYOUT = (
    f"a film strip of one episode: frames in time order, left to right and top to bottom in rows of "
    f"{film_strip.COLUMNS}, at a fixed interval, with the failure moment framed in red"
)


class _Stored(BaseModel):
    model_config = ConfigDict(extra="forbid")

    strip: FilmStrip
    sheet_id: str


@dataclass(frozen=True)
class PublishedStrip:
    strip: FilmStrip
    sheet: bytes

    @property
    def failure_time(self) -> float | None:
        return next((frame.time for frame in self.strip.frames if frame.failure), None)

    def facts(self) -> dict[str, object]:
        """What the strip shows in numbers, read from the episode's states."""
        times = [frame.time for frame in self.strip.frames]
        facts: dict[str, object] = {
            "step": self.strip.step,
            "episode": self.strip.episode,
            "frames": len(times),
            "interval_seconds": self.strip.interval,
            "frame_times": times,
        }
        if self.failure_time is not None:
            facts["failure_frame_time"] = self.failure_time
        return facts


def representative(episodes: CheckpointEpisodes | None, stored: list[int]) -> int | None:
    """The kept episode that ended the way most evaluation episodes did."""
    if not stored:
        return None
    if episodes is None:
        return stored[0]
    records = {record.index: record for record in episodes.episodes}
    failed = sum(1 for record in episodes.episodes if record.fell or record.touched is not None)
    most_failed = failed * 2 > len(episodes.episodes)
    for index in stored:
        record = records.get(index)
        if record is not None and (record.fell or record.touched is not None) == most_failed:
            return index
    return stored[0]


class FilmStrips:
    def __init__(self, views: ViewRenderer, attachments: AttachmentStore) -> None:
        self._views = views
        self._attachments = attachments
        self._lock = threading.Lock()

    def episode(self, folder: RunFolder, step: int, episode: int | None) -> int | None:
        stored = film_strip.stored_episodes(folder, step)
        if episode is not None:
            return episode if episode in stored else None
        return representative(folder.episodes(step), stored)

    def strip(self, folder: RunFolder, step: int, episode: int | None = None) -> PublishedStrip | None:
        """The strip of a checkpoint's episode; None when its states were not kept or nothing can render."""
        chosen = self.episode(folder, step, episode)
        if chosen is None:
            return None
        index = folder.frames_folder(step) / f"strip-e{chosen}.json"
        with self._lock:
            known = self._known(index)
            if known is not None:
                return known
            rendered = self._render(folder, step, chosen)
            if rendered is None:
                return None
            project_id = folder.stored_status().project_id
            frames = [
                FilmStripFrame(
                    attachment_id=self._attachments.add_bytes(
                        project_id, f"step-{step}-e{chosen}-{number:02d}.png", "image/png", picture.png, "view"
                    ).id,
                    time=picture.time,
                    failure=picture.failure,
                )
                for number, picture in enumerate(rendered.pictures)
            ]
            sheet = rendered.sheet_png
            sheet_info = self._attachments.add_bytes(
                project_id, f"step-{step}-e{chosen}-strip.png", "image/png", sheet, "view"
            )
            strip = FilmStrip(step=step, episode=chosen, interval=rendered.interval, frames=frames[:32])
            index.write_text(_Stored(strip=strip, sheet_id=sheet_info.id).model_dump_json(), encoding="utf-8")
            return PublishedStrip(strip, sheet)

    def compared(self, first: tuple[RunFolder, int], second: tuple[RunFolder, int]) -> bytes | None:
        """The representative strips of two checkpoints one above the other, the first on top."""
        sheets = []
        for folder, step in (first, second):
            chosen = self.episode(folder, step, None)
            rendered = self._render(folder, step, chosen) if chosen is not None else None
            if rendered is None:
                return None
            sheets.append(rendered.sheet)
        return encode_png(film_strip.stacked(sheets[0], sheets[1]))

    def _render(self, folder: RunFolder, step: int, episode: int) -> film_strip.RenderedStrip | None:
        states = film_strip.load_states(folder, step, episode)
        if states is None:
            return None
        project = folder.project()

        def render() -> film_strip.RenderedStrip:
            return film_strip.render_strip(build_world(project), states)

        try:
            rendered = self._views.run(render, RENDER_TIMEOUT_S)
        except RenderUnavailable:
            return None
        except Exception:  # noqa: BLE001 - a strip is extra evidence: the look goes on without it
            log.exception("a film strip could not be rendered")
            return None
        return rendered if rendered.pictures else None

    def _known(self, index: Path) -> PublishedStrip | None:
        if not index.is_file():
            return None
        try:
            stored = _Stored.model_validate_json(index.read_text(encoding="utf-8"))
            return PublishedStrip(stored.strip, self._attachments.get(stored.sheet_id).content())
        except (UnknownAttachment, OSError, ValueError):
            return None
