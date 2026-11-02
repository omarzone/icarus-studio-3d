---
name: move-a-joint
title: Set up joints and motors so a part moves the way it should
when: A part must bend, turn, slide or spin a certain way, or a joint or motor is wrong: too weak, too wild, stuck, at the wrong angle, or a new arm, leg, wheel or flap.
tools: [library, inspect_object, try, look, propose]
version: 1
---
A part moves only through its `joint` (how it may move relative to its parent) and a `motor` (what the brain
drives). The brain decides when and how much; the joint and motor decide what is possible. `inspect_object` the
part first, and read `library` with `joint` and `motor` for every range.

1. **Joint kind and axis.** hinge turns around `joint.axis` (limits in degrees), slide moves along it (limits in
   metres), ball turns freely on every axis and cannot take a motor, fixed does not move. The axis is in the
   part's own frame, after its rotation: (0, 1, 0) swings an upright leg forward and back, (0, 0, 1) turns an
   upright part left and right (the car's steering), and a wheel spins around its cylinder's own axis, (0, 0, 1),
   with the cylinder turned on its side as the car's wheels are.
2. **Where it bends.** `joint.anchor` is measured from the part's centre: put it at the edge where the part meets
   its parent (the top of a shin for a knee), or the part swings around its middle. `joint.connects_to` names the
   part it hinges on; empty means its parent.
3. **Range.** Set `joint.limits` to the motion wanted, between -180 and 180. The walker uses hips at ±60°, knees
   from 0 to 120° and ankles at ±45°; the car steers at ±35°. A hinge from -180 to 180 has no stop: use it for
   wheels and anything that spins. Too wide a range lets a limb fold through poses it should never reach.
4. **Motor kind.** A position motor drives its joint toward an angle the brain picks inside the limits, pulling
   with up to `motor.max_force`: legs, arms, steering, flaps. A torque motor pushes with a share of
   `motor.max_force` times `motor.gear` that the brain picks between -1 and 1: wheels, rotors, free swings. Point
   `motor.joint` at another part only when the motor sits elsewhere; empty drives this part's own joint.
5. **Strength and drag.** A motor must at least hold its load: mass times 9.81 times the lever arm from the
   joint, for every part beyond it. The walker's thighs (5 kg) and shins (3 kg) use `motor.max_force` = 150 at
   hip and knee and `motor.max_force` = 60 at the ankle; scale with the mass. Too weak and the check "Motors move
   their joints" fails; too strong and the body throws itself around. `joint.damping` slows the joint (the car's
   wheels use `joint.damping` = 80 to cap speed and brake). Leave `motor.gear` at 1 and change the force instead.
6. **What the library cannot do.** No reward term pays for reaching one joint angle or replaying a hand-made
   motion. When the person asks for that, say so plainly and offer the closest real option: a task whose reward
   needs that motion (`forward_progress` for steps, `height_gain` for a jump), with `joint_limits` = -0.5–-0.05 to keep
   joints off their stops and `smooth_actions` = -0.2–-0.02 for jerky motion. Grasping is not possible.
7. **Check.** `try`, then read "Motors move their joints" (every motor moves its joint) and "Settles at rest".
   `look` with view `left` or view `front` at the part. Then `propose`, saying that adding or removing a motor
   means training from zero, while changing ranges, forces or damping lets a trained brain continue.

Done when the proposed try passes "Motors move their joints", each changed joint has a kind, axis, anchor and
range that produce the wanted motion, each motor's kind and force fit its load, and anything the library cannot
do was said plainly with the closest option.
