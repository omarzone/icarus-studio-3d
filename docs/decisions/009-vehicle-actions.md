# 009 · Vehicles act through throttle, brake and steering

**Context.** A wheeled body drove through one action per motor: a car's brain had to keep its two steering motors in agreement and stop by heavy drag on the driven wheels. Real vehicles, and the brains that learn to drive them, use throttle, brake and steering.

**Decision.** A `vehicle` component on a body's root makes the brain's actions throttle (−1..1, or 0..1 without reverse), brake (0..1) and steering (−1..1) in place of the motors on the joints it uses. The compiler adds real MuJoCo actuators: a torque motor on each drive wheel, a damper on each wheel scaled by the brake and a position servo on each steering joint. The simulation maps steering with Ackermann geometry (every steered wheel aims at one turn center on the fixed axle's line) or as differential drive, and stops pushing past the speed limit. Lights follow the commands and the measured motion, and are exported per frame with the goal rules' state.

**Consequences.** Any wheeled body, from a motorcycle to a skid-steer robot, uses one layout rule and three actions; balance on two wheels stays a learned skill. Observation and action sizes change only for bodies with the component, so stored projects without it load, play and train exactly as before. A brain trained on raw motors cannot warm start a vehicle of the same body.
