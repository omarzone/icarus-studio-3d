---
name: curriculum-and-warm-start
title: Train in stages and continue from a trained brain
when: A task is too hard to learn at once, or the person wants to keep training or build on an earlier run.
tools: [read_run, inspect_object, try, propose, train]
version: 4
---
There is no automatic curriculum: stages are revisions of the project, and each stage continues from the best
brain of the one before. A continued run counts its own steps from 0, and its first evaluation is the inherited
brain. The plan is always the same: a simple world first, trained close to the recommended budget (1M steps for
navigation, 2M for locomotion) until it succeeds, then one difficulty at a time, each continued from the best
brain. Restarting from zero throws away every step trained so far, so plan the final senses and motors up front.

1. **Check a warm start is possible.** A brain is shaped by how many values the body senses and how many motors it
   drives. Continuing works after changes to rewards, weights, positions, goals, obstacles, randomization or looks.
   It fails after adding or removing a motor, a `distance_ray` (or changing `distance_ray.count`), a `balance` or a
   `touch`; then train from zero and say why. Turning rays with `distance_ray.heading` or `distance_ray.tilt` keeps
   the size, but the brain must relearn what each ray means; renaming them with `distance_ray.name` changes nothing
   it senses. When a change forces a restart, say so in the proposal with the steps it costs.
2. **Make the easy stage.** Keep the final body and senses, and make the world forgiving: goal closer (4 to 6 m),
   `goal_zone.radius` larger, no `randomize`, `spawn_point.mode` auto, fewer obstacles. Navigation still
   varies the start a little (±1.5 m to the side, ±35° of heading) even then. Train it with
   `train` until evaluations succeed most of the time; read them with `read_run` and `evaluations`. Give it time:
   success often stays low for the first few hundred thousand steps and then climbs, so do not change the stage
   before about half the recommended budget unless the facts show a design problem.
3. **Harden one thing per stage.** Next revision: widen the start. To generalize, set `spawn_point.mode`
   anywhere so each try starts at a free place anywhere on the map, facing any way and at least
   `spawn_point.goal_distance` from the goal; for a narrower step use mode area with a sized `spawn_point.area`
   and `spawn_point.heading_range` (or several spawn points with random_point). Then
   `randomize` the goal (`randomize.position_range` of 1 to 3 m), then add obstacles or shrink the zone. Never let a randomized goal
   reach occupied space: keep its range inside free ground, or when it should land in one of several bays, move
   the parked objects with it (put them under one parent and randomize the parent) or train each free position
   as its own stage. The design tests reject a goal that can land inside an obstacle. `try` and `propose` each
   stage as its own change.
4. **Continue from the best brain.** Start each stage with train and continue_from_best, which picks up the best
   checkpoint of the newest finished run of this project. Use fewer steps than from zero, for example a few hundred thousand, and judge by the
   evaluations of the new revision, not the old run.
5. **Know when to stop staging.** If a stage's first evaluation (the inherited brain) already succeeds, harden
   again; if success drops to near zero and does not recover by half the stage's steps, the jump was too big:
   go back one revision and harden by less.

Done when the plan names each stage as a revision, every stage keeps the same senses and motors so it can
continue, and each continued run is judged by its own evaluations.
