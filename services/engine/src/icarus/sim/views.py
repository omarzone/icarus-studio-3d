import struct
import threading
import zlib
from collections import OrderedDict
from collections.abc import Callable, Mapping
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import mujoco
import numpy as np

from icarus.contracts.scene import SceneZone
from icarus.design.compiler import CompiledModel
from icarus.design.looks import GeomLook
from icarus.sim.offscreen_gl import rendering_available

# Zones are annotations on the picture only: spawn blue, goal green, any other zone amber.
ZONE_COLORS = {
    "spawn_point": (0.25, 0.5, 1.0, 0.45),
    "goal_zone": (0.1, 0.9, 0.2, 0.45),
    "zone": (1.0, 0.7, 0.1, 0.45),
}
RENDERERS_KEPT = 2
SHEET_GAP = 6
_PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class RenderUnavailable(RuntimeError):
    """No offscreen OpenGL context could be created on this machine."""


class BlankPicture(RuntimeError):
    """The render came out as one flat color, so it shows nothing of the scene."""


# A frame whose pixels barely vary is a failed render, not a picture of the scene.
BLANK_SPREAD = 1.0


def is_blank(pixels: np.ndarray) -> bool:
    return float(pixels.std()) < BLANK_SPREAD


@dataclass(frozen=True)
class CameraSpec:
    lookat: tuple[float, float, float]
    distance: float
    # Degrees: azimuth 0 looks along +x, elevation below zero looks down.
    azimuth: float
    elevation: float
    width: int = 640
    height: int = 400
    # Vertical field of view in degrees; None keeps the model's.
    fov: float | None = None


def _chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def encode_png(pixels: np.ndarray) -> bytes:
    """An 8-bit RGB PNG of an (height, width, 3) array, written with the standard library."""
    height, width, _ = pixels.shape
    rows = np.concatenate([np.zeros((height, 1), np.uint8), pixels.astype(np.uint8).reshape(height, width * 3)], 1)
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        _PNG_SIGNATURE
        + _chunk(b"IHDR", header)
        + _chunk(b"IDAT", zlib.compress(rows.tobytes(), 6))
        + _chunk(b"IEND", b"")
    )


def _zone_geoms(scene: mujoco.MjvScene, zones: list[SceneZone]) -> None:
    for zone in zones:
        if scene.ngeom >= scene.maxgeom:
            return
        rotation = np.zeros(9)
        mujoco.mju_quat2Mat(rotation, np.asarray(zone.quaternion, dtype=float))
        half = np.asarray(zone.size, dtype=float) / 2
        kind = mujoco.mjtGeom.mjGEOM_BOX if zone.shape == "box" else mujoco.mjtGeom.mjGEOM_SPHERE
        size = half if zone.shape == "box" else np.array([half[0], 0.0, 0.0])
        rgba = np.asarray(ZONE_COLORS[zone.kind], dtype=np.float32)
        mujoco.mjv_initGeom(scene.geoms[scene.ngeom], kind, size, np.asarray(zone.position), rotation, rgba)
        scene.ngeom += 1


# Leafy ornaments read as rounded crowns in a picture; arms, booms and plates as boxes.
ROUND_ORNAMENTS = frozenset({"crown_round", "crown_cone", "crown_oval", "shrubs"})


def _ornament_geoms(scene: mujoco.MjvScene, model: mujoco.MjModel, data: mujoco.MjData, looks: Mapping[str, GeomLook]):
    """Ornaments drawn into the picture only, riding on their geoms; MuJoCo's model never holds them."""
    for name, look in looks.items():
        if not look.ornaments:
            continue
        geom = int(mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, name))
        if geom < 0:
            continue
        frame = data.geom_xmat[geom].reshape(3, 3)
        for ornament in look.ornaments:
            if scene.ngeom >= scene.maxgeom:
                return
            turn = np.zeros(9)
            mujoco.mju_quat2Mat(turn, np.asarray(ornament.quaternion, dtype=float))
            rotation = frame @ turn.reshape(3, 3)
            center = data.geom_xpos[geom] + frame @ np.asarray(ornament.offset, dtype=float)
            round_ = ornament.style in ROUND_ORNAMENTS
            kind = mujoco.mjtGeom.mjGEOM_ELLIPSOID if round_ else mujoco.mjtGeom.mjGEOM_BOX
            rgba = [int(ornament.color[index : index + 2], 16) / 255 for index in (1, 3, 5)] + [1.0]
            half = np.asarray(ornament.size, dtype=float) / 2
            mujoco.mjv_initGeom(
                scene.geoms[scene.ngeom], kind, half, center, rotation.flatten(), np.asarray(rgba, np.float32)
            )
            scene.ngeom += 1


