---
name: park-a-vehicle
title: Teach a vehicle to park wholly inside a spot, lined up, nose in or backing in
when: A car, truck or other wheeled vehicle must park in a bay or spot, line up with it, back into it or stop precisely inside a marked rectangle.
tools: [library, layout, inspect_object, try, look, propose, train, read_run]
version: 2
---
Parking is the navigation task with a stricter goal. A rectangular `goal_zone` counts a try as won only when every
rule holds at once: the body is inside (wholly, with `goal_zone.fully_inside`), it faces the spot's heading within
`goal_zone.align_within` degrees the way `goal_zone.entry` asks, and it moves slower than `goal_zone.stop_speed`.
The viewport draws the spot red and turns it green the moment the engine measures all of them. Set the body up
as a vehicle first (drive-a-vehicle); the `parking_car` template is a ready example of everything below.

1. **Shape the spot.** `goal_zone.shape` rectangle, `goal_zone.length` along the spot's heading (the object's
   rotation around Z, the way a car faces once parked nose in) and `goal_zone.width` across it. With
   `goal_zone.fully_inside` on, the spot must be bigger than the body's footprint with its wheels: about 0.5 m
   wider and 1 m longer leaves room to learn; the design tests refuse a spot the body cannot fit. Start with
   `goal_zone.align_within` = 20–30 and tighten to 10–15 in a later stage.
2. **Choose the entry.** `goal_zone.entry` either accepts nose in or backed in; nose_in or back_in demands one.
   A brain only parks the way its starts allow: when every start faces the bay it learns nose in only.
3. **Build the place.** The `layout` tool with the `parking_lot` recipe lays out bays, parked cars, curbs and
   lamps and turns the goal into a rectangle the size of its bay, facing into it. Its bays are 2.7 m wide by
   default: for a car about 2.6 m wide with its wheels, set the recipe's bay width to about 3.2 or leave
   fully inside off. Painted lines are look-only; parked cars are obstacles the rays see.
4. **Senses all around.** A `distance_ray` with `distance_ray.spread` = 360 and `distance_ray.count` = 16 sees the
   cars beside and behind; `speed` tells it how fast it rolls; `target` gives the spot's distance, bearing and
   which way it faces.
5. **Rewards.** `reach_goal` = 10, `progress_to_goal` = 1, `spot_alignment` = 1–3 (pays the gain in lining up near
   the spot, never for waiting), `gentle_arrival` = 1–3 (pays the speed shed inside), `collision_penalty` = -5 and
   `time_penalty` = -0.01. Keep the per-step terms small next to the bonus (reward-design).
6. **Vary the starts.** With `spawn_point.mode` auto every start is shifted up to ±1.5 m and turned up to ±35°
   from where the car stands. For a brain that parks from anywhere in the aisle, set `spawn_point.mode` area,
   `spawn_point.area` to the free aisle around the spawn (for example 8 by 3, along the spawn's heading) and
   `spawn_point.heading_range` = 30–60; keep the area clear of parked cars and curbs, and the spawn on the ground.
   To start from several entries, add more `spawn_point` objects and set the first one's mode to random_point
   or cycle_points; each spot keeps its own area and heading range. Training copies vary by their seed and
   evaluations repeat the same starts, so checkpoints stay comparable.
7. **Teach reversing.** Train nose in first. Then, in a new stage, turn `spawn_point.heading_range` up to 180 (or
   `spawn_point.random_heading` on, with a mode other than auto) so some starts face away from the bay, set
   `goal_zone.entry` to back_in when the person wants backing in, and continue from the nose-in brain with a warm
   start: the body, senses and actions stay the same, so the brain carries over (curriculum-and-warm-start). Rays
   behind and reverse on in the vehicle are what make backing possible.
8. **Check and train.** `try`, then `look` with view `top`: the spot sits in free space, flanked but not touched
   by obstacles, reachable with the body's turning circle. `propose` when it passes; `train` only when the
   person asks, about 1M steps per stage, and `read_run` with `evaluations` and `failures` before saying how
   well it parks. Promise no success rate before its own run.

Done when a passing try is proposed with a rectangular spot that fits the body, its entry and alignment rules,
senses all around, the parking rewards inside their ranges, and a plan of stages (nose in, then wider starts or
backing in with a warm start).
