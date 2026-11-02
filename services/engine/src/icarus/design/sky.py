import xml.etree.ElementTree as ET

from icarus.contracts.project import Project
from icarus.contracts.scene import SceneSky
from icarus.design.components import view

# Top color, horizon color and how much of the ambient light each preset lets through.
PRESETS: dict[str, tuple[str, str, float]] = {
    "day": ("#5f8fc4", "#e4ecef", 1.0),
    "dusk": ("#1b2a3d", "#aebccb", 0.6),
    "night": ("#070b14", "#1c2638", 0.25),
    "overcast": ("#8c939b", "#c9cdd1", 0.8),
}
# MuJoCo's own headlight ambient, used when a world has no sky.
_HEADLIGHT_PER_AMBIENT = 0.2


def world_sky(project: Project) -> SceneSky | None:
    """The look of the world's sky object, or None when the world has none."""
    sky = next((found for obj in project.world.objects if (found := view(obj, "sky"))), None)
    if sky is None:
        return None
    preset = sky.text("preset")
    top, horizon, light = PRESETS.get(preset, (sky.text("top"), sky.text("horizon"), 1.0))
    return SceneSky(top=top, horizon=horizon, ambient=round(sky.number("ambient") * light, 3), fog=sky.number("fog"))


def _rgb(color: str) -> list[float]:
    return [int(color[index : index + 2], 16) / 255 for index in (1, 3, 5)]


def _fmt(values: list[float]) -> str:
    return " ".join(f"{value:.4g}" for value in values)


def add_sky(root: ET.Element, sky: SceneSky) -> None:
    """Skybox, headlight and fog for offscreen renders; nothing here reaches the physics."""
    visual = ET.SubElement(root, "visual")
    ET.SubElement(visual, "headlight", {"ambient": _fmt([min(sky.ambient * _HEADLIGHT_PER_AMBIENT, 1.0)] * 3)})
    if sky.fog > 0:
        end = 10 - 8 * sky.fog
        ET.SubElement(visual, "map", {"fogstart": _fmt([end * 0.3]), "fogend": _fmt([end])})
        ET.SubElement(visual, "rgba", {"fog": _fmt([*_rgb(sky.horizon), 1]), "haze": _fmt([*_rgb(sky.horizon), 1])})
    asset = ET.SubElement(root, "asset")
    gradient = {"rgb1": _fmt(_rgb(sky.top)), "rgb2": _fmt(_rgb(sky.horizon)), "width": "64", "height": "64"}
    ET.SubElement(asset, "texture", {"type": "skybox", "builtin": "gradient", **gradient})
