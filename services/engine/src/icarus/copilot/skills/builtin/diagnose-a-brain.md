---
name: diagnose-a-brain
title: Diagnose a brain that does not learn and fix it
when: A run finished or is training and the body falls, stalls, wanders, crashes or never succeeds.
tools: [read_run, inspect_object, try, look, propose, train]
version: 3
---
Every explanation comes from the run's own data. When there is no run, say no training has run yet and offer one.
Do not wait for a stall: the run brief's health facts and coach notes already name what blocks learning at the
first checkpoints (reward paid without doing the task, objects touched, early endings, log errors). Act on them.

1. **Read the run.** `read_run` with `status`, `evaluations`, `curve` and `failures`. Compare total steps with the
   recommended budget (1M for navigation, 2M for locomotion); when the run is far below it, say it is too short to
   judge and offer to continue it rather than changing the design.
2. **Name the ending.** The failures section groups evaluation episodes by how they ended: reached the goal, fell
   early (in the first third of the episode, before 10 s), fell later on, touched an object, time ran out close to
   the goal (it covered at least 70% of the way) or far from it, walked forward, or stayed up but barely moved.
   Work on the largest group first and quote its count from the run.
3. **Falls early.** The body cannot stand before it can move. `inspect_object` the root and the legs: check the
   root's `balance` sensor, foot `touch`, stance width and motor force against mass. A smaller `fall_penalty` is
   not the fix. If it throws itself over at the start, lower `motor.max_force` by 20 to 30%; if it tips while
   standing, widen the feet or the stance. Keep `stay_upright` in the task.
4. **Stalls or stays in place.** A per-step term outweighs progress. `read_run` with `reward_terms`: if
   `stay_upright` or `heading_alignment` earns more per episode than the success terms, lower it (see
   reward-design) or raise `forward_progress` / `progress_to_goal`.
5. **Touches obstacles.** Check the body can see them: a `distance_ray` that reaches them from the start, tilted
   down for low ones. `look` with view `onboard` at the latest revision. Then consider `collision_penalty` = -20–-5,
   or more room in the gaps. When the touched object stands at height 0.01 m or so (a painted line, a marking, a
   floor decal), it is decoration that should not collide: remove its `collider` and `physics_body` instead of
   adding penalties.
6. **Times out.** Near the goal: the bonus needs a stop under 0.2 m/s inside the zone, so check the drive can brake
   (wheel `joint.damping`) and the zone radius fits the body. Far from the goal: the course is too long or too hard
   for 30 s; move the goal closer and train the easy version first (curriculum-and-warm-start).
7. **Walks badly.** A legged body that moves forward but crawls, hops, drags a foot, twitches or veers has gait
   facts in the run brief: the root's height against its start, each foot's ground contact share and lift-offs
   ("the left foot touches the ground 98% of the time ... (dragged)"), every foot in the air at once (hopping),
   action change per step (twitching), joints at their limits and sideways drift. Quote the number and add the
   one gait term that answers it, as walking-robot lists: `feet_air_time`, `body_height`, `smooth_actions`,
   `joint_limits` or `heading_and_drift`. Compare the same fact at the next run's checkpoints to see it worked.
8. **Propose one fix.** `try` the smallest change that answers the largest group, `look` if it changes layout,
   then `propose` with the evidence (the group and its count). Offer `train`, continuing from the best brain when
   the sensors and motors did not change.

Done when the answer names the largest failure group with its count from the run, the change answers that cause,
and the next run is offered with its expected effect.
