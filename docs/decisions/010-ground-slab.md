# 010 · The ground is a slab with edges

**Context.** The ground was a MuJoCo plane, which never ends, drawn as a finite square of its nominal size. Past the drawn edge a body kept driving on nothing, and nothing could fall off the world.

**Decision.** A `ground` component makes an object a static box slab whose top is the object's height and whose size (width, depth, thickness) is a property; the scene marks it `SceneGeom.ground` so the desktop frames and picks it as the floor. New templates start on a 100 by 100 m slab, layouts grow it to hold what they lay out, and a try ends as a fall when the agent drops 1 m below the lowest ground's top. A plane stored by an older project stays a plane in the physics and is drawn out to the horizon, so drawing and physics agree without changing a stored project's training.

**Consequences.** Bodies fall off edges in Play, training and evaluation alike. Old projects keep their physics; adding the component to their plane turns it into a slab. Contacts on a slab are box contacts rather than plane contacts.
