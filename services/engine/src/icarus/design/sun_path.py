import math
from dataclasses import dataclass

from icarus.contracts.project import Project
from icarus.design.components import view

# Midsummer, so the default latitude still gets a high afternoon sun.
_DECLINATION = math.radians(23.44)
# Below this elevation the sky is fully night, above the second it is fully day.
_NIGHT_BELOW = -6.0
_DAY_ABOVE = 15.0
# Moonlight strength once the sun is down, as a share of the light's own.
_MOONLIGHT = 0.15
_SUNSET_COLOR = (1.0, 0.7, 0.42)
_MOON_COLOR = (0.68, 0.75, 1.0)


@dataclass(frozen=True)
class SunPath:
    """Where sun lights shine from at the world's clock time; visual only, MuJoCo never lights its physics."""

    # Unit vector the light travels along, world frame (Z up, X east, Y north); from the moon once the sun has set.
    direction: tuple[float, float, float]
    elevation: float
    # 0 at night, 1 in full day.
    daylight: float
    # Multiplies each sun light's diffuse color.
    tint: tuple[float, float, float]


def _mix(a: tuple[float, ...], b: tuple[float, ...], t: float) -> tuple[float, float, float]:
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


def sun_path(clock: float, latitude: float) -> SunPath:
    hour = math.radians(15 * (clock - 12))
    phi = math.radians(latitude)
    east = -math.cos(_DECLINATION) * math.sin(hour)
    north = math.sin(_DECLINATION) * math.cos(phi) - math.cos(_DECLINATION) * math.sin(phi) * math.cos(hour)
    up = math.sin(_DECLINATION) * math.sin(phi) + math.cos(_DECLINATION) * math.cos(phi) * math.cos(hour)
    elevation = math.degrees(math.asin(max(-1.0, min(1.0, up))))
    daylight = max(0.0, min(1.0, (elevation - _NIGHT_BELOW) / (_DAY_ABOVE - _NIGHT_BELOW)))
    toward = (-east, -north, -up) if up >= 0 else (east, north, up)
    if daylight > 0:
        warmth = max(0.0, min(1.0, 1 - elevation / 25))
        color = _mix((1.0, 1.0, 1.0), _SUNSET_COLOR, warmth)
        tint = _mix(_MOON_COLOR, color, daylight)
        strength = _MOONLIGHT + (1 - _MOONLIGHT) * daylight
    else:
        tint, strength = _MOON_COLOR, _MOONLIGHT
    return SunPath(
        direction=toward,
        elevation=elevation,
        daylight=daylight,
        tint=(tint[0] * strength, tint[1] * strength, tint[2] * strength),
    )


def world_sun(project: Project) -> SunPath | None:
    """The sun at the sky's clock time, or None when the world has no sky or its sun is not on the clock."""
    sky = next((found for obj in project.world.objects if (found := view(obj, "sky"))), None)
    if sky is None or not sky.switch("use_clock"):
        return None
    return sun_path(sky.number("clock_time"), sky.number("latitude"))
