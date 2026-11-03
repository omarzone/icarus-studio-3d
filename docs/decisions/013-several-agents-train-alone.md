# 013 · Several agents train alone, side by side

**Context.** People want races and comparisons between different bodies in one scene, each learning with its own brain. True multi-agent learning (shared physics, per-agent rewards in one world, self-play) needs a new environment and much more compute.

**Decision.** A project may list `agents` (body, own task and brain, spawn, goal and lane objects); without them it is the classic one-agent project. `projects/agents.py` turns each agent into the one-agent project it trains with: the whole world minus the other agents' bodies and lanes. Training starts one ordinary run per agent as a group, splitting copies and threads; each run freezes its own one-agent project. The views join the runs' recorded motion into one scene; Play steps one world per agent. Agents never interact physically.

**Consequences.** The compiler, environment, worker, coach and Play keep working on one agent, and stored projects load unchanged. Interaction between agents (phase 2) needs its own environment and ADR.
