from icarus.sim.model_state import build_world


def test_the_parking_car_has_five_rays_of_ten_metres_and_four_actuators(parking):
    world = build_world(parking)
    rays = [sensor for sensor in world.sensors if sensor.kind == "ray"]
    assert len(rays) == 5
    assert all((ray.low, ray.high, ray.unit) == (0, 10, "m") for ray in rays)
    assert len(world.actuators) == 4
    assert world.model.body(world.agent).name == "car"
    assert world.goal is not None and world.goal.radius == 1.5


def test_the_walker_has_balance_and_touch_sensors_and_six_actuators(walker):
    world = build_world(walker)
    kinds = sorted(sensor.kind for sensor in world.sensors)
    assert kinds == ["accel", "gyro", "touch", "touch"]
    assert len(world.actuators) == 6
    assert world.goal is None
    assert world.geom_objects["foot_left"] == "foot_left"
    assert world.object_names["foot_left"] == "Left foot"
