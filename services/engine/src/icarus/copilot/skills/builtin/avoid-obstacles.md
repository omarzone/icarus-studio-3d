---
name: avoid-obstacles
title: Teach any body to see obstacles and get past them
when: Things stand in the body's way and it must see them and steer around, stop before or step over them, such as clutter, a slalom, a race track or an obstacle course.
tools: [library, inspect_object, try, look, propose]
version: 1
---
Avoiding obstacles is a skill on top of a task, never a task alone: the body still needs somewhere to go. A race
or a course with a finish is navigation (the finish is a `goal_zone`); "walk forward through the clutter" with no
destination is locomotion, which only pays for moving along +x and has no finish line. A course is one example;
a rover in a cluttered room or a walker on rough ground are the same skill.

1. **Choose the task.** With a destination, use navigation with `reach_goal` = 10 and `progress_to_goal` = 1, the
   goal at least 4 m from the `spawn_point` and the whole layout within about 30 m so 30 s episodes can finish it.
   A legged body there keeps `stay_upright`, `fall_penalty` and `energy_cost` and drops `forward_progress`, all in
   the same try; the try warns when posture terms are lost. Without a destination, keep locomotion and put the
   obstacles along +x.
2. **Pick the obstacles.** Start from `library` pieces: `box` (a movable 5 kg crate), `post` (a fixed post to
   steer around), `wall`, `ramp` (static, 2 × 1.5 m tilted 15°) and `ball`. Rest every prop on the ground (its z
   is half its height) and make blockers static with `physics_body.mode` static. Bumps for rough ground stay no
   taller than a fifth of the leg or wheel; anything taller is climbing (jump-and-climb).
3. **Shape the way.** To force steering, leave gaps wider than the body between obstacles; to block the way, span
   the whole lane, because a gap wider than the body lets it go around, and the try warns about that gap with the
   body's width. Frame a lane with long static walls (4 m or longer along one side, so the course check reads them
   as lane edges) or with floor lines: static boxes 0.01 to 0.02 m tall without a collider. Keep 1 m clear around
   the start.
4. **Let it see.** The body reacts only to what it senses: a `distance_ray` that hits the obstacles from the
   start, `distance_ray.count` = 5–8 and `distance_ray.range` = 5–10. Tilt it down for obstacles lower than the
   part carrying it (`distance_ray.tilt` = -10–-5 at about 0.5 m height); see sensors-for-a-task. The try reports
   which obstacles a ray hits and warns when none does.
5. **Price the hits.** In navigation, `collision_penalty` = -20–-5 per new contact teaches it to keep clear;
   too large and it learns to stay still, so keep it below the success terms. Locomotion has no collision term:
   there a hit only costs the time lost.
6. **Vary the layout.** Add `randomize` to obstacles with `randomize.position_range` of 0.5 to 2 m across the
   way so the brain learns to look instead of memorising one layout. Keep the goal fixed until it can pass the
   fixed layout (curriculum-and-warm-start).
7. **Check.** `try`, then `look` with view `top` for gaps and the lane, with view `left` for heights, and with
   view `onboard` to see what the rays face. Fix every course warning or explain it in the proposal, then
   `propose`.

Done when a passing try has a task with somewhere to go, obstacles placed to be steered around or blocked as
intended, rays that see them from the start, and a top view with no unintended gap.
