---
name: jump-and-climb
title: Teach a body to jump or climb onto something higher
when: The body must jump, leap, hop up, climb a ramp, steps or a platform, or get over something taller than a bump.
tools: [library, inspect_object, try, look, propose, train, read_run]
version: 1
---
Height is paid by `height_gain`, a locomotion term: each step it pays for how high the root is above where it
started, up to 1 m. It pays for height, not for time in the air, so the body learns whatever raises its root the
most: jumping when nothing else can, climbing when there is something to climb. No term pays for clearing a gap
or for landing on a chosen spot, and nothing can fly.

1. **Jump: leave no other way up.** Build the body standing with its legs close to straight, so the root starts
   near its highest standing point and more height only comes from leaving the ground. Use `height_gain` = 1,
   `fall_penalty` = -10, `stay_upright` = 0.1–0.3 so it lands upright, and `energy_cost` = -0.001. Leave out
   `feet_air_time`, which pays only while the body travels over the ground. Add `forward_progress` = 1 only for leaping
   forward.
2. **Jump: strong legs.** A jump needs legs that push the whole weight up fast: position motors with more
   `motor.max_force` than walking needs, raised with the mass until "Motors move their joints" passes, and a
   knee range that lets it crouch (move-a-joint). Too strong and it throws itself over; lower it by 20 to 30%
   when a run falls at the start (diagnose-a-brain).
3. **Climb: build the way up.** Use the `ramp` piece (static, 2 × 1.5 m tilted 15°) for a slope, and static
   `box` objects for steps and platforms, resting on the ground and touching each other so nothing floats. Start
   low: each step no taller than about a fifth of the leg or wheel, and raise them in later revisions
   (curriculum-and-warm-start). Give climbing surfaces grip: `collider.friction` = 1–1.2.
4. **Climb: the task.** Without a destination, use locomotion with `forward_progress` = 1 and `height_gain` = 0.5–1,
   the slope or steps along +x. To end on top of a platform, use navigation with the `goal_zone` above it;
   distance to the goal is measured on the ground, so the zone must sit where only the top is reachable. Legs
   keep `stay_upright`, `fall_penalty` and `energy_cost` either way.
5. **Leave out collision penalties.** Standing on a ramp, a step or a platform counts as touching an object, so
   `collision_penalty` would punish the climbing itself, and evaluations report those episodes as touching an
   object: read that as normal here.
6. **Senses.** `balance` on the root and `touch` on each foot for legs. To see a step before reaching it, a
   `distance_ray` tilted down (`distance_ray.tilt` = -20–-5) from the front (sensors-for-a-task).
7. **Check and train.** `try`, then `look` with view `left` at heights, slopes and where the feet stand. Then
   `propose`. Locomotion's recommended budget is 2M steps; promise no height or success, use `train` only when
   the person asks and `read_run` with `reward_terms` to see how much `height_gain` it earns.

Done when a passing try pays `height_gain` with posture terms for legs, has no collision penalty when it climbs,
obstacles resting on the ground and low enough to start, and the person knows what the library cannot do here.
