import pytest

from icarus.contracts.play import (
    AddObjectCommand,
    LightCommand,
    MoveCommand,
    PauseCommand,
    PlayErrorMessage,
    PlayEventMessage,
    PlayReady,
    PushCommand,
    ResetCommand,
    ShuffleCommand,
    SpeedCommand,
    TouchCommand,
    WindCommand,
)
from icarus.sim.play import PlaySession
from icarus.sim.policy import UNTRAINED_BRAIN, RandomPolicy


def session_of(project) -> PlaySession:
    return PlaySession(project, 1, RandomPolicy(6, seed=0), seed=0)


def texts(messages) -> list[str]:
    return [message.event.text for message in messages if isinstance(message, PlayEventMessage)]


def test_the_frame_lists_every_geom_pose_and_the_live_readings(parking):
    session = session_of(parking)
    frame = session.frame()
    info = session.info()
    assert [geom.name for geom in frame.geoms] == [geom.name for geom in info.scene.geoms]
    assert [reading.unit for reading in frame.senses] == ["m"] * 5
    assert [reading.label for reading in frame.senses][0] == "Car distance 1"
    assert len(frame.actions) == 4
    assert info.brain == UNTRAINED_BRAIN
    assert [tool.id for tool in info.tools] == ["move", "push", "add-object", "light", "wind", "slow", "reset"]


def test_the_walker_offers_touch(walker):
    assert "touch" in [tool.id for tool in session_of(walker).info().tools]


def test_a_push_gives_any_body_the_asked_speed_and_reports_the_real_impulse(parking):
    session = session_of(parking)
    messages = session.apply(PushCommand(tool="push", object="car", direction=(1.0, 0.0, 0.0), speed=1.5))
    mass = session.world.model.body_subtreemass[session.world.model.body("car").id]
    assert texts(messages) == [f"You pushed Car with {round(mass * 1.5)} N·s"]
    assert session.world.data.qvel[0] == pytest.approx(1.5, rel=0.3)


def test_reset_restores_time_zero_and_clears_the_return(parking):
    session = session_of(parking)
    session.step_realtime(0.5)
    assert session.frame().time == pytest.approx(0.5)
    assert texts(session.apply(ResetCommand(tool="reset"))) == ["Episode reset"]
    frame = session.frame()
    assert (frame.time, frame.step, frame.episode_return) == (0, 0, 0)


def test_speed_a_quarter_advances_a_quarter_of_the_time(parking):
    session = session_of(parking)
    session.apply(SpeedCommand(tool="speed", speed=0.25))
    session.step_realtime(1.0)
    assert session.frame().time == pytest.approx(0.25)
    assert session.frame().speed == 0.25


def test_pause_stops_stepping(parking):
    session = session_of(parking)
    session.apply(PauseCommand(tool="pause", paused=True))
    session.step_realtime(1.0)
    assert session.frame().time == 0
    assert session.frame().status.title == "Paused"


def test_an_unknown_object_gives_an_error_not_an_exception(parking):
    session = session_of(parking)
    for command in (
        PushCommand(tool="push", object="nope", direction=(1.0, 0.0, 0.0), speed=1.0),
        MoveCommand(tool="move", object="nope", position=(0.0, 0.0, 1.0)),
        TouchCommand(tool="touch", object="nope"),
        AddObjectCommand(tool="add_object", piece="dragon", position=(0.0, 0.0, 0.0)),
    ):
        [message] = session.apply(command)
        assert isinstance(message, PlayErrorMessage)


def test_move_rejects_a_jointed_part_and_moves_a_free_body(parking):
    session = session_of(parking)
    [rejected] = session.apply(MoveCommand(tool="move", object="wheel_rear_left", position=(0.0, 0.0, 1.0)))
    assert isinstance(rejected, PlayErrorMessage)
    session.apply(MoveCommand(tool="move", object="car", position=(2.0, 1.0, 0.6)))
    assert tuple(session.world.data.xpos[session.world.agent]) == pytest.approx((2.0, 1.0, 0.6))


def test_add_object_keeps_the_running_state_and_resends_the_scene(parking):
    session = session_of(parking)
    session.step_realtime(0.3)
    car_before = session.world.data.joint("car:free").qpos.copy()
    messages = session.apply(AddObjectCommand(tool="add_object", piece="box", position=(3.0, 0.0, 0.0)))
    ready = [message for message in messages if isinstance(message, PlayReady)]
    assert texts(messages) == ["You added Box"]
    assert "box" in [geom.name for geom in ready[0].session.scene.geoms]
    assert "shuffle" in [tool.id for tool in ready[0].session.tools]
    assert session.frame().time == pytest.approx(0.3)
    assert tuple(session.world.data.joint("car:free").qpos) == tuple(car_before)
    box = session.world.data.xpos[session.world.model.body("box").id]
    assert tuple(box) == pytest.approx((3.0, 0.0, 0.25))
    second = session.apply(AddObjectCommand(tool="add_object", piece="box", position=(5.0, 0.0, 0.0)))
    assert texts(second) == ["You added Box 2"]


