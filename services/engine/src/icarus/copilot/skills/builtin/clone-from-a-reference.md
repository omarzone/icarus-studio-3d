---
name: clone-from-a-reference
title: Create anything from a description or a reference picture
when: The person attaches a picture or describes something to recreate ("clone this car", "make an environment like this", "build a house like the one in the photo"), or asks for an object no library piece fits.
tools: [reference_scene, build_object, library, look, try, edit_group, edit_matching, propose]
version: 1
---
Anything can be built: library pieces when they fit, and compound objects made of parts when they do not. The
engine assembles every plan into ordinary objects, tests it physically and keeps it editable; the model never
writes project data itself.

1. **Read the reference.** Say what it shows: the place or the object, the thing whose real size you know (a car
   about 4.5 m long, a door 2.1 m, a person 1.7 m, a storey 3 m), the palette, the hour and the weather, and where
   the camera stands. Ask one short question only when the request could mean two very different things.
2. **A whole place: use reference_scene.** Pass the person's words and, when several pictures are attached, which
   one is the reference. It plans the scene (layout recipe, pieces, compound objects, ground, sky and light,
   camera), tries it, renders it from the reference's camera, compares the render with the picture and applies
   the corrections for up to three rounds. Set replace_scene only when the person wants the old scene gone.
3. **One object: use build_object.** Describe it as parts: box, sphere, capsule or cylinder with a size, a place
   relative to its parent and a look (color, style, finish, roughness, metalness, emissive). Scenery that stays
   put becomes a group; anything that moves or learns becomes a body. A car is a chassis box, a cabin box, glass
   windows as look-only parts with `material.finish` glass, lights as look-only parts with `material.emissive`
   = 1.5, and four wheel cylinders turned (-90, 0, 0) on hinges about their own z axis with torque motors.
   Mark detail that physics must not touch as collides false, and give the parts that collide real masses.
4. **Check the result.** Read the rounds: what differed, what was applied, what was refused. Look at the picture
   it returns; when something still differs, fix it with `edit_group` (move, turn, scale a whole object),
   `edit_matching` (one color or finish for many objects) or another `build_object`, chained with base_try.
   Use `look` from the reference's camera after each fix.
5. **Propose and report.** `propose` the last passing try_id. Say what was built from library pieces and what was
   built from parts, and list every item reported as not placed in plain words, never as if it were there.

Done when the proposal comes from a passing try, the render from the reference's camera reads like the
reference, every result is made of editable objects, and everything the engine could not place is named as not
placed.
