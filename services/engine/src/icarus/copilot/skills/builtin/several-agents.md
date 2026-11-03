---
name: several-agents
title: Several agents with different bodies racing side by side
when: The person wants more than one agent, a race between bodies, lanes with a different robot in each, to compare which body learns faster, or to add, remove or rename an agent.
tools: [library, layout, add_agent, try, look, propose, apply, train, read_run, coach]
version: 1
---
Each agent is a body with its own brain, task and lane. It trains with only its own body: the other agents are absent
from its physics, so they never touch and each one learns cleanly. Training starts one run per agent at the same time
(a group), sharing the computer's copies and threads; stopping one stops the group. Play runs every agent with its
own best brain, and Results compares them side by side.

1. **Lay the lanes.** The `obstacle_course` layout with 2 to 4 lanes and a lane width that fits the widest body
   (4 m for a car), with its own spawn and goal off. Its summary lists the lanes: the world start and goal of each.
   Humps make low hurdles across every lane. A new project from the `lanes_race` template already has four.
2. **Add an agent per lane.** `add_agent` with a library body (a template whose library entry has agent_body, such
   as `walker_robot`, `humanoid`, `parking_car` or `motorcycle`), a name and its lane's start and goal. The first
   agent added also makes the project's own body an agent. Never put two agents in one lane.
3. **Tune each agent alone.** The set_reward_term, remove_reward_term, set_task_family and set_brain operations
   take an agent id to change only that agent; without one they change the project's own task and brain, which
   agents without their own use. The set_agent operation renames an agent or moves it to another lane's spawn and
   goal; remove_agent takes it out with its body and its lane objects.
4. **Give each lane a scoreboard.** A `display` per value (time, try, goal_distance, successes) on panels listed in
   the agent's objects with set_agent shows only that agent's values, measured by the engine.
5. **Train and coach each agent.** `train` starts the group. Diagnose each agent's run on its own with `coach` and
   `read_run`: every run has its own frozen one-agent project, curves and checkpoints. Say which agent learns
   faster only with numbers their runs hold.

Done when every agent the person asked for stands in its own lane in a passing try, proposed or applied, and the
person knows the agents train together but never touch.