# Colliders mode paints what the physics touches by role and hides what only decorates.
COLLIDER_COLORS = {
    "floor": (0.55, 0.57, 0.6, 1.0),
    "static": (0.36, 0.56, 0.9, 1.0),
    "moving": (0.96, 0.56, 0.2, 1.0),
}


# A geom group the default scene option does not draw.
HIDDEN_GROUP = 3


def _paint_colliders(scene: mujoco.MjvScene, model: mujoco.MjModel) -> None:
    for index in range(scene.ngeom):
        geom = scene.geoms[index]
        if geom.objtype != mujoco.mjtObj.mjOBJ_GEOM or geom.objid < 0:
            continue
        number = geom.objid
        if model.geom_type[number] == mujoco.mjtGeom.mjGEOM_PLANE:
            role = "floor"
        else:
            role = "static" if model.body_weldid[model.geom_bodyid[number]] == 0 else "moving"
        geom.rgba[:] = COLLIDER_COLORS[role]
        geom.matid = -1


def contact_sheet(cells: list[np.ndarray], columns: int, cell: tuple[int, int], gap: int = 0) -> np.ndarray:
    """Pictures of one size in rows of `columns`, left to right then top to bottom, with a dark gap between them."""
    height, width = cell
    rows = max(1, -(-len(cells) // columns))
    shape = (rows * height + (rows - 1) * gap, columns * width + (columns - 1) * gap, 3)
    sheet = np.full(shape, 24 if gap else 0, np.uint8)
    for number, pixels in enumerate(cells):
        row, column = divmod(number, columns)
        top, left = row * (height + gap), column * (width + gap)
        sheet[top : top + height, left : left + width] = pixels[:height, :width]
    return sheet


def _camera(camera: CameraSpec) -> mujoco.MjvCamera:
    free = mujoco.MjvCamera()
    free.type = mujoco.mjtCamera.mjCAMERA_FREE
    free.lookat[:] = camera.lookat
    free.distance = camera.distance
    free.azimuth = camera.azimuth
    free.elevation = camera.elevation
    return free


def render_pixels(
    renderer: mujoco.Renderer,
    data: mujoco.MjData,
    camera: CameraSpec,
    zones: list[SceneZone],
    colliders: bool = False,
    looks: Mapping[str, GeomLook] | None = None,
) -> np.ndarray:
    """A state MuJoCo already computed, seen from a free camera, with zones drawn over it, as RGB pixels; with `looks`,
    the parts' ornaments too, unless the picture shows only colliders."""
    model = renderer.model
    fovy, groups = model.vis.global_.fovy, model.geom_group.copy()
    if camera.fov is not None:
        model.vis.global_.fovy = camera.fov
    if colliders:
        # Decoration touches nothing, so it leaves the scene for this one picture.
        model.geom_group[(model.geom_contype == 0) & (model.geom_conaffinity == 0)] = HIDDEN_GROUP
    try:
        renderer.update_scene(data, _camera(camera))
    finally:
        model.vis.global_.fovy = fovy
        model.geom_group[:] = groups
    scene = renderer.scene
    # The renderer is reused, so every render sets these flags again.
    scene.flags[mujoco.mjtRndFlag.mjRND_SKYBOX] = not colliders
    scene.flags[mujoco.mjtRndFlag.mjRND_REFLECTION] = not colliders
    if colliders:
        _paint_colliders(scene, model)
    elif looks:
        _ornament_geoms(scene, model, data, looks)
    _zone_geoms(scene, zones)
    return renderer.render()


def _blank(pixels: np.ndarray) -> BlankPicture:
    return BlankPicture(f"every pixel is close to {pixels.reshape(-1, 3).mean(axis=0).round().tolist()}")


def render_view(
    renderer: mujoco.Renderer,
    compiled: CompiledModel,
    camera: CameraSpec,
    zones: list[SceneZone],
    colliders: bool = False,
) -> bytes:
    """The compiled initial state MuJoCo computes, seen from a free camera, with zones drawn over it, as PNG."""
    data = mujoco.MjData(compiled.model)
    mujoco.mj_forward(compiled.model, data)
    pixels = render_pixels(renderer, data, camera, zones, colliders, compiled.looks)
    if is_blank(pixels):
        raise _blank(pixels)
    return encode_png(pixels)


def render_sheet(
    renderer: mujoco.Renderer,
    compiled: CompiledModel,
    cameras: list[CameraSpec],
    zones: list[SceneZone],
    columns: int,
    colliders: bool = False,
) -> bytes:
    """Several cameras on the same initial state tiled into one PNG; it fails only when every picture is blank."""
    data = mujoco.MjData(compiled.model)
    mujoco.mj_forward(compiled.model, data)
    cells = [render_pixels(renderer, data, camera, zones, colliders, compiled.looks).copy() for camera in cameras]
    if all(is_blank(pixels) for pixels in cells):
        raise _blank(cells[0])
    height, width = cells[0].shape[:2]
    return encode_png(contact_sheet(cells, columns, (height, width), gap=SHEET_GAP))


def open_renderer(model: mujoco.MjModel, width: int, height: int) -> mujoco.Renderer:
    """An offscreen renderer on the calling thread, which then owns its OpenGL context."""
    if not rendering_available():
        raise RenderUnavailable("no OpenGL on this machine")
    model.vis.global_.offwidth = max(model.vis.global_.offwidth, width)
    model.vis.global_.offheight = max(model.vis.global_.offheight, height)
    try:
        return mujoco.Renderer(model, height, width)
    except Exception as error:  # MuJoCo raises plain errors when no GL backend loads.
        raise RenderUnavailable(str(error)) from error


def release_renderer(renderer: mujoco.Renderer) -> None:
    """Free a renderer inside its own GL context: freed in another one, it deletes that context's buffers."""
    context = getattr(renderer, "_gl_context", None)
    if context is not None:
        context.make_current()
    renderer.close()


class ViewRenderer:
    """Every render of the engine process on one thread: an OpenGL context belongs to the thread that made it."""

    def __init__(self) -> None:
        self._thread = ThreadPoolExecutor(max_workers=1, thread_name_prefix="views")
        # Renderers by model and size, the newest last; the model is kept so its id is never reused meanwhile.
        self._renderers: OrderedDict[tuple[int, int, int], tuple[mujoco.MjModel, mujoco.Renderer]] = OrderedDict()
        self._lock = threading.Lock()

    def _renderer(self, model: mujoco.MjModel, width: int, height: int) -> mujoco.Renderer:
        key = (id(model), width, height)
        if key in self._renderers:
            self._renderers.move_to_end(key)
            return self._renderers[key][1]
        renderer = open_renderer(model, width, height)
        self._renderers[key] = (model, renderer)
        while len(self._renderers) > RENDERERS_KEPT:
            _, (_, oldest) = self._renderers.popitem(last=False)
            release_renderer(oldest)
        return renderer

    def _render(self, compiled: CompiledModel, camera: CameraSpec, zones: list[SceneZone], colliders: bool) -> bytes:
        renderer = self._renderer(compiled.model, camera.width, camera.height)
        return render_view(renderer, compiled, camera, zones, colliders)

    def render(
        self,
        compiled: CompiledModel,
        camera: CameraSpec,
        zones: list[SceneZone],
        timeout: float | None = None,
        colliders: bool = False,
    ) -> bytes:
        with self._lock:
            future = self._thread.submit(self._render, compiled, camera, zones, colliders)
        return future.result(timeout)

    def render_sheet(
        self,
        compiled: CompiledModel,
        cameras: list[CameraSpec],
        zones: list[SceneZone],
        columns: int,
        timeout: float | None = None,
        colliders: bool = False,
    ) -> bytes:
        """Cameras of one size tiled into a contact sheet, rendered on the views thread."""

        def task() -> bytes:
            renderer = self._renderer(compiled.model, cameras[0].width, cameras[0].height)
            return render_sheet(renderer, compiled, cameras, zones, columns, colliders)

        with self._lock:
            future = self._thread.submit(task)
        return future.result(timeout)

    def run[T](self, task: Callable[[], T], timeout: float | None = None) -> T:
        """Any other offscreen render, on the same thread; the task opens and releases its own renderer."""
        with self._lock:
            future = self._thread.submit(task)
        return future.result(timeout)

    def close(self) -> None:
        def release() -> None:
            for _, renderer in self._renderers.values():
                release_renderer(renderer)
            self._renderers.clear()

        self._thread.submit(release).result()
        self._thread.shutdown()