def test_an_added_wall_in_front_of_the_car_shortens_a_ray(parking):
    session = session_of(parking)
    before = session.frame().senses[2].value
    # A wall taller than the ray's height; a 0.5 m box only grazes a ray cast at 0.5 m and hits or misses by rounding.
    session.apply(AddObjectCommand(tool="add_object", piece="wall", position=(4.0, 0.0, 0.0)))
    assert session.frame().senses[2].value < before


def test_the_car_touching_a_wall_is_an_agent_event(parking):
    session = session_of(parking)
    session.apply(AddObjectCommand(tool="add_object", piece="wall", position=(2.4, 0.0, 0.0)))
    session.apply(PushCommand(tool="push", object="car", direction=(1.0, 0.0, 0.0), speed=3.0))
    events = session.step_realtime(0.4)
    assert "Car touched Wall" in [event.text for event in events]


def test_play_events_speak_the_persons_language(parking):
    session = PlaySession(parking, 1, RandomPolicy(6, seed=0), seed=0, language="es")
    assert texts(session.apply(AddObjectCommand(tool="add_object", piece="wall", position=(2.4, 0.0, 0.0)))) == [
        "Agregaste Wall"
    ]
    assert texts(session.apply(PushCommand(tool="push", object="car", direction=(1.0, 0.0, 0.0), speed=3.0)))[
        0
    ].startswith("Empujaste Car con")
    assert "Car tocó Wall" in [event.text for event in session.step_realtime(0.4)]
    assert texts(session.apply(ResetCommand(tool="reset"))) == ["Episodio reiniciado"]


def test_shuffle_moves_props_and_needs_one(parking):
    session = session_of(parking)
    assert isinstance(session.apply(ShuffleCommand(tool="shuffle"))[0], PlayErrorMessage)
    session.apply(AddObjectCommand(tool="add_object", piece="box", position=(5.0, 0.0, 0.0)))
    before = session.world.data.xpos[session.world.model.body("box").id].copy()
    assert texts(session.apply(ShuffleCommand(tool="shuffle"))) == ["You shuffled 1 prop"]
    after = session.world.data.xpos[session.world.model.body("box").id]
    assert 0 < abs(after[0] - before[0]) <= 1 and abs(after[1] - before[1]) <= 1


def test_touch_pokes_only_a_touch_sensor_body(walker):
    session = session_of(walker)
    assert texts(session.apply(TouchCommand(tool="touch", object="foot_left"))) == ["You poked Left foot"]
    assert isinstance(session.apply(TouchCommand(tool="touch", object="torso"))[0], PlayErrorMessage)


def test_light_and_wind_change_the_model(parking):
    session = session_of(parking)
    session.apply(LightCommand(tool="light", intensity=0.5))
    assert session.info().scene.lights[0].intensity == pytest.approx(0.5)
    assert texts(session.apply(WindCommand(tool="wind", velocity=(3.0, 4.0, 0.0)))) == ["You set the wind to 5 m/s"]
    assert tuple(session.world.model.opt.wind) == (3.0, 4.0, 0.0)


def test_play_never_changes_the_project(parking):
    before = parking.model_dump()
    session = session_of(parking)
    session.apply(AddObjectCommand(tool="add_object", piece="box", position=(3.0, 0.0, 0.0)))
    session.step_realtime(0.2)
    assert parking.model_dump() == before


def test_commands_out_of_physical_bounds_are_refused_by_the_contract():
    from pydantic import ValidationError

    from icarus.contracts.play import MoveCommand, WindCommand

    for build in (
        lambda: PushCommand(tool="push", object="car", direction=(1.0, 0.0, 0.0), speed=1e300),
        lambda: WindCommand(tool="wind", velocity=(1e300, 0.0, 0.0)),
        lambda: MoveCommand(tool="move", object="box", position=(0.0, 0.0, 1e9)),
    ):
        with pytest.raises(ValidationError):
            build()


def test_the_frame_draws_each_distance_sensor_with_the_reading_it_shows(parking):
    session = session_of(parking)
    session.step_realtime(0.3)
    frame = session.frame()
    senses = {reading.id: reading for reading in frame.senses}
    assert [ray.sensor for ray in frame.rays] == [f"car:ray{index}" for index in range(5)]
    for ray in frame.rays:
        reading = senses[ray.sensor]
        assert ray.label == reading.label
        assert (ray.distance if ray.distance is not None else ray.range) == pytest.approx(reading.value, abs=1e-3)
