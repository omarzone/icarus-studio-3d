---
name: build-an-environment
title: Lay out a whole environment in one call with a layout recipe
when: The person asks for a place for any body to act in, such as a parking lot, a room or house, a maze or corridor, streets or a city, a warehouse, a forest or park, a race track or obstacle course, or steps and platforms.
tools: [library, layout, look, try, propose]
version: 1
---
A layout recipe is engine code with parameters: it lays out dozens of named objects from the library in groups
(one group per area, such as bays, parked cars, curbs, lamps), puts the spawn at its start and the goal zone at its
goal, and checks that the way between them stays open for the body's width. Use it instead of placing objects one
by one whenever the request is one of these places; it works the same for wheels, legs or any other body.

1. **Pick the recipe.** `library` with the query layout lists them; read the closest one by its id for its
   parameters, ranges and defaults.
   - `parking_lot`: rows of bays with cars parked in some and others free, curbs, lamp posts, an entry lane where
     the start is. Choose free_bays and goal_bay for the spot to park in; occupancy sets how full it is.
   - `room`: walls with doorways, a floor and scattered furniture; the start is inside the first doorway, the goal
     inside the last.
   - `maze`: seeded walls with a guaranteed way from start_cell to goal_cell; one row of cells is a corridor, and
     loops opens more than one way through.
   - `city_block`: streets, curbed sidewalks, buildings of varied heights, lamps, trees and crossings; the start is
     an intersection and goal_intersection the destination.
   - `warehouse`: shelving rows with aisles, crates in the aisles, a loading door where the start is; goal_aisle
     picks the aisle to reach.
   - `forest`: trees and rocks around a clear winding path; park turns it into grass with benches and lamps.
   - `obstacle_course`: walled lanes with barriers on alternating sides and humps to climb.
   - `terrain_steps`: steps up to a platform and back down, or separate platforms with a gap, for legged bodies.
2. **Fit it to the body.** Set clearance to a little more than half the body's width so the checked way is one
   the body can really pass, and passages it must turn in (cell size, door width, aisle width) longer than the
   body; a car about 4 m long needs maze cells of 6 m and doors of 3.5 m.
   Keep the defaults for everything the person did not ask about; change seed for another arrangement.
3. **Lay it out with the task.** Call `layout` with the recipe and its parameters; its start lands under the body,
   so the body does not move. When the place has a destination, put the task in also in the same call: the
   navigation task with `progress_to_goal` and `reach_goal`. Humps and steps are touched when climbed, so a course
   meant to be climbed does without `collision_penalty`.
4. **Read the result.** A layout the recipe cannot make (a bay that does not exist, a way that cannot stay open)
   says why: change that parameter and call again. A passing result gives the groups, the start, the goal, the
   length of the open way and notes such as the free bays; use only those numbers when you explain it.
5. **Look at it.** `look` with view `top` on the try for the plan, then `three_quarter` from the start: the goal
   must be visible and reachable, nothing must stand on the start.
6. **Propose.** `propose` with the try_id, naming the recipe, what you chose and why. Say how to customize it:
   each area is a group the person can move, hide or delete as one; colors, sizes and pieces change per object.
7. **Customize after.** Once applied, edit its objects with `try` like any others: a different color for every
   parked car, a bigger goal, one more doorway. For a different arrangement, lay the recipe out again with new
   parameters after deleting the old root group.

Done when a proposal holds one layout that passed every check, with the spawn at its start, the goal where the
person wanted it, the way between them open for the body's width, and a top view that shows it.
