import math

import numpy as np
import pytest
from pydantic import ValidationError

from icarus.contracts.play import AddObjectCommand, LightCommand, PlayErrorMessage, PlayReady, ResetCommand
from tests.sim.test_play import session_of, texts


def add(session, piece: str, position=(4.0, 0.0, 0.0), **choices):
    return session.apply(AddObjectCommand(tool="add_object", piece=piece, position=position, **choices))


def height_of(session, name: str) -> float:
    return float(session.world.data.xpos[session.world.model.body(name).id][2])


def test_a_dropped_piece_falls_from_its_height_and_comes_to_rest_on_the_ground(parking):
    session = session_of(parking)
    assert texts(add(session, "ball", placement="drop", height=2.0)) == ["You dropped Ball"]
    assert height_of(session, "ball") == pytest.approx(2.15)
    session.step_realtime(2.0)
    assert height_of(session, "ball") == pytest.approx(0.15, abs=0.02)


def test_size_mass_density_grip_bounce_and_color_reach_the_simulated_piece(parking):
    session = session_of(parking)
    add(session, "box", scale=2.0, mass=40.0, friction=0.2, bounciness=0.5, color="#112233")
    model = session.world.model
    geom = model.geom("box")
    assert tuple(geom.size) == pytest.approx((0.5, 0.5, 0.5))
    assert float(model.body("box").mass[0]) == pytest.approx(40.0)
    assert float(geom.friction[0]) == pytest.approx(0.2)
    assert float(geom.solref[1]) == pytest.approx(1 - 0.9 * 0.5)
    assert tuple(geom.rgba[:3]) == pytest.approx((0x11 / 255, 0x22 / 255, 0x33 / 255), abs=1e-5)
    add(session, "ball", position=(6.0, 0.0, 0.0), density=1000.0)
    ball = session.world.model.body("ball").mass[0]
    assert float(ball) == pytest.approx(1000 * 4 / 3 * math.pi * 0.15**3, rel=1e-4)


def test_a_bouncy_ball_bounces_higher_than_a_dead_one(parking):
    peaks = []
    for bounciness in (0.0, 1.0):
        session = session_of(parking)
        add(session, "ball", placement="drop", height=1.0, bounciness=bounciness)
        landed, peak = False, 0.0
        for _ in range(150):
            session.step_realtime(0.01)
            z = height_of(session, "ball")
            # Touching the ground: the ball is 0.3 m across.
            landed = landed or z < 0.155
            peak = max(peak, z) if landed else peak
        peaks.append(peak)
    rebounds = [peak - 0.15 for peak in peaks]
    assert rebounds[1] > 0.03 and rebounds[1] > 3 * rebounds[0]


def test_a_throw_leaves_at_the_chosen_speed_toward_the_agent_and_hits_it(parking):
    session = session_of(parking)
    car = session.world.data.xpos[session.world.agent].copy()
    messages = add(session, "ball", position=(4.0, 0.0, 0.0), placement="throw", height=1.0, speed=8.0)
    assert texts(messages) == ["You threw Ball at 8 m/s"]
    velocity = session.world.data.joint("ball:free").qvel[:3]
    assert float(np.linalg.norm(velocity)) == pytest.approx(8.0)
    toward = (car - session.world.data.xpos[session.world.model.body("ball").id])[:2]
    alignment = float(np.dot(velocity[:2], toward)) / float(np.linalg.norm(velocity[:2]) * np.linalg.norm(toward))
    assert alignment > 0.999
    events = [event.text for _ in range(40) for event in session.step_realtime(0.05)]
    assert "Car touched Ball" in events


def test_what_cannot_happen_is_refused_without_adding_anything(parking):
    session = session_of(parking)
    geoms = session.world.model.ngeom
    for command in (
        AddObjectCommand(tool="add_object", piece="wall", position=(4.0, 0.0, 0.0), placement="drop"),
        AddObjectCommand(tool="add_object", piece="wall", position=(4.0, 0.0, 0.0), mass=3.0),
        AddObjectCommand(tool="add_object", piece="ball", position=(40.0, 0.0, 0.0), placement="throw", speed=2.0),
        AddObjectCommand(tool="add_object", piece="barrel", position=(4.0, 0.0, 0.0), density=20_000, scale=5),
    ):
        [message] = session.apply(command)
        assert isinstance(message, PlayErrorMessage)
    assert session.world.model.ngeom == geoms
    with pytest.raises(ValidationError):
        AddObjectCommand(tool="add_object", piece="ball", position=(4.0, 0.0, 0.0), mass=1.0, density=100.0)


def test_a_rain_drops_each_copy_when_its_time_comes(parking):
    session = session_of(parking)
    assert texts(add(session, "ball", placement="drop", count=3, interval=0.1, spread=1.0)) == [
        "You started dropping 3 × Ball"
    ]
    assert session.due() == []
    session.step_realtime(0.15)
    assert isinstance(session.due()[0], PlayReady)
    session.step_realtime(0.1)
    session.due()
    balls = [session.world.model.body(name).id for name in ("ball", "ball_2", "ball_3")]
    spots = [session.world.data.xpos[body][:2] for body in balls]
    assert all(float(np.hypot(*(spot - spots[0]))) <= 1.0 for spot in spots)


def test_reset_takes_away_every_added_object_and_the_rest_of_a_rain(parking):
    session = session_of(parking)
    designed = session.world.model.ngeom
    session.apply(LightCommand(tool="light", intensity=0.5))
    add(session, "box")
    add(session, "ball", placement="drop", count=5, interval=1.0)
    messages = session.apply(ResetCommand(tool="reset"))
    assert isinstance(messages[0], PlayReady) and texts(messages) == ["Episode reset"]
    assert "box" not in [geom.name for geom in messages[0].session.scene.geoms]
    assert session.world.model.ngeom == designed
    session.step_realtime(2.5)
    assert session.due() == [] and session.world.model.ngeom == designed
    assert session.info().scene.lights[0].intensity == pytest.approx(0.5)
    assert texts(add(session, "box")) == ["You added Box"]
