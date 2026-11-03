---
name: reach-a-target
title: Teach any body to reach a target and stop there
when: A body on wheels or legs must get to a place and stop in it, such as a goal, a spot, a target zone, parking or docking. Not for moving another object there.
tools: [library, inspect_object, try, look, propose, train, read_run]
version: 4
---
Reaching a target is the navigation task: the body is paid for getting closer to a `goal_zone` and succeeds when it
comes to rest inside it (inside the radius and slower than 0.2 m/s). Distance to the goal is measured on the
ground, not in height. An episode lasts 30 s at 20 control steps per second, so 600 steps. Parking a car is one
example; a rover docking at a station or a legged robot walking to a mark are the same task.

1. **Pick the body.** For wheels or tracks, make the body a `vehicle` with throttle, brake and steering
   (drive-a-vehicle); the `parking_car` template is a ready example, and a spot to park in lined up or backing in
   follows park-a-vehicle. A body on raw wheel motors needs drag on its driven wheels (`joint.damping` = 80) to
   stop, since stopping is what success pays for. A two-wheeled rover steers by driving its wheels at different
   speeds and rests on a caster: a sphere with a `joint` ball, limits -180 to 180 and no motor. For legs, start
   from `walker_robot` or `humanoid`, switch the task to navigation, keep `stay_upright`, `fall_penalty` and
   `energy_cost`, and drop `forward_progress`, all in the same try. A legged body that falls ends the episode.
2. **Place the goal.** A `goal_zone` on open ground at least 4 m from the `spawn_point`. Its radius sets how
   precise the stop must be: `goal_zone.radius` = 1–2 suits a body about 1 to 2 m wide; a radius below the body's
   width only succeeds when perfectly centred and learns slower. To frame a spot or a bay, use static `wall` or
   `box` pieces and leave at least 0.5 m on each side of the body. The goal always sits in free space: never on
   or inside a parked car, a wall or any object with a collider.
3. **Rewards.** `reach_goal` = 10, `progress_to_goal` = 1, `time_penalty` = -0.01, and `collision_penalty` = -5
   only when there is something to hit. `progress_to_goal` pays per metre gained, so a 12 m approach is worth
   about 12 and matches the bonus. Add `heading_alignment` only when the person needs an arrival direction, and
   then keep `heading_alignment` = 0.01–0.05: it is paid every step, and at 0.2 a body that sits still facing the
   goal earns 120 per episode, twelve times the bonus (see reward-design).
4. **Senses.** Navigation already observes forward and side speed, turn rate, joint angles and the goal's
   distance and bearing, so finding the goal needs no sensor. Add a `distance_ray` only when obstacles stand in
   the way (avoid-obstacles), and `balance` plus foot `touch` for legs (sensors-for-a-task).
5. **Vary the start.** With `spawn_point.mode` auto every navigation episode starts the body a little off where
   it stands: up to ±1.5 m to the side, up to 2 m back and turned up to ±35°. Once starts near the spawn are mastered, to
   reach the target from anywhere set `spawn_point.mode` anywhere in a new stage: each try starts at a free place
   anywhere on the floor, clear of obstacles, at least `spawn_point.goal_distance` beyond the goal with a way to it,
   facing any direction. For one region only, set mode area with `spawn_point.area` (width and depth around the
   spawn, along its heading; 0 × 0 means the whole free map) and `spawn_point.heading_range` (180, or
   `spawn_point.random_heading`, faces any way); or place several
   `spawn_point` objects and set the first one's mode to random_point or cycle_points; or add `randomize` to the
   goal with `randomize.position_range` of a few metres on X and Y. Keep every start area on the ground and clear
   of obstacles. Training copies differ by seed while evaluations repeat the same starts. Randomize only world objects, never the body's parts. A randomized goal must stay clear of every
   obstacle across its whole range: next to parked cars, keep the range inside the free bay, or put the goal and
   the cars that flank it under one parent and randomize the parent so they move together. The design tests
   reject a goal that can land inside an obstacle and say how small a range stays clear.
6. **Check.** `try`, then `look` with view `top` at the whole scene: the goal must be clear, on open ground and
   reachable without a turn tighter than the body can make. Fix and try again before you `propose`.
7. **Train.** Navigation's recommended budget is 1M steps with 16 copies, about 8 to 10 minutes on CPU. Start
   with the simple version (fixed goal, few obstacles) and train it near that budget; success often stays low for
   a few hundred thousand steps before it climbs, so do not change the design for slow progress before about half
   of it. Then add difficulty one change at a time, continuing from the best brain (curriculum-and-warm-start).
   Promise no success rate: how often this body reaches the target is known only after its own run. Use `train`
   only when the person asks, and `read_run` with `evaluations` and `failures` before saying anything about
   learning.

Done when a passing try is proposed with a goal zone that fits the body, the navigation rewards inside their
ranges, a body that can brake or stand still, a top view with a clear path, and the person knows the next step is
training for about 1M steps.
