---
name: curriculum-and-warm-start
title: Train in stages and continue from a trained brain
when: A task is too hard to learn at once, or the person wants to keep training or build on an earlier run.
tools: [read_run, inspect_object, try, propose, train]
version: 1
---
There is no automatic curriculum: stages are revisions of the project, and each stage continues from the best
brain of the one before. A continued run counts its own steps from 0, and its first evaluation is the inherited
brain.

1. **Check a warm start is possible.** A brain is shaped by how many values the body senses and how many motors it
   drives. Continuing works after changes to rewards, weights, positions, goals, obstacles, randomization or looks.
   It fails after adding or removing a motor, a `distance_ray` (or changing `distance_ray.count`), a `balance` or a
   `touch`; then train from zero and say why.
2. **Make the easy stage.** Keep the final body and senses, and make the world forgiving: goal closer (4 to 6 m),
   `goal_zone.radius` larger, no `randomize`, `spawn_point.random_heading` off, fewer obstacles. Navigation still
   varies the start a little (±1.5 m to the side, ±35° of heading) even then. Train it with
   `train` until evaluations succeed most of the time; read them with `read_run` and `evaluations`.
3. **Harden one thing per stage.** Next revision: turn on `spawn_point.random_heading` to widen the start, then `randomize` the goal
   (`randomize.position_range` of 1 to 3 m), then add obstacles or shrink the zone. `try` and `propose` each stage
   as its own change.
4. **Continue from the best brain.** Start each stage with train and continue_from_best, which picks up the best
   checkpoint of the newest finished run of this project. Use fewer steps than from zero, for example a few hundred thousand, and judge by the
   evaluations of the new revision, not the old run.
5. **Know when to stop staging.** If a stage's first evaluation (the inherited brain) already succeeds, harden
   again; if success drops to near zero and does not recover by half the stage's steps, the jump was too big:
   go back one revision and harden by less.

Done when the plan names each stage as a revision, every stage keeps the same senses and motors so it can
continue, and each continued run is judged by its own evaluations.
