---
name: build-with-parts
title: Build shapes from scratch with parts, wedges and palette materials
when: The person asks to build from basic shapes rather than ready-made pieces (a ramp, stairs, a roof, a bridge, an obby), to change what a part is made of (wood, ice, sand, metal, glass, neon), or to change the ground slab.
tools: [library, inspect_object, find_objects, pattern, edit_matching, try, look, propose]
version: 1
---
A part is one object with a Transform, a Mesh, a Material, a static Physics body and a Collider, like a brick in
a construction set. Parts are built from these components with `try`; there is no part piece to look up.

1. **Pick the shape.** `mesh.shape` is box, sphere, cylinder, capsule, wedge or corner_wedge, and `mesh.size` is
   its full width, depth and height in metres (cylinders and capsules: diameter, diameter, length). A wedge is a
   ramp that rises from its +Y edge to full height along its -Y edge; a corner wedge peaks over its +X, -Y corner.
   Turn either with `transform.rotation` (degrees around Z to aim the slope). Wedges collide as solid convex
   shapes, so bodies roll and walk up them.
2. **Size on the grid.** Keep sizes and positions on multiples of 0.25, 0.5 or 1 m, the person's move snap, so
   their parts and yours line up and stack: a 4 by 2 by 1 block sits at z 0.5 on the ground, the next one on top
   at z 1.5. A ramp a body can climb rises at most about 1 m every 3 m for wheels and 1 m every 2 m for legs.
3. **Anchor or free.** `physics_body.mode` static keeps the part anchored where it is; dynamic lets it fall, roll
   and be pushed, with `physics_body.mass` in kg. A part without a Collider is drawn only and nothing touches it.
4. **Pick the material.** `material.preset` takes plastic, smooth_plastic, wood, wood_planks, brick, cobblestone,
   concrete, metal, diamond_plate, corroded_metal, grass, sand, ground, ice, glass, neon, marble, granite, fabric
   or foil, and `material.color` tints it. Picking one also sets the surface and the friction of the part's
   collider: ice is slippery under anything, sand grips less than plastic, fabric and ground grip more, glass is
   see-through and neon glows. Custom keeps the surface and finish set by hand. Recolor or re-material many parts
   at once with `edit_matching` after checking its filter with `find_objects`.
5. **The ground slab.** The `ground` component makes an object the floor: a static slab whose top is the object's
   height, with `ground.size` its width, depth and thickness, so its sides show. Its material sets its look and
   grip like any part, and `ground.decal` draws grid lines or studs every `ground.decal_cell` metres. A world whose
   floor is an old endless plane (a mesh with shape plane and no ground component) becomes a slab only when the
   person asks: add a `ground` component sized to the plane's mesh size and a thickness of 1 m; never convert it
   on your own.
6. **Repeat and check.** Build one part or a small group, then `pattern` it for rows, stairs and walls. `look`
   from the body's height and with mode colliders, then `propose`.

Done when the parts rest on the ground or on each other on round sizes, the slopes and materials are the ones the
person asked for, and a look from the body's height shows nothing floating or blocking the path.
