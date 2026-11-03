---
name: drive-a-vehicle
title: Set up any wheeled vehicle so its brain drives it with throttle, brake and steering
when: A body rolls on wheels or tracks, such as a car, truck, van, kart, three-wheeler, motorcycle, bicycle, rover, tank or skid-steer robot, and must drive somewhere. Not for legged bodies.
tools: [library, inspect_object, try, look, propose, train, read_run]
version: 1
---
A `vehicle` component on the body's root part turns the body into a vehicle: the brain gets three actions,
throttle (-1 to 1, or 0 to 1 when `vehicle.reverse` is off), brake (0 to 1) and steering (-1 full right to 1
full left), instead of one action per motor. The engine turns them into the wheels' torques, a
braking resistance on every wheel and the steering joints' angles, all as real MuJoCo actuators. Bodies without
the component keep their raw motors and work as before.

1. **Lay out the wheels.** A wheel is a part with a `joint` hinge, limits -180 to 180, whose axis points sideways
   (the `parking_car` template turns its cylinders so the axis points left). A steering joint is a hinge with
   limits whose axis stands upright, such as a small sphere knuckle between the body and a front wheel, and the
   wheel hangs from it. Put the wheels wide enough that a wheel at full lock clears the body. Wheels and knuckles
   need no `motor`: motors on the joints the vehicle drives are replaced by its own.
2. **Choose the layout.** `vehicle.steering` ackermann for cars, trucks, three-wheelers and two-wheelers: the
   inner front wheel turns more than the outer so both roll around the same turn center on the rear axle line.
   Differential for tanks, tracked and skid-steer robots: it drives the left and right wheels at different
   speeds, so no knuckles are needed. `vehicle.drive` picks rear, front or all wheels for the throttle.
3. **Set the limits.** `vehicle.max_torque` = 300–600 for a car of about 1 t with 0.3 m wheels; less for light
   robots. `vehicle.max_steer` = 30–35 (it never exceeds the knuckles' limits). `vehicle.max_speed` = 2–4 for
   parking and tight spaces, higher for roads: the throttle stops pushing past it, which keeps early training
   safe. `vehicle.brake` = 50–150 for a car; too strong locks the wheels.
4. **Give it senses.** `speed` reads forward and side speed and turn rate; `target` reads the goal zone's distance
   and bearing and which way the spot faces; a `distance_ray` with `distance_ray.spread` = 360 and
   `distance_ray.count` = 12–16 sees all around, behind included, which reversing needs. Navigation already
   observes the goal's distance and bearing, so `target` matters most for an aligned spot.
5. **Lights.** Small look-only parts with a `vehicle_light` (role brake, reverse or head) glow when the engine
   says so: brake while braking or slowing hard, reverse while backing, head while driving. They change nothing
   the brain learns.
6. **Rewards and training.** `progress_to_goal` = 1, `reach_goal` = 10, `collision_penalty` = -5 when there is
   something to hit, `time_penalty` = -0.01. For a spot to park in, follow park-a-vehicle. Start with a fixed,
   open course, then add obstacles and wider starts one stage at a time (curriculum-and-warm-start).
7. **Check.** `try`, then `look` with view `top`: the wheels must touch the ground, the knuckles turn and nothing
   overlaps the body. Fix and try again before you `propose`; `train` only when the person asks, and
   `read_run` before saying anything about learning.

What not to do: never give each wheel its own motor for the brain to coordinate (the front wheels can disagree
and the brain wastes its training learning to steer); never brake by heavy joint damping on the driven wheels
(it caps speed but cannot be released); never randomize the body's own parts.

Two wheels and tracks: a two-wheeler (the `motorcycle` template) is an ackermann vehicle with one steering fork.
It stands only while perfectly balanced; any push or turn tips it, and staying up is learned, as a rider learns
it, by steering into the lean at speed. Give it `balance`, keep `stay_upright` and `fall_penalty`, expect a long
training and promise nothing. A tracked or skid-steer robot is a differential vehicle with all wheels driven:
several wheels per side stand in for a track.

Done when a passing try is proposed with a vehicle component whose steering and drive suit the body, speed and
target senses, rewards inside their ranges, and the person knows training comes next.
