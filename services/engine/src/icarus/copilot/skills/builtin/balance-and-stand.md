---
name: balance-and-stand
title: Teach a body to keep its balance or stand up
when: A body must stay upright without going anywhere, stand on its legs, balance on two wheels, or get up from lying down.
tools: [library, inspect_object, try, look, propose, train, read_run]
version: 1
---
Balancing and standing up are locomotion tasks with posture as the goal instead of distance. Locomotion ends an
episode when the root drops below 40% of its start height, and it never counts a success: judge a run by how many
evaluation episodes last the full 30 s, the reward terms and the gait facts (root height), not by a success rate.
Here the posture terms paid every step are the task itself, so they may outweigh everything else.

1. **Choose the posture.** Standing still: build the body standing on its feet, so its start height is its
   standing height. Getting up: build it lying down (on its back, side or belly) so the root starts low; a body
   that starts low rarely drops below 40% of that, so its episodes run the full 30 s. Balancing on wheels: a tall
   root on two wheels driven by torque motors, with the weight above the axle.
2. **Body and motors.** Start legs from `walker_robot` or `humanoid` and adapt them (walking-robot has their
   joints). Feet wider than the legs and legs apart make standing easier; to get up, the motors must lift the
   whole weight, so raise `motor.max_force` with the mass until "Motors move their joints" passes, and check the
   limbs can reach the ground in front of the body (move-a-joint).
3. **Senses.** `balance` on the root (`balance.includes` accel+gyro tells which way is down) is essential: the
   brain cannot balance what it does not feel. Add `touch` on each foot (`touch.radius` = 0.05–0.06). Joint angles
   and speeds are observed already.
4. **Rewards to stand.** `stay_upright` = 0.5–1 for the root's tilt, `body_height` = 0.2–1 to hold the root near
   its standing height (leave its height setting unset when the body is built standing), `fall_penalty` = -10,
   `energy_cost` = -0.001 and `smooth_actions` = -0.1–-0.02 against jitter. Leave out `forward_progress`, or the
   body learns to lean and step away. Both posture terms read the root, so the part that must stay up is the root.
5. **Rewards to get up.** `height_gain` = 1 pays each step for how high the root is above where it started, up to
   1 m; add `body_height` with its height setting at the standing height so it holds the posture once up, and
   `stay_upright` = 0.1–0.3 so it ends upright rather than tall on its side. Keep `energy_cost` = -0.001.
6. **What it cannot do.** No term pays for holding one chosen pose or copying a hand-made motion, and nothing can
   be held by hands. When the person asks for that, say so plainly and offer the closest real option: standing or
   getting up with the terms above, with the motion learned from the reward.
7. **Check.** `try`, then `look` with view `left` and view `front`: feet or wheels on the ground, nothing floating,
   "Settles at rest" passing for a standing body. Then `propose`. Locomotion's recommended budget is 2M steps;
   use `train` only when the person asks and `read_run` with `evaluations` and `reward_terms` before judging it.

Done when a passing try with a balance sensor on the root and posture rewards that match the wanted posture is
proposed, the person knows the run is judged by episodes that stay up rather than a success rate, and anything the
library cannot do was said plainly with the closest option.
