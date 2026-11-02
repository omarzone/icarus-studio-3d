import pytest

from icarus.design.sky import PRESETS, clock_palette
from icarus.design.sun_path import sun_path


def test_the_sun_is_highest_at_noon_and_below_the_horizon_at_midnight():
    noon, afternoon, midnight = sun_path(12, 42), sun_path(15, 42), sun_path(0, 42)
    assert noon.elevation > afternoon.elevation > 0 > midnight.elevation
    assert noon.daylight == afternoon.daylight == 1
    assert midnight.daylight == 0


def test_light_always_shines_down_and_comes_from_the_west_in_the_afternoon():
    for hour in (0, 6, 9, 12, 15, 18, 21):
        assert sun_path(hour, 42).direction[2] < 0, hour
    # From the west, so it travels east (+X).
    assert sun_path(16, 42).direction[0] > 0
    assert sun_path(8, 42).direction[0] < 0


def test_the_equator_gets_a_higher_noon_sun_than_the_far_north():
    assert sun_path(12, 0).elevation > sun_path(12, 60).elevation


def test_night_dims_and_cools_the_light_and_sunset_warms_it():
    noon, sunset, night = sun_path(12, 42), sun_path(19, 42), sun_path(0, 42)
    assert max(night.tint) < 0.2
    assert night.tint[2] > night.tint[0]
    assert sunset.tint[0] > sunset.tint[2]
    assert noon.tint == pytest.approx((1, 1, 1), abs=1e-6)


def test_the_clock_palette_runs_from_the_night_preset_to_the_day_preset():
    assert clock_palette(0) == PRESETS["night"]
    assert clock_palette(0.5) == PRESETS["dusk"]
    assert clock_palette(1) == PRESETS["day"]
