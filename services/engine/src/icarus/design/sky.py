import xml.etree.ElementTree as ET

from icarus.contracts.project import Project
from icarus.contracts.scene import SceneSky
from icarus.design.components import view
from icarus.design.sun_path import world_sun

# Top color, horizon color and how much of the ambient light each preset lets through.
PRESETS: dict[str, tuple[str, str, float]] = {
    "day": ("#5f8fc4", "#e4ecef", 1.0),
    "dusk": ("#1b2a3d", "#aebccb", 0.6),
    "night": ("#070b14", "#1c2638", 0.25),
    "overcast": ("#8c939b", "#c9cdd1", 0.8),
}
# MuJoCo's own headlight ambient, used when a world has no sky.
_HEADLIGHT_PER_AMBIENT = 0.2


def _rgb(color: str) -> list[float]:
    return [int(color[index : index + 2], 16) / 255 for index in (1, 3, 5)]


def _fmt(values: list[float]) -> str:
    return " ".join(f"{value:.4g}" for value in values)


def _hex(rgb: tuple[float, float, float]) -> str:
    return "#" + "".join(f"{round(max(0.0, min(1.0, channel)) * 255):02x}" for channel in rgb)


def _blend(a: str, b: str, t: float) -> str:
    low, high = _rgb(a), _rgb(b)
    return _hex((low[0] + (high[0] - low[0]) * t, low[1] + (high[1] - low[1]) * t, low[2] + (high[2] - low[2]) * t))


def clock_palette(daylight: float) -> tuple[str, str, float]:
    """Night through dusk to day as the sun rises: top, horizon and the share of ambient light."""
    low, high, t = ("night", "dusk", daylight * 2) if daylight < 0.5 else ("dusk", "day", daylight * 2 - 1)
    (top_a, horizon_a, light_a), (top_b, horizon_b, light_b) = PRESETS[low], PRESETS[high]
    return _blend(top_a, top_b, t), _blend(horizon_a, horizon_b, t), light_a + (light_b - light_a) * t


def world_sky(project: Project) -> SceneSky | None:
    """The look of the world's sky object, or None when the world has none."""
    sky = next((found for obj in project.world.objects if (found := view(obj, "sky"))), None)
    if sky is None:
        return None
    preset = sky.text("preset")
    top, horizon, light = PRESETS.get(preset, (sky.text("top"), sky.text("horizon"), 1.0))
    sun = world_sun(project)
    if sun is not None and preset != "custom":
        top, horizon, light = clock_palette(sun.daylight)
    return SceneSky(
        top=top,
        horizon=horizon,
        ambient=round(sky.number("ambient") * light, 3),
        ambient_color=sky.text("ambient_color"),
        fog=sky.number("fog"),
        sun_size=sky.number("sun_size"),
        glare=sky.number("glare"),
        haze=sky.number("haze"),
        stars=sky.number("stars"),
        clouds=sky.number("clouds"),
        cloud_density=sky.number("cloud_density"),
        cloud_color=sky.text("cloud_color"),
        shadows=sky.switch("shadows"),
        shadow_softness=sky.number("shadow_softness"),
        exposure=sky.number("exposure"),
        brightness=sky.number("brightness"),
        contrast=sky.number("contrast"),
        saturation=sky.number("saturation"),
        tint=sky.text("tint"),
    )


def add_sky(root: ET.Element, sky: SceneSky) -> None:
    """Skybox, headlight and fog for offscreen renders; nothing here reaches the physics."""
    visual = ET.SubElement(root, "visual")
    ambient = [min(sky.ambient * _HEADLIGHT_PER_AMBIENT * channel, 1.0) for channel in _rgb(sky.ambient_color)]
    ET.SubElement(visual, "headlight", {"ambient": _fmt(ambient)})
    if sky.fog > 0:
        end = 10 - 8 * sky.fog
        ET.SubElement(visual, "map", {"fogstart": _fmt([end * 0.3]), "fogend": _fmt([end])})
        ET.SubElement(visual, "rgba", {"fog": _fmt([*_rgb(sky.horizon), 1]), "haze": _fmt([*_rgb(sky.horizon), 1])})
    asset = ET.SubElement(root, "asset")
    gradient = {"rgb1": _fmt(_rgb(sky.top)), "rgb2": _fmt(_rgb(sky.horizon)), "width": "64", "height": "64"}
    ET.SubElement(asset, "texture", {"type": "skybox", "builtin": "gradient", **gradient})
