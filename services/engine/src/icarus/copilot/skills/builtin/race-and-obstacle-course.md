---
name: race-and-obstacle-course
title: Lay out a race track or an obstacle course
when: The person wants a race, a finish line, a track, a parkour or obstacles to jump, dodge or climb.
tools: [library, inspect_object, try, look, propose]
version: 1
---
A race has a destination, so it is a navigation task: the finish is a `goal_zone`, and the body learns
`progress_to_goal` and `reach_goal`. Locomotion only pays for moving along +x and has no finish line.

1. **Finish and task.** Put a `goal_zone` at the finish, at least 4 m from the `spawn_point`, and keep the whole
   course within about 30 m so 30 s episodes can finish it. Use `reach_goal` = 10 and `progress_to_goal` = 1. A
   legged racer keeps `stay_upright`, `fall_penalty` and `energy_cost` and drops `forward_progress`, all in the
   same try; the try warns when posture terms are lost.
2. **Lane.** Frame the way with long static walls (4 m or longer along one side, so the course check reads them
   as lane edges, not obstacles), or with floor lane lines: static boxes 0.01 to 0.02 m tall lying on the ground.
   Leave at least 1 m clear around the start.
3. **Obstacles.** Start from `library` pieces: `box` (a movable 5 kg crate), `ramp` (static, 2 × 1.5 m tilted
   15°), `wall`, `post` and `ball`. An obstacle meant to be jumped or to block the way spans the whole lane: a gap
   wider than the body lets it walk around, and the try warns about that gap with the body's width. Bumps for rough
   ground stay no taller than a fifth of the leg or wheel. Rest every prop on the ground (its z is half its height)
   and make blockers static with `physics_body.mode` static.
4. **Let it see.** A body that must react to obstacles needs a `distance_ray` that hits them from the start; tilt
   it down for obstacles lower than the part carrying it (see sensors-for-a-task). The try warns when no ray sees
   any obstacle.
5. **Vary the course.** Add `randomize` to obstacles with `randomize.position_range` of 0.5 to 2 m across the
   lane so the brain learns to look instead of memorising one layout. Keep the finish fixed until it can win the
   fixed course (see curriculum-and-warm-start).
6. **Check.** `try`, then `look` with view `top` for gaps and the lane, and with view `left` for heights and
   ramps. Fix every course warning or explain it in the proposal's warnings, then `propose`.

Done when a passing try has a finish zone, the navigation rewards, obstacles that span the lane or are meant to
be passed, rays that see them, and a top view with no unintended gap.
