---
name: push-an-object
title: Teach a body to push an object to a place
when: The body must move something else, such as pushing a crate, a ball or a block into a zone, herding, delivering an object or playing football.
tools: [library, inspect_object, try, look, propose, train, read_run]
version: 1
---
Pushing is the navigation task with `object_to_goal`: it pays for every metre a chosen movable world object gets
closer to the `goal_zone` (at most 1 per step) and a bonus of 10 once the object comes to rest inside it; the
episode then ends as a success, wherever the body is. The body also observes where that object is, so it needs no
sensor to find it. The body can push, bump and nudge; it cannot grasp, lift or carry.

1. **Pick the object.** A world object, not a body part, that moves on its own: a dynamic `physics_body`, no
   parent and no `joint`. The `box` piece (a 5 kg crate 0.5 m wide) slides and keeps its line; the `ball` piece
   (0.5 kg, 0.3 m) rolls far from a light touch and is harder to stop in the zone. Set the term's object setting
   to that object's id; the try refuses an object that is fixed, missing or part of a body.
2. **Place start, object and goal.** Put the object between the `spawn_point` and the goal, about 1 to 2 m in
   front of the body, and the goal at least 4 m from the start on open ground. Make the zone wider than the
   object: `goal_zone.radius` = 1–2 for the crate.
3. **Body that can push.** A flat, wide front (a box part as a bumper) pushes straight; a narrow or round front
   lets the object slip to the side. Its motors must move its own weight plus the object: a wheeled body with
   torque motors and `joint.damping` to brake (reach-a-target), or a legged one from `walker_robot` with its
   posture terms. Heavier objects need more `motor.max_force`, or a lighter object (`physics_body.mass`).
4. **Rewards.** `object_to_goal` = 1–2 is the core. Keep `progress_to_goal` = 0.1–0.3, small, so the body does not
   drive past the object to the goal; add `time_penalty` = -0.01. Leave out `collision_penalty`: touching the
   pushed object counts as a contact, so it would punish the pushing itself. Leave out `reach_goal` or keep it
   small, since it pays the body for parking itself in the zone, not the object.
5. **Read failures right.** Evaluations count every episode where the body touched something as touching an
   object; for a pusher that is the job, so read "touched an object" as normal and judge by success and how
   close the object got.
6. **Vary it.** Once the fixed layout succeeds, add `randomize` to the object with `randomize.position_range` of
   0.5 to 1 m, then to the goal (curriculum-and-warm-start). Never randomize the body's parts.
7. **Check and train.** `try`, then `look` with view `top`: body, object and goal in a line with room around
   them. Then `propose`. Navigation's recommended budget is 1M steps. Promise no success rate, use `train` only when the person asks and `read_run` with `evaluations` before
   judging.

Done when a passing try names a movable object in `object_to_goal`, has no collision penalty, a goal wider than
the object, and the person knows the body pushes but cannot grasp or carry.
