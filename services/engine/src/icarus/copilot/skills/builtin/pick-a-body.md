---
name: pick-a-body
title: Pick a ready-made body from the vault and make it the agent
when: The person wants a body without building it, asks for a dog, spider, snake, robot, rover or any creature, wants to swap the agent's body, or a design built from nothing keeps failing its checks.
tools: [library, try, look, propose]
version: 1
---
The body vault holds bodies that already pass every design check: they stand still with their motors at zero,
every motor moves its joint, and each has balance or foot touch where it helps, eyes and a color. Starting from
one is faster and safer than building legs part by part.

1. **List them.** Call `library` with the query "vault bodies". Match the person's words: two legs → `biped`,
   a person → `humanoid_body`, four legs → `dog`, eight legs → `spider`, six legs → `hexapod`, no legs →
   `snake`, wheels → `rover`, one leg → `hopper`, something cute or odd → `tripod` or `ball_crawler`.
2. **Read one.** Call `library` with its id in kind. Its operations for this project remove the bodies the
   project has, stand the vault body on the spawn point and, when the task family differs, set the body's family
   and its suggested reward terms. Tell the person the current body goes away; it comes back with undo.
3. **Try it as it is.** `try` those operations unchanged first, then `look` at it. Never change sizes, masses or
   motor forces in the same try: the vault's values are what let it stand.
4. **Color it.** To recolor, change `material.color` on the parts that carry the body's color in a later try;
   joints and feet keep their grey and black.
5. **Keep its senses and rewards.** Legged bodies come with `forward_progress`, `stay_upright`, `energy_cost` and
   `fall_penalty`; many-legged ones add `feet_air_time` and `heading_and_drift`. Change weights only when a run
   shows why (walking-robot, step 8).
6. **Propose.** `propose` with a sentence on what the body is and how it will move. Start training only when the
   person asks.

Done when a passing try with one vault body as the only body is proposed and the person knows which body it is,
what it senses and that its old body comes back with undo.
