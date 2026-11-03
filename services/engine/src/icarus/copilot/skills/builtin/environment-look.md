---
name: environment-look
title: Make the world look like a believable place
when: The person asks for a theme, colors, a sky, a mood, decoration, a realistic world or a scene that looks like a place (a street, a parking lot, a warehouse, a park, a farm, a planet).
tools: [library, inspect_object, find_objects, pattern, edit_matching, try, look, propose]
version: 3
---
The look never changes the task: the body learns the same thing in a believable world. A place reads as real when
its surroundings frame it, its pieces share one scale and one palette, and the sky and ground fit the hour and the
weather. Build it around the task, never on top of it.

1. **Name the place and its scale.** Say what the scene is and where the task happens in it, then size everything
   from the body: a car is about 4.5 m long and 1.8 m wide, a person 1.7 m tall, a door 2.1 m, a storey 3 m, a
   road lane 3.5 m, a parking bay 2.5 by 5 m, a sidewalk 2 to 3 m wide and 0.12 m high, a curb 0.15 m high. Keep
   the whole scene within about 40 m so the camera can show it.
2. **Frame the space.** Surround the task area with context that says where it is, outside the path:
   `building` pieces (tall static boxes, `wall` style, 6 to 15 m high) along the far edges like a street front or
   the walls of a hall; `sidewalk` slabs and `curb` lines at road edges; `tree`, `lamp_post` and `sign` pieces in
   regular rows (a lamp every 10 to 15 m, trees every 6 to 10 m) on the sidewalks or verges; `cone` pieces only
   where they mark something. Indoors, use walls, shelves (tall static boxes) and pillars instead. Repeat pieces at
   even spacing and vary them a little (`randomize.color` on, small size changes) so rows do not look stamped.
   Lay rows, grids, rings and seeded scatter with `pattern` (keep_clear the spawn, the path and the goal), and
   recolor many pieces at once with `edit_matching` after checking its filter with `find_objects`.
3. **Keep the task's path and senses clear.** Decoration never blocks the way from the start to the goal, never
   sits on or inside the goal zone, and never stands where a `distance_ray` would read it as an obstacle unless the
   task is about avoiding it. Pieces that are only looks (`tree`, `lamp_post`, `sign`, markings) have no
   `collider` and no `physics_body`, so nothing touches them; pieces that frame the space for real (`building`,
   `curb`, walls) keep their collider. Keep at least 2 m between decoration and the path, and rest every piece on
   the ground: nothing floats.
4. **One palette.** Three to six related colors set with `material.color`: ground, frame (buildings, walls), props
   and one accent for goals and hazards. Muted for buildings and ground (warm greys, sand, brick, concrete), one
   saturated accent, and a body color that stands out from the ground. Floor markings are static boxes 0.01 to
   0.02 m tall in white or yellow with the marking style.
5. **Ground and surfaces.** Give the ground a fitting `material.surface` and `surface` kind: `asphalt` for roads
   and lots (friction 1.0), `concrete` for sidewalks and halls, `grass` for parks (0.6), `wood` for floors (0.7),
   `metal` (0.5), `ice` (0.05). Snow is white `ice` with `surface.friction` = 0.3. Changing friction changes what
   the body must learn: say so in the proposal.
6. **Sky that fits the hour.** One `sky` per world. For a time of day turn `sky.use_clock` on and set
   `sky.clock_time` (7 for morning, 14 for afternoon, 18.5 for sunset, 22 for night); otherwise pick
   `sky.preset` (`day`, `dusk`, `night`, `overcast`). Add weather with `sky.clouds` = 0.2–0.6, `sky.haze` = 0.1–0.4
   for distance, `sky.sun_size` = 2–5 with `sky.glare` = 0.2–0.5 for a visible sun, `sky.stars` at night, and keep
   `sky.ambient` = 0.6–1.2 so shadows stay readable and `sky.fog` at 0.3 or less so the goal stays visible. At
   night add point lights above the `lamp_post` pieces. None of these change the physics.
7. **Check.** `try`, then `look` with view `three_quarter` at the whole scene, view `top` to confirm the path and
   goal are clear, and view `onboard` from the body. The body, the goal and the obstacles must stand out; the
   surroundings frame them without hiding anything. Fix and try again, then `propose` with the place, the palette
   and the sky in plain words.

Done when the proposal names the place, frames it with context at the edges, keeps one scale and one palette,
has a sky and ground that fit, leaves the path, the goal and the senses clear, and a three-quarter view shows a
believable scene where the body, the goal and the obstacles are easy to tell apart.
