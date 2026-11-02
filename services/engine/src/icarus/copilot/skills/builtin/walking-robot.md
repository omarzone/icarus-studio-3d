---
name: walking-robot
title: Design a robot that learns to walk
when: The person wants legs, a walker, a humanoid, a quadruped or any body that moves by stepping.
tools: [library, inspect_object, try, look, propose, train]
version: 1
---
Locomotion pays the body for moving forward along +x without falling. A legged body has fallen once its root
drops below 40% of its start height or turns upside down; the episode then ends.

1. **Start from a template.** Call `library` with `walker_robot` (a 10 kg torso 0.3 × 0.3 × 0.4 m on two legs,
   six motors) or `humanoid` (twelve motors, balance and foot sensors). Try its operations first and adapt sizes,
   masses and colors in later tries; a body built from nothing fails the design checks far more often.
2. **Legs.** Each leg is a chain thigh → shin → foot, every joint a `joint` hinge on axis (0, 1, 0) with a
   position `motor`. The walker uses hips at ±60°, knees from 0 to 120° and ankles at ±45°, with
   `motor.max_force` = 150 at hip and knee and `motor.max_force` = 60 at the ankle, thighs 5 kg, shins 3 kg and
   feet 1 kg. Put each `joint.anchor` at the edge where the part meets its parent. When you make the body heavier,
   raise the motor force in proportion, or the design check "Motors move their joints" fails.
3. **Stance.** Feet must rest on the ground at the start: the root's height equals the distance from its centre
   to the bottom of the feet. Feet wider than the legs (the walker's are 0.22 × 0.1 m) and legs spread apart keep
   it from tipping before it learns anything.
4. **Senses.** `balance` on the root (`balance.includes` accel+gyro: tilt and turn rate) and `touch` on each foot
   (`touch.radius` = 0.06) so the brain knows which foot is down. Joint angles and speeds are observed already.
5. **Rewards.** `forward_progress` = 1, `stay_upright` = 0.1–0.5, `energy_cost` = -0.001, `fall_penalty` = -10.
   Never add alignment or goal terms to locomotion. `stay_upright` is paid every step: at 0.5 standing still for
   600 steps earns 300, far more than a few metres forward, so start low and raise `forward_progress` toward 2–5 if
   the first run stands in place. Sent to a goal instead (navigation), a legged body keeps `stay_upright`,
   `fall_penalty` and `energy_cost` and drops `forward_progress`.
6. **Check.** `try`, then `look` with view `left` at the feet: they touch the ground, nothing floats or sinks,
   and the legs do not overlap the torso. Read the try's checks: "Settles at rest" means it stands still for 1.5 s,
   "Motors move their joints" means every motor moves its joint. Fix before you `propose`.
7. **Train.** Locomotion's recommended budget is 2M steps. If at 250k steps every evaluation still falls in
   the first seconds, stop and diagnose (diagnose-a-brain) instead of training longer. Use `train` only when the
   person asks.

Done when a passing try with balance, foot touch and the four locomotion rewards is proposed, a side view shows
both feet on the ground, and the person knows walking needs about 2M steps.
