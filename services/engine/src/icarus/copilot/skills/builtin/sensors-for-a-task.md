---
name: sensors-for-a-task
title: Give a body the senses its task needs
when: The person asks what the body can see or feel, or wants to add, aim, tilt or name a sensor: distance rays, balance or touch.
tools: [library, inspect_object, try, look, propose]
version: 3
---
The brain sees only its observation: its sensors plus what the task adds. Navigation already adds forward and side
speed, turn rate, joint angles and the goal's distance and bearing; locomotion adds every joint's angle and speed.
Add a sensor only for what is missing, because every sensor added later prevents continuing from a trained brain.

1. **Rays for obstacles.** A `distance_ray` fans rays forward from its part and reports each distance divided by
   its range (0 touching, 1 nothing in range). `distance_ray.count` = 5–8 covers the front; `distance_ray.range` =
   5–10 m (the car template uses 10). More rays only help in cluttered worlds. The rays fan 30° to each side of
   `distance_ray.heading` (0 ahead, 90 left, -90 right, 180 behind). A part can carry several `distance_ray`
   components, each with its own id: for a side or the back, add another through an add_component operation with
   a new component id such as rear_ray, heading 180 and count 1. Name each with
   `distance_ray.name` (a text value up to 40 characters, such as Front or Rear): the brain inputs, Play's senses
   and the rays in the view carry that name, and a fan adds each ray's direction ("Front 30° left").
2. **Tilt for low obstacles.** Rays leave level with the part that carries them. When obstacles are lower than
   that height h, set `distance_ray.tilt` below zero (its range is -60 to 30 degrees): a ray tilted by angle a meets the ground
   at h / tan(a). For a car's rays at 0.5 m and a crate 3 m ahead, `distance_ray.tilt` = -10–-5 meets the crate
   before the ground (at -10° the ground is hit near 2.8 m). Too steep and every ray sees only ground.
3. **Balance for legs.** `balance` on the root reports acceleration (up to 30 m/s²) and turn rate (up to
   10 rad/s); `balance.includes` accel+gyro also tells which way is down. Legged bodies and balancers need it.
4. **Touch for contact.** `touch` on each foot reports the contact force, so the brain knows which foot carries
   the weight. `touch.radius` = 0.05–0.06 for feet the size of the walker's.
5. **Check what it sees.** `try`, then `look` with view `onboard` from the body: the try reports which obstacles a
   ray hits from the start and warns when none does or when there are obstacles and no ray. Read the sensors check
   ("Sensors read finite values"). Then `propose`, saying the change starts training from zero.

Done when every obstacle the body must react to is seen by a ray from the start, legged bodies have balance and
foot touch, and the proposal says whether a trained brain can still continue.
