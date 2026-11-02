---
name: parking-and-navigation
title: Build a body that drives to a spot and parks
when: The person wants a car, a rover or any body that must reach, park at or stop in a place.
tools: [library, inspect_object, try, look, propose, train, read_run]
version: 1
---
Navigation means the body is paid for getting closer to a goal zone and succeeds when it comes to rest inside it
(inside the radius and slower than 0.2 m/s). An episode lasts 30 s at 20 control steps per second, so 600 steps.

1. **Start from the template.** Call `library` with `parking_car` and try its operations on an empty project: a
   900 kg car 4 × 1.8 × 0.6 m, front wheels steered by position motors (`joint.limits` ±35°, `motor.max_force` =
   2000) and rear wheels driven by torque motors (`motor.max_force` = 400) whose `joint.damping` = 80 caps the top
   speed near 1.6 m/s and brakes the car when the drive is off. Keep that drag when you rescale the car: without it
   the car cannot stop, and stopping is what parking pays for.
2. **Place the goal.** A `goal_zone` on open ground at least 4 m from the `spawn_point` (the template puts it 12 m
   ahead with `goal_zone.radius` = 1.5). A smaller radius makes parking stricter and slower to learn; below the
   car's width (1.8 m) it can only succeed when perfectly centred. For a parking lot, frame the spot with static
   `box` or `wall` pieces and leave at least 0.5 m on each side of the car.
3. **Rewards.** `reach_goal` = 10, `progress_to_goal` = 1, `collision_penalty` = -5, `time_penalty` = -0.01, all
   of the navigation family. `progress_to_goal` pays per metre gained, so a 12 m approach is worth about 12 and
   matches the parking bonus. Do not add `heading_alignment` unless the person needs a parking direction, and then
   keep `heading_alignment` = 0.01–0.05: it is paid every step, and at 0.2 a car that sits still facing the goal
   earns 120 per episode, twelve times the bonus (see the reward-design skill).
4. **Senses.** The car already observes its forward and side speed, turn rate, steering angles and the goal's
   distance and bearing; it needs no sensor to find the goal. Add a `distance_ray` only when there are obstacles:
   `distance_ray.count` = 5–8, `distance_ray.range` = 10, tilted down when obstacles are lower than the car body
   (see the sensors-for-a-task skill).
5. **Vary the start.** Every episode already starts the car a little off its spawn: up to ±1.5 m to the side, up
   to 2 m back and turned up to ±35°. To park from anywhere, widen that: turn on `spawn_point.random_heading`, or
   add `randomize` to the goal with `randomize.position_range` of a few metres on X and Y. Randomize only world
   objects, never the car's parts.
6. **Check.** `try`, then `look` with view `top` at the whole scene: the goal must be clear, inside the open
   ground and reachable without a turn tighter than the steering allows. Then `look` with view `onboard` to see
   what the rays face. Fix and try again before you `propose`.
7. **Train.** Navigation's recommended budget is 1M steps with 16 copies, about 8 to 10 minutes on CPU. Promise
   no success rate: how often this car parks is known only after its own run. Use `train` only when the person
   asks. After it runs, `read_run` with `evaluations` and `failures` before saying anything about learning.

Done when a passing try is proposed with a goal zone, the four navigation rewards inside their ranges, a top view
that shows a clear path, and the person knows the next step is training for about 1M steps.
