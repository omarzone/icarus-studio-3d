---
name: walking-robot
title: Design any legged body that learns to walk
when: The person wants legs, a walker, a humanoid, a quadruped, an insect or any body that moves forward by stepping.
tools: [library, inspect_object, try, look, propose, train]
version: 3
---
Locomotion pays the body for moving forward along +x without falling. A legged body has fallen once its root
drops below 40% of its start height; the episode then ends. The two templates are examples: a quadruped or a
six-legged body uses the same leg chain once per leg, spread around the torso.

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
   Never add goal terms (`heading_alignment`, `progress_to_goal`) to locomotion. `stay_upright` is paid every step: at 0.5 standing still for
   600 steps earns 300, far more than a few metres forward, so start low and raise `forward_progress` toward 2–5 if
   the first run stands in place. Sent to a goal instead (navigation), a legged body keeps `stay_upright`,
   `fall_penalty` and `energy_cost` and drops `forward_progress`.
6. **Check.** `try`, then `look` with view `left` at the feet: they touch the ground, nothing floats or sinks,
   and the legs do not overlap the torso. Read the try's checks: "Settles at rest" means it stands still for 1.5 s,
   "Motors move their joints" means every motor moves its joint. Fix before you `propose`.
7. **Train.** Locomotion's recommended budget is 2M steps. If at 250k steps every evaluation still falls in
   the first seconds, stop and diagnose (diagnose-a-brain) instead of training longer. Use `train` only when the
   person asks.
8. **Fix the gait.** A body that moves but crawls, hops, drags a leg or twitches needs a gait term, not more
   steps. Read the run brief's gait facts: each evaluation episode measures root height and its spread, tilt,
   turn from +x, forward speed, sideways drift, each foot's ground contact share and lift-offs, the share of steps
   with a foot (or every foot) in the air, joints at their limits and how much the actions change per step. Then
   add one term, sized to the numbers:
   - A foot on the ground 95% of the time or more while the body moves (dragged), or feet that barely lift off:
     `feet_air_time` = 0.5–2. It pays each landing for its air time minus 0.1 s (at most 0.5 s), only while the
     body moves, on the feet with `touch` (or the low tips of its jointed legs when no foot has one).
   - The root held below 70% of its start height (crawling on the belly or knees): `body_height` = 0.1–0.5. Leave
     its height setting unset to aim for the standing height. It is paid every step, like `stay_upright`.
   - Actions changing by 0.3 or more per step (twitching, jitter): `smooth_actions` = -0.2–-0.02.
   - Joints pressed against their limits 30% of the time or more (locked legs): `joint_limits` = -0.5–-0.05.
     Straight knees sit at their stop, so this term also pushes the body to walk with bent knees.
   - Turning away from +x or drifting sideways more than half as far as it goes forward:
     `heading_and_drift` = -0.5–-0.05.
   - Every foot in the air at once 30% of the steps or more (hopping): `smooth_actions` and `body_height`, not
     more `feet_air_time`, which pays a hop as much as a step.
   Change one term per revision so the next run shows what it did; the brain can continue from the best one,
   since a reward change keeps the sensors and motors.

Done when a passing try with balance, foot touch and the four locomotion rewards is proposed, a side view shows
both feet on the ground, and the person knows walking needs about 2M steps; for a run that moves badly, when one
gait term answers the gait fact it quotes.
