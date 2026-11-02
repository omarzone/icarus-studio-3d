---
name: environment-look
title: Make the world look like the request
when: The person asks for a theme, colors, a sky, a mood, decoration or a scene that looks like a place.
tools: [library, inspect_object, try, look, propose]
version: 1
---
The look never changes physics except where a surface sets friction; the body learns the same task in a pretty
world. Make it readable first: the camera must show the body, the goal and the obstacles at a glance.

1. **Choose a palette.** Three to six colors: ground, frame (walls, shelves), props, accents for goals and
   hazards. The body gets a color that stands out from the ground. Set each with `material.color`.
2. **Sky and light.** One `sky` per world: `sky.preset` is `day`, `dusk`, `night`, `overcast` or `custom`; its
   `sky.top` and `sky.horizon` apply only with `custom`, so "blue sky" means `day`. `sky.ambient` = 0.6–1.2 keeps
   shadows readable, `sky.fog` = 0–0.3 adds haze without hiding the goal. A `light` sun at `light.intensity` = 1
   lights the scene; add point lamps above for night scenes. For a time of day set `sky.use_clock` on and
   `sky.clock_time` (hours); `sky.clouds`, `sky.stars`, `sky.sun_size`, `sky.glare`, `sky.haze` and the color grade
   (`sky.exposure`, `sky.saturation`, `sky.tint`) set the mood. None of them change the physics.
3. **Ground.** Give the ground a fitting `material.surface` and `surface` kind: `asphalt` (friction 1.0), `grass`
   (0.6), `wood` (0.7), `metal` (0.5), `rubber` (1.2), `ice` (0.05). Snow is white `ice` with
   `surface.friction` = 0.3. Changing friction changes what the body must learn: say so in the proposal.
4. **Props with roles.** Build the layout from props that each have a job: walls and shelves (tall static boxes)
   frame the space, ramps and platforms change height, floor markings (static boxes 0.01 to 0.02 m tall) show
   lanes and spots, decoration fills the edges, movable crates and balls (`box`, `ball`) can be pushed. Rest each
   prop on the ground, keep 1 m clear around the start and the path, and keep the scene within about 30 m.
5. **Vary the look per copy.** `randomize.color` shifts a world object's color between copies; it helps a brain
   that will see different scenes and costs nothing in physics.
6. **Check.** `try`, then `look` with view `three_quarter` at the whole scene and with view `onboard` from the
   body. The goal and obstacles must stand out from the ground; nothing floats or hides the path. Then `propose`.

Done when the proposal has a stated palette, a fitting sky and ground, props that each have a role, and a
three-quarter view where the body, the goal and the obstacles are easy to tell apart.
