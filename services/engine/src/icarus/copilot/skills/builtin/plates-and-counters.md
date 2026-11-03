---
name: plates-and-counters
title: Floor plates to step on, counters on the walls and eyes on characters
when: The person wants pressure plates, target plates, start pads or zones to step on, a course of plates in order, counters or digital displays (time, generation, steps, successes, reward, distance), a progress bar over the agent, or eyes and a face on a character or robot.
tools: [library, inspect_object, find_objects, try, look, propose, read_run]
version: 1
---
A floor plate is a thin static plate on the floor that the engine watches every step: pressed when what it watches
pushes on it with at least its press force (MuJoCo contacts), occupied when that thing's center is over it. Plates
are floor, never obstacles or collisions. Displays and eyes are look-only: they never change what a brain learns.
Every value a display shows is measured by the engine per frame in training, replays and Play, never made up.

1. **Lay the plates.** Use the `pressure_plate`, `target_plate`, `start_pad` and `step_zone` pieces, or a
   `plate` component on an empty object resting on the ground. `plate.role`: target for goals (green), pressure
   for plates that sink under weight, start for the striped pad the spawn point sits on (never a goal), custom for
   any other place. Size a plate from the body: a walker needs about 1 m square, a car 5 by 3.4 m so all four
   wheels land on it. `plate.trigger` touch needs `plate.press_force` below the body's weight (a 20 kg walker
   pushes about 200 N); use center for light bodies or plates a vehicle crosses with its wheels apart.
   `plate.watch` agent, object (with `plate.object`, for pushing a crate onto a plate) or anything.
2. **Make them the goal or pay for them.** `reach_plates` = 10 with setting mode any, all or in_order ends the
   try as a success once the plates are reached; for in_order number the plates with `plate.order` 1, 2, 3.
   `plates_pressed` = 5 pays each plate on the way; `on_plate` = 0.1 pays every step on a goal plate, so keep it
   small. The goal plates are the target plates, or every plate but start pads when there is no target plate.
   Plate terms fit navigation and locomotion. Keep `progress_to_goal` only when a `goal_zone` also guides the body;
   otherwise a body learns the plates from the plate terms and its own senses (add a `target` sense pointed at a
   goal zone over the last plate, or rays, when plates are far apart).
3. **Add counters.** The `time_counter` and `generation_counter` pieces stand a panel on a wall, or add a
   `display` component to any part. `display.source`: episode_time, step, try, training_steps (the brain's
   training steps: the live run, the replayed checkpoint or Play's brain), successes, reward, goal_distance,
   goal_progress, sensor (with `display.sensor` set to a sensor id or object id), plates or fixed (shows
   `display.text`). `display.format` integer, decimal (with `display.decimals`), time (mm:ss) or text, and
   `display.label` such as TIME or GEN. Place it with `display.offset` on the face of its part and
   `display.heading` toward the camera, or turn on `display.billboard`.
4. **A progress bar over the agent.** A `display` on the agent's root with `display.style` bar, source
   goal_progress, `display.full_scale` 1, `display.offset` about 0.5 m above its top and billboard on.
5. **Give characters eyes.** An `eyes` component on the head or torso: `eyes.size` about a quarter of the face's
   width, `eyes.spacing` about half of it, `eyes.facing` 0 for the part's front (+X), `eyes.look` movement to
   follow the way it moves or goal to look at the goal zone. New walker and humanoid projects already have them.
6. **Check.** `try`, then `look` from the top: plates on the floor and clear of walls, the spawn on its start pad,
   counters out of the path. Say what each display will show and that its values appear while the world runs.

Done when the plates, counters and eyes the person asked for are proposed in a passing try, with the plate goal
or plate rewards set when plates should be learned, and the person knows displays show engine values only.
