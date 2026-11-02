---
name: reward-design
title: Choose reward terms and balance their weights
when: The person asks about rewards, weights, what the body is paid for, or a brain games its reward.
tools: [library, inspect_object, read_run, try, propose]
version: 1
---
The reward is a weighted sum of library terms, computed at every one of the 600 control steps of a 30 s episode.
A term paid once (a bonus or a penalty) and a term paid every step live on different scales: a per-step term at
weight w can add up to 600 × w per episode.

1. **Pick the family's core.** Navigation needs `progress_to_goal` and `reach_goal`; locomotion needs
   `forward_progress`. Without them there is nothing to learn toward. Use only terms of the task's family; posture
   and effort (`stay_upright`, `fall_penalty`, `energy_cost`) also fit navigation for legged bodies.
2. **Size each term per episode.** Estimate what a good episode earns from each term: `reach_goal` = 10 once;
   `progress_to_goal` = 1 per metre (12 for a 12 m approach); `time_penalty` = -0.01 is -6 over 600 steps;
   `collision_penalty` = -5 per new contact; `fall_penalty` = -10 once and the episode ends; `energy_cost` = -0.001
   times the summed squared motor effort per step.
3. **Keep per-step terms small.** `heading_alignment` (-1 to 1 per step) and `stay_upright` (1 per step when
   upright) pay for doing nothing useful. At `heading_alignment` = 0.2 a car parked facing the goal earns 120 per
   episode against a bonus of 10, so it learns to face the goal and stop. Keep the sum of per-step terms below the
   success terms: `heading_alignment` = 0.01–0.05 and `stay_upright` = 0.1–0.3, or leave them out.
4. **Read the run, not the guess.** `read_run` with `reward_terms` shows each term's share per episode. A term
   larger than the success terms is the one the brain is optimising.
5. **Signs of reward hacking.** Return rises while success stays near zero; episodes last the full 30 s with the
   body in place (paid per step for posture or facing); the car circles near the goal (progress paid back and
   forth while the bonus needs a stop under 0.2 m/s); a walker shuffles or leans to collect `forward_progress`
   then falls. The fix is a weight change in a new revision, never a new term invented outside the library.
6. **Change one thing.** `try` the new weights (every weight inside its library range), then `propose` with what
   you expect to change in the run. A reward change creates a new revision; old runs stay comparable only with
   each other.

Done when every term is inside its range, per-step terms add up to less than the success terms over 600 steps,
and the proposal says which run evidence the change answers.
