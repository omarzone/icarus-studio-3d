from collections.abc import Mapping

import mujoco

from icarus.contracts.scene import SceneRay

# Rays travel with every frame and snapshot copy, so a body with more is cut short in the view, never in physics.
MAX_RAYS = 48


def _vector(values) -> tuple[float, float, float]:
    return (round(float(values[0]), 4), round(float(values[1]), 4), round(float(values[2]), 4))


def ray_readings(model: mujoco.MjModel, data: mujoco.MjData, labels: Mapping[str, str] | None = None) -> list[SceneRay]:
    """Each rangefinder as MuJoCo last computed it: its site, the site's z axis and the sensor reading."""
    rays: list[SceneRay] = []
    for index in range(model.nsensor):
        if int(model.sensor_type[index]) != int(mujoco.mjtSensor.mjSENS_RANGEFINDER):
            continue
        if int(model.sensor_objtype[index]) != int(mujoco.mjtObj.mjOBJ_SITE) or len(rays) >= MAX_RAYS:
            continue
        name = model.sensor(index).name
        site = int(model.sensor_objid[index])
        reading = float(data.sensordata[int(model.sensor_adr[index])])
        reach = float(model.sensor_cutoff[index])
        fallback = f"Distance {int(name.rsplit('ray', 1)[1]) + 1}" if name.rsplit("ray", 1)[-1].isdigit() else name
        rays.append(
            SceneRay(
                sensor=name,
                label=(labels or {}).get(name, fallback),
                origin=_vector(data.site_xpos[site]),
                direction=_vector(data.site_xmat[site].reshape(3, 3)[:, 2]),
                range=reach,
                # A rangefinder reads -1 when it hits nothing and its cutoff when the hit lies beyond it.
                distance=round(reading, 4) if reading >= 0 and (reach <= 0 or reading < reach) else None,
            )
        )
    return rays
