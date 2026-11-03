# 011 · Floor plates are measured floor, displays show engine values

**Context.** Worlds in the style of walking challenges need plates to step on, counters on the walls and characters with faces, without letting the renderer decide anything or adding obstacles a brain must learn around.

**Decision.** A `plate` compiles to a thin static geom treated as a floor patch (never an obstacle or a collision). The simulation measures it every step: pressed when what it watches pushes on it with at least its press force (MuJoCo contact forces), occupied when that thing's center is over it, and reached per try, in order when the goal asks. The states and each `display`'s value travel per frame in `SceneSignals` through Play, rollouts and the live view; the training loop fills a display of the brain's training steps, which the copies cannot know. Displays and `eyes` are look-only; eyes blink as a pure animation and look along the engine's poses.

**Consequences.** Plate goals and rewards are library terms like any other, and stored projects without plates train and play unchanged. The desktop formats values but shows "--" when the engine sends none. A plate on a dynamic object is not compiled.
