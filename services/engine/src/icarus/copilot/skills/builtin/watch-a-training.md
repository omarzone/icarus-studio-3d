---
name: watch-a-training
title: Watch a training run and name what the body really does
when: The person wants a run watched, asks how the body moves or what it is doing wrong, or the body moves badly: crawls, hops, drags a leg, twitches, spins or veers.
tools: [read_run, coach, inspect_object, try, look, propose, train]
version: 2
---
Watching judges how the body moves, not only whether it succeeds. Every claim comes from the run: its recorded
evaluation episodes, its health facts and its gait signals. Never describe a frame nobody looked at; when a
checkpoint has no pictures, say so and judge from the numbers.

1. **Find the run.** `read_run` with `status`, `evaluations` and `failures`. When nothing has trained, say no run
   exists yet and offer one. When the run is far below its recommended steps, say early behavior is still
   changing and watch anyway: a bad habit is cheaper to fix early. Slow progress is not a reason to change the
   design before the brain has trained about half the recommended budget (500k steps for navigation, 1M for
   locomotion), counting the runs it continued from: a curve that is low but rising needs more steps, not a fix.
   Only a design problem (a goal inside an obstacle, a reward paid for the wrong thing, a body that cannot move or
   stand) is worth stopping early for.
2. **Watch it frame by frame.** `coach` with action diagnose: the coach opens the latest evaluated checkpoint,
   watches recorded episodes with its film_strip (about 20 pictures at a fixed interval plus the failure moment,
   from a camera that follows the body) and compare_strips (two checkpoints one above the other, to see whether
   the motion got better or worse), reads the run health facts and gait signals, and posts its findings in this
   conversation. Coached runs also get coach notes at their checkpoints. Use what they say; do not guess frames.
3. **Name the behavior.** Say what the body does in plain words and quote the fact behind it: falls forward or
   backward (episodes end early and fell); stands still (it barely moved forward); crawls (the root stays below
   70% of its start height); drags a leg (a foot touches the ground 95% of the time or more while moving); holds
   a foot up (5% or less); hops (every foot in the air at once 30% of the steps or more); twitches (actions change
   by 0.3 or more per step); locks its legs (joints at their limits 30% of the time or more); spins, veers or
   drifts sideways; leans on a part as a crutch, rolls or flips; games the reward (a few terms make most of the
   reward while no episode succeeds).
4. **Map it to a design area.** Each finding points to one place: reward (a term paying for the wrong thing or a
   missing gait term: `feet_air_time` for a dragged foot, `body_height` for crawling, `smooth_actions` for twitching,
   `joint_limits` for locked legs, `heading_and_drift` for veering, a smaller `stay_upright` or
   `heading_alignment` when the reward is gamed); sensors (a `balance` or `touch` it lacks, a `distance_ray` that
   misses what it hits); body (joint ranges, `motor.max_force`, masses, stance, foot friction); world (obstacles,
   surfaces, goal distance); brain (more steps, copies, per-copy variation). Name the concrete change.
5. **Try the change.** `inspect_object` what it touches, then `try` the smallest change for the largest finding,
   one per revision so the next run shows what it did. `look` when it changes the layout or the body. Keep every
   value inside its library range.
6. **Propose it.** `propose` with the behavior, the fact and its number from the run, the area and what should
   change in the next run. Offer `train` continuing from the best brain when the senses and motors did not change.
   When the change adds or removes a sensor or a motor, say plainly that the next run starts from zero and loses
   the steps already trained; prefer a fix that keeps them when one cures the same cause.
7. **Watch again.** After the next run, ask the coach to watch it the same way. Its strips compare checkpoints
   within one run; between runs, compare the same fact's number at a similar step and say whether the behavior
   got better, stayed or got worse.

Done when each named behavior quotes a fact or a picture from the run, maps to one design area with a concrete
change, a passing try of the largest one is proposed, and the person knows how the next run will show whether it
worked.
