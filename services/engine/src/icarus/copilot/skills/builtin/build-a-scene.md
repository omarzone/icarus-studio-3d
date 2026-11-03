---
name: build-a-scene
title: Build and edit large, detailed scenes
when: The person asks for a big or detailed place (a city block, a warehouse, a forest, a stadium, a maze), many copies of something, or to change many objects at once.
tools: [find_objects, library, inspect_object, pattern, edit_group, edit_matching, try, look, propose]
version: 1
---
Large scenes are built from a few good pieces repeated, never from hundreds of hand-written operations. Every
tool below expands into ordinary edit operations and returns a try_id, so the result is tried, proposed and undone
like any other change. One change holds up to 500 operations.

1. **Read the scene.** `find_objects` answers "what is there and where": filter by text, kinds (group for a
   transform-only parent), material color or style, inside an object, a region or near a point, and ask only the
   fields you need. Page with offset when total is larger than the page.
2. **Make one good piece.** Build the piece once with `library` pieces and `try`: a shelf with its boxes, a tree
   with trunk and crown, a lamp post. Put its parts inside one transform-only parent so it moves as a group
   (`edit_group` with make_group wraps objects that already share a parent).
3. **Repeat it.** `pattern` copies the piece with everything inside it: linear for rows of shelves or fence posts,
   grid for parking bays or seats, circle for pillars around a plaza (facing the center), mirror for the other
   side of a street, scatter for trees or rocks with a seed, min spacing and a little jitter of turn, scale and
   color. Always pass keep_clear with the spawn, the goal and the path so nothing lands where the body must go.
4. **Adjust groups.** `edit_group` moves, turns around a pivot or scales a whole group and everything in it; a
   uniform scale also grows the gaps inside it. Chain changes with base_try so one proposal holds them all.
5. **Restyle in bulk.** `edit_matching` sets a property on every object a filter matches, such as one
   `material.color` for every crate; it reports what it edited, what lacks the component and what its limit left
   out.
6. **Check what physics sees.** `look` with shots shows several views in one contact sheet (top, front, side and
   a free camera); mode colliders draws only the shapes that touch the body, so decoration that hides a real
   obstacle, or a gap that is not really open, shows up. Fix it, then `propose`.

Done when the scene was built from repeated pieces in tries that passed, keep_clear kept the spawn, the goal and
the path open, and a contact sheet (styled and colliders) shows the layout reads clearly from above and from the
body's height.
