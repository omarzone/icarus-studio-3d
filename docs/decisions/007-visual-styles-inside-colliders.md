# 007 · Visual styles inside colliders

**Context.** Worlds were drawn as the bare MuJoCo primitives, so a car looked like a box on four discs. Meshes from files would make worlds look real but add assets, loaders and a second shape that physics never sees.

**Decision.** The material component has a `style` (plain, car_body, wheel, shell, joint, crate, wall, curb, post, cone, lamp_post, tree, ball, marking) exported as `SceneGeom.style`, with the part's surface as `SceneGeom.surface`. The desktop draws a styled geom procedurally in `scene/visual-styles/`, every piece inside the geom's extents, and draws the plain primitive when the style is missing or does not fit the shape. The physics never reads either field.

**Consequences.** The drawing never shows more than the collider, so a car's cabin sits inside its chassis box. Scenes exported before styles look as they did. Imported meshes, if they come, need their own decision.

**Amendment: look-only decoration at its own size.** A tree drawn inside its collider was a column, so a canopy meant a collider bodies hit far from the trunk. Look-only parts are now drawn at their designed size: objects without a collider (paint, floor patches) and the `ornament` component, a shape riding on a part past its collider (a tree's crown over a thin trunk, a lamp's arm, a gate's boom, a sign's plate), exported as `SceneGeom.ornaments`. MuJoCo never compiles an ornament, so contacts and rays pass through it, and `ornament` is a look component that `training_content` ignores. A styled geom with a collider still draws inside it.
