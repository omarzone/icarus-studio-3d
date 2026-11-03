# 012 · Parts, wedges and the material palette

**Context.** Building in the World editor only placed ready-made pieces. Making a ramp or a roof from scratch needs sloped shapes MuJoCo has no primitive for, and picking "ice" or "wood" should change both the look and the grip.

**Decision.** `mesh.shape` gains `wedge` and `corner_wedge`, which the compiler builds per part as convex MuJoCo meshes from the part's full size (`design/wedges.py`); the scene exports them by shape, size and the body's pose, since MuJoCo re-centers mesh geoms, and the desktop draws the same corners. The material gets a `preset` from a palette of twenty; setting it is one `set_property` that `projects/` expands onto the existing physics properties (material surface, collider and surface friction), and the scene exports it so the desktop draws its procedural pattern. Ice also gets contact priority so it stays slippery under grippy tires. `custom`, the default, keeps every older project as it was.

**Consequences.** Physics still reads only surface and friction; the preset adds no second source of grip. Changing friction by hand after picking a preset keeps the label but not its grip, as with any hand edit.
