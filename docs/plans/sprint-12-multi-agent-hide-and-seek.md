# Sprint 12 · Team games: multi-agent hide and seek

**Goal:** several bodies share one world, split into teams, and learn against each other. The first team game is hide and seek: hiders learn to stay out of the seekers' sight, seekers learn to find them, and when the world has boxes they can grab and lock, the brains invent strategies nobody programmed. The Training Timeline shows that arms race from real checkpoints, the coach names each strategy the moment the evaluation episodes show it, and the whole project is reachable by talking ("make a hide and seek game with two robots and some boxes").

**Spec:** `VISION.md` (Learning is something you can watch; The copilot coaches, physics decides, the algorithm learns); `docs/architecture.md` › Library, Simulation, Training and the Training Timeline, Coach and autopilot; [ADR 001](../decisions/001-cpu-training-budget.md) (CPU budget); [`sprint-07-coach.md`](./sprint-07-coach.md) (watch rules, warm start, curriculum); [`copilot-harness-extensions.md`](./copilot-harness-extensions.md) (skills, events, background tasks); [`showcase-projects.md`](./showcase-projects.md) (where this project ships).

**Place in the roadmap:** this sprint is inserted after Sprint 11. Build and hardware, Community and Release move to 13, 14 and 15; `roadmap.md` is renumbered when this plan is accepted. It depends on Sprint 7's `SCR-TIMELAPSE` on real runs (still open) and on nothing from Sprints 8–11.

## What the reference work did

OpenAI's *Emergent Tool Use from Multi-Agent Autocurricula* (Baker et al., 2019) is the reference. The facts below come from the paper and its released environments.

| Aspect | Reference setup |
|---|---|
| World | MuJoCo, 18 m square arena with random walls and rooms, 3–9 movable boxes (some elongated), 2 movable ramps; a simpler *quadrant* variant has one room with 1–2 doors, 2 boxes and 1 ramp |
| Agents | 1–3 hiders and 1–3 seekers, spheres that move by force in x and y and torque around z |
| Round | 240 steps; the first 40% is a **preparation phase** in which seekers cannot move and nobody is rewarded |
| Observations | Position, velocity and size of agents and objects; 30 lidar-like range sensors around the agent; an entity is masked out unless it is in line of sight **and** inside a 135° cone in front; own team and remaining preparation time |
| Actions | Discretized force and torque, plus two binary actions: **grab** binds the agent to the closest object in front within a small radius (a MuJoCo weld constraint in the released code), **lock** freezes an object in place (the released code limits the object's joints to their current position); only the locking team can unlock |
| Reward | Per step, per team: hiders +1 if every hider is hidden, −1 if any is seen; seekers the opposite; −10 for leaving the arena; zero during preparation |
| Policy | One set of policy weights shared by every agent, each acting on its own observation; entity embeddings with self-attention, a 256-unit LSTM, about 1.6M parameters |
| Value | A centralized, unmasked value function (sees everything); with a masked value function training never passed stage 3 |
| Training | PPO with GAE (γ 0.998, λ 0.95), mini-batches of 64k chunks of 10 steps; batches of 16k and 8k never converged |
| Scale | Stage 4 after 132.3M episodes (31.7B frames) and 34 hours on a large distributed cluster |
| Phases | 1 running and chasing · 2 fort building (~25M episodes) · 3 ramp use (~100M) · 4 ramp defense (~110M) · 5 box surfing and 6 surf defense (~380M); the quadrant variant produced stages 1–4 |
| What mattered | Randomized walls and box shapes: without walls only 4 stages appeared, with fixed boxes and no walls only 2 |

Scaled-down versions exist but none is a CPU-sized MuJoCo recipe:

- A 2023 replication in a game engine (Kamal, Niazi and Afzal) used 1–2 hiders against 1–4 seekers with ray sensors, PPO for hiders and MA-POCA for seekers, self-play and a four-level curriculum, with a batch of 3,072. It reports running and chasing at about 1.6M steps and shelter building at about 2.3M steps. Its "steps" are agent decision steps, not the reference's episodes, so the comparison it draws is loose; it is still evidence that a small, curriculum-driven arena brings fort building into the millions of steps.
- Pursuit-evasion in the Multi-Agent Particle Environments (*Simple Tag*: three slower adversaries rewarded +10 per hit on a faster runner that loses 10) trains in minutes on a CPU, but it is 2D point masses with no tools.
- The standard way to train many agents with one PPO policy is **parameter sharing**: every agent instance becomes one slot of a vectorized environment, with an agent indicator in its observation. PettingZoo's Stable-Baselines3 tutorials do it with SuperSuit wrappers; MAPPO (Yu et al.) shows shared PPO with a centralized value function is strong across multi-agent benchmarks and that parameter sharing clearly beats separate networks.
- Game-engine agent toolkits train asymmetric games with self-play against **snapshots of past opponents** to keep learning stable, and recommend PPO over off-policy methods for it.

What this means for Icarus: the reference needed billions of frames for the full ladder, which is out of reach on a desktop CPU (about 7M samples per hour, ADR 001). The first version takes the quadrant idea and shrinks it until the first tool-use strategy fits in a night of training, measures it, and reports every stage it does not reach as not reached.

## Decisions

1. **One shared policy with a role input.** Every agent, hider or seeker, is driven by the same network; its observation carries a role one-hot and the preparation time left. This is what the reference did, it doubles the data each update sees, and it keeps one brain per project, so the Brain workspace, warm start, Play and export stay unchanged. Separate policies are added only when bodies with different senses or motors must play together; until then a design check requires every agent body in a team game to have the same sensor and motor layout.
2. **Stable-Baselines3 stays the trainer; no new dependency.** A `TeamVecEnv` (training zone, about 200 lines) flattens agent slots into an SB3 vectorized environment the way SuperSuit does: `num_envs = copies × learning agents per copy`, all slots of a copy reset together. PettingZoo and SuperSuit would add a second environment API and wrappers for something this small and stable; RLlib or a MAPPO codebase would replace a trainer that already works. `sb3-contrib` (same maintainers) is the only candidate later, for a recurrent policy, and only if the measurement shows memory is the bottleneck.
3. **Centralized critic, decentralized actor.** The observation vector is `[what the agent senses | what only the critic sees]`. A small `TeamPolicy` (an SB3 `ActorCriticPolicy` with a feature extractor that slices the vector) gives the actor only the first part and the value network both. The reference's ablation is the reason: a masked value function stalled at stage 3.
4. **Self-play with a small opponent pool.** By default most copies are pure self-play (both teams act with the learning brain). A fixed set of copies (default 3 of 16) plays one team with a frozen snapshot of the same run, drawn from the last 5 checkpoints at every round; those agents are not learning slots, and their actions come from the snapshot in the main process, batched, so the copies never load PyTorch. Snapshots are this run's own checkpoints, so nothing foreign is loaded.
5. **Grab and lock are MuJoCo constraints, not scripted motion.** The compiler adds one disabled weld equality per (grabber, grabbable object) pair; grab enables the weld to the closest object in front within reach (`data.eq_active`). Lock fixes a lockable object to the world with a second disabled weld and records the locking team. MuJoCo still solves every contact and force; the environment only switches constraints on and off, as the released reference code does.
6. **Line of sight from MuJoCo rays.** An agent sees another body when it is within the vision cone's range and angle **and** `mj_ray` from the eye to the target's center (and to its top, so a half-hidden hider counts as seen) hits the target before anything else. The same function feeds observations, rewards, Play's overlay and the strategy detectors, so "seen" means one thing everywhere.
7. **Strategies are detected in code from evaluation episodes, never inferred by the model.** Each strategy has a written definition and a rule over measured episode data; the coach explains and shows frames but cannot declare a strategy the rule did not find.
8. **Rounds keep the existing control rate.** 20 Hz, 12 s rounds (240 steps, as in the reference), 40% preparation. The episode length becomes a task rule instead of the fixed 30 s constant.

## What Icarus adds

### Library (design zone)

| Addition | Kind | Properties |
|---|---|---|
| **Vision cone** | sensor component on a body | range (m), angle (°, default 135), eye height |
| **Grabber** | component on a body | reach (m), angle (°), strength (weld softness, expert) |
| **Grabbable** | component on a world object | none (marks it as a target for grabbers) |
| **Lockable** | component on a world object | none; adds the lock weld and a glow when locked |
| **Team spawn** | new properties on `spawn_point` | `body` (reference to the body that starts here); random heading already exists |
| **Ray spread** | new property on `distance_ray` | spread (°, 60–360; today the fan is fixed at ±30°), so 16–30 rays can cover the full circle |
| **Zone marks** | new property on `zone` | marks: none, room, doorway, arena; detectors and the arena bound read them |
| Pieces | `long_box` (grabbable, lockable, 1.6 × 0.4 × 0.8 m, long enough to close a door), `movable_ramp` (dynamic, grabbable, lockable), `room_walls` (a 3 × 3 m room with one door) |
| Body template | `runner` | a cylinder that moves by force on two slide joints (x, y) and turns by torque on a hinge (z), with balance, vision cone, grabber and a 360° ray ring; built only from existing parts, joints and motors |
| Reward terms (`team_game`) | `team_hidden` (±1 per step by role, zero during preparation, the reference reward), `stay_in_arena` (−10 once on leaving the arena zone) |
| Project template | `hide_and_seek` | 8 × 8 m arena, one room with a door whose position varies per copy, 1 hider, 1 seeker, 2 long boxes, no ramp |
| Brain template | team game | 2 × 256 tanh actor, 2 × 256 critic with the privileged input, PPO settings from the measurement (below) |
| Skill | `team-games.md` | how to build, balance and train a team game, what each strategy needs, what to change when one team always wins |

### Simulation (sim zone)

- **Many agents in one world.** `LiveWorld` gains `agents: list[AgentInfo]` (body id, root, geoms, its sensors and actuator slice, team, role); the single-agent fields keep reading `agents[0]`, so navigation and locomotion are untouched. `build_world` stops assuming `project.bodies[0]`.
- **`TeamGameEnv`**: one copy of a team game. `reset` places every body on its spawn and applies per-copy variation; `step` takes one action row per agent, applies forces, grab and lock, steps MuJoCo, computes line of sight, per-agent observations and per-team rewards, and freezes seekers (zero force, no grab or lock) during preparation. It is not a Gymnasium single-agent env; it is wrapped by `TeamVecEnv` and has its own determinism and contract tests.
- **Observations per agent** (actor part): its rays over 360°, its velocity and turn rate, its position in the arena, heading as cos/sin, role one-hot, preparation time left, whether it holds something; then one fixed slot per other agent and per grabbable object, in a stable order: visible flag, position and velocity in the agent's frame, held, locked by my team, locked by the other team. Masked slots are zeros with the visible flag off. Seekers also get the last place a hider was seen and the seconds since, computed by the engine from line of sight, which replaces a recurrent brain in the first version.
- **Critic part:** every slot unmasked, plus who sees whom.
- **Actions per agent:** `Box(5)`: force x, force y, torque, grab (> 0 holds), lock (> 0.5 locks the object in reach, < −0.5 unlocks one my team locked). Box keeps the existing PPO path and warm start; the reference used discrete bins, which stays the fallback if the measurement shows thresholded channels learn poorly.
- **Play** runs the same env with the run's brain driving every agent: pick which agent's senses to show, draw vision cones and sight lines, freeze a team, move a box mid-round. New Play events: seen, lost sight, grabbed, locked, left the arena.

### Training (training zone)

- `TeamVecEnv` over `SubprocVecEnv` of `TeamGameEnv` copies; opponent-pool copies get their frozen actions from a `CheckpointPolicy` in the main process.
- `TeamPolicy` (critic slicing) and the PPO settings from the measurement. ADR 001's settings are the starting point; the reference's warning about small batches means the batch is measured, not copied (candidates: 4,096 and 8,192 samples).
- **Checkpoints:** the usual log-spaced schedule, plus one every 2.5M samples after 5M, so a night of training has enough points for a timeline.
- **Evaluation per checkpoint:** 20 deterministic rounds on fixed seeds of the current brain against itself, recording per round: share of seek steps every hider was hidden, first time a hider was seen, where every box ended the preparation phase, locks, who held what, distance between teams, time in the room. The first round is stored as a `Rollout` (already multi-body: it replays every moving geom) and frames are rendered as today.
- **Cross-play:** a background task evaluates the hiders of each of the last N checkpoints against the seekers of each, on the same seeds, and stores a matrix. It shows whether new seekers really beat old hiders (progress) or the run is cycling (forgetting).

### Emergent strategy detection (training zone, read by the coach)

`training/strategies.py` turns evaluation rounds into strategy sightings. A strategy is *appearing* at the first checkpoint where its rule holds in at least 20% of rounds and *learned* at 50%; each sighting stores the share, the rounds and their frames.

| Strategy | Team | Rule over evaluation rounds | Version |
|---|---|---|---|
| Chasing | seekers | seekers see a hider for at least 50% of the seek phase, and the mean seeker–hider distance is at least 30% below checkpoint 0 | 1 |
| Running away | hiders | hiders are hidden for at least 30% of the seek phase without any box having moved | 1 |
| Hiding in the room | hiders | the hider is inside the room zone when preparation ends | 1 |
| Blocking the door | hiders | at the end of preparation a box overlaps the doorway zone across its width, and hiders are then hidden for at least 60% of the seek phase | 1 |
| Locking the boxes | hiders | at least one box is locked by hiders when preparation ends | 1 |
| Breaking in | seekers | the door was blocked by an unlocked box at the end of preparation, and seekers push or pull it out of the doorway and then see a hider | 1 |
| Ramp use | seekers | a seeker's root rises above the room wall top while a ramp touches the wall | 2 |
| Ramp defense | hiders | the ramp is inside the room or locked by hiders when preparation ends | 2 |
| Box surfing | seekers | a seeker stands on a box (contact from above) while the box moves more than 0.5 m | 2 |

Thresholds are named constants with the definition text the coach quotes. Rules are tested on scripted MuJoCo episodes (bodies driven by fixed action sequences into each situation), never on hand-written state data.

### Coach and copilot (copilot zone)

- **Building by talking:** the Architect knows the `team_game` family and the `hide_and_seek` template; "hide and seek with two robots and some boxes" yields three ideas (open arena, room with a door, two rooms) with honest estimates from the measured budget.
- **Watch rules for team games** (`progress_watch.py`): one team wins more than 95% of seek steps for 3 evaluations (imbalance: propose more preparation time, a closer door, another box); no box moves in any round after 10M samples (no tool use yet: propose a curriculum revision with a box spawned next to the door and a wider preparation phase); cross-play shows newer seekers losing to older hiders (cycling: propose a larger opponent pool).
- **Diagnosis and narration:** at each checkpoint the coach reports new sightings with their frames ("Hiders started blocking the door at 18.4M steps: in 11 of 20 rounds a box ended in the doorway"). Every number comes from the run's sightings and metrics; the existing grounding check rejects anything else.
- **Curriculum is a revision:** easier variants (box next to the door, longer preparation, narrower door) are ordinary edit operations with a warm start, so the timeline shows exactly where the world was changed. If a helper reward is ever added (for example for a box near the door), the timeline labels strategies learned after it as *learned with a helper reward*, because it is no longer pure emergence.

### Contracts (its own task, landed first)

- `specs.py`: `TaskFamily` gains `team_game`; `TeamRole = Literal["hider", "seeker"]`; `TeamSpec {id, name, role, bodies: list[str], color}`; `GameRules {kind: Literal["hide_and_seek"], round_seconds (4–60, default 12), preparation_share (0–0.8, default 0.4)}`; `TaskSpec.teams: list[TeamSpec] = []`, `TaskSpec.game: GameRules | None = None`.
- `operations.py`: `SetTeam` (create or replace a team), `RemoveTeam`, `SetGameRules` (per ADR 005 granularity).
- `training.py`: `MetricPoint.team_scores: dict[str, float] | None` (per team, share of seek steps won); `StrategySighting {strategy, step, share, rounds, frames}`; `CheckpointInfo.strategies: list[str]`; `CrossPlay {steps, hidden_share: list[list[float]], rounds}`; `SelfPlaySettings {pool_share (0–0.5), pool_size}` on `RunConfig`; `RolloutFrame.sightings: list[tuple[str, str]]` (seeker body, hider body seen at that frame).
- `scene.py`: `SceneDescription.agents: list[SceneAgent {body, team, role, color}]` and the vision cones to draw.
- `play.py`: a command to focus an agent; `PlayFrame.sightings`; the new `PlayEvent` kinds.
- `coach.py`: failure groups for rounds (found in the first seconds, found late, hidden all round, left the arena).
- Library catalog: `StrategyInfo {id, label, team, definition}` served with the library so the UI and the coach read the same definitions.

### Desktop (desktop zone)

New screen IDs are added to `docs/design/screens.md` before building: `PNL-TEAMS` (World and Brain), `TAB-STRATEGIES` (Train and Results) and `TAB-CROSS-PLAY` (Results).

- **World:** teams panel (create a team, pick role and color, assign bodies), team colors on bodies, the arena, room and doorway zones drawn.
- **Play:** agent picker for the senses panel, vision cones and sight lines, *Freeze team* tool, the new events.
- **Train:** a win-share curve per team instead of success rate; strategy markers on the checkpoint strip; live copies show every agent.
- **Results:** strategy list with the step each appeared and was learned and their frames; the cross-play heatmap; same-seed comparison works unchanged.
- **Timelapse:** chapters named after detected strategies ("Chasing · 2.5M", "Blocking the door · 18.4M"), each opened on the round that shows it; nothing is labeled that the detectors did not find.

## First version, sized for a CPU

| | First version | Later, with measured evidence |
|---|---|---|
| Arena | 8 × 8 m, one 3 × 3 m room, one door whose position varies per copy | Random walls and rooms (the reference's key to more stages) |
| Teams | 1 hider vs 1 seeker | 2 vs 2 (twice the samples per world step) |
| Objects | 2 long boxes, grabbable and lockable | 3–4 boxes of varied shape, 1 movable ramp |
| Round | 12 s at 20 Hz, 40% preparation | same |
| Brain | shared MLP, centralized critic, engine-computed last-seen memory | recurrent brain if measured as needed |

**Step budget, honestly.** One round is 240 world steps × 2 learning agents = 480 samples. ADR 001 measured about 2,200 samples per second end to end with 16 copies on a 15-number observation; the walker measured 1,500–1,760. Team-game observations are about 70 numbers plus a few rays for line of sight per step, so the plan assumes **1,500–2,000 samples per second, 5.4–7.2M per hour, roughly 11–15k rounds per hour**. The reference needed millions of episodes for fort building; this version bets on a far smaller world.

| Stage | Estimate (samples) | Wall time on the 6-core CPU | Basis |
|---|---|---|---|
| Chasing and running away | 3–10M | 30 min – 1.5 h | Parking (single agent) reached 90% in 0.6M; competition against a moving opponent is assumed 5–15× harder |
| Hiding in the room, blocking the door, locking | 30–100M | 5–18 h | No measured anchor; a single robot with an explicit push-the-box reward delivered the box in 25% of episodes after 1M steps (13 min) in our own runs, and here the only reward is the sparse team reward; the game-engine replication reached shelter building in a few million agent steps with a curriculum |
| Ramp use and defense | 200M+ | days | Not planned for the first version; the reference needed about 4× the samples of fort building |

These are estimates, not results. The first task measures them, and the default budgets are set from that measurement: a **first look** of 5M samples (about 45 minutes, enough to see chasing and running away) and an **overnight** run of 50M samples (7–9 hours). If blocking the door does not appear within the overnight budget, the coach's curriculum (box next to the door, longer preparation, narrower door) is the planned path, and the timeline shows each curriculum revision; nothing is reported as learned that the detectors did not find.

## Tasks, in order

Each task is one zone, one branch, `pnpm check` green.

1. **Measurement (throwaway, then ADR 007).** A standalone script, outside the product code, with a 1v1 room-and-door arena: samples per second with 8, 12 and 16 copies; chasing and door blocking with pure self-play at 5M, 20M and 50M samples; batch 4,096 vs 8,192; Box vs discrete actions if time allows. Record the numbers and default budgets in `docs/decisions/007-team-game-budget.md`.
2. **Contracts** (`contracts`): everything in *Contracts* above, `pnpm gen:contracts`.
3. **Library and compiler** (`design`): vision cone, grabber, grabbable, lockable, spawn `body`, ray spread, zone marks, pieces, `runner` body, reward terms, `hide_and_seek` template, compiler welds; design checks for team games (every team has a body, every body has a spawn, agent bodies share one layout, the door is wider than a runner, the long box can close it, grab and lock welds settle without exploding); edit operations for teams and rules in `projects/`.
4. **Simulation** (`sim`): `LiveWorld.agents`, line of sight, `TeamGameEnv` with preparation, grab, lock and arena bounds; determinism and line-of-sight tests (a hider behind a wall is not seen, one in the cone is); Play with many agents.
5. **Training** (`training`): `TeamVecEnv`, `TeamPolicy`, opponent pool, team evaluation, strategy detectors, cross-play task, worker branch on family; a `slow` test that trains 50k samples end to end and checks the files a run must produce (not that it learned).
6. **Engine API** (`engine-api`): strategies and cross-play on run routes, the cross-play task, Play agent focus; events for sightings.
7. **Copilot** (`copilot`): `team-games` skill, Architect support, team watch rules, sighting narration, failure groups for rounds; fake-provider fixtures.
8. **Desktop** (`desktop`): screen IDs first, then teams panel, Play overlays, Train curves and markers, Results strategies and cross-play, timelapse chapters.
9. **Reference run:** train the `hide_and_seek` template with the overnight budget, record which strategies appeared and when, and keep it as the showcase run ([`showcase-projects.md`](./showcase-projects.md)).

## Risks

- **Nothing beyond chasing appears in a night.** Likely without help. Mitigations in order: curriculum revisions with warm starts, a smaller arena, longer preparation; a helper reward only as a last resort and labeled as such. The report says plainly which stages were not reached.
- **Self-play cycles or collapses.** The opponent pool and cross-play make it visible; the coach recommends a larger pool when cross-play shows forgetting.
- **Grab and lock are unstable** with heavy boxes and stiff welds. Design checks settle every grab and lock pair before training; weld softness is an expert property with a tested default.
- **Throughput below the estimate** with two agents and sight rays. The measurement decides the copies and the budget before anything is promised in the UI.
- **Shared policy limits** bodies to one layout. Accepted for the first version; separate brains per team are the follow-up if asymmetric games are wanted.
- **Detector false positives** would break "real or nothing" in spirit. Each sighting carries its share, rounds and frames, and the definitions are visible in Results.
- **Roadmap renumbering** touches `roadmap.md`, `screens.md` coverage and the README status line; done in one documentation change when the plan is accepted.

## Done when

A fresh `hide_and_seek` project, created by talking to the copilot, trains on the 6-core CPU with the default budgets; Play shows both brains acting with vision cones; the Training Timeline and the timelapse show every strategy the detectors found, with the step and the share of rounds, and the cross-play matrix shows how the teams improved against each other. Which strategies appeared, after how many samples and how long, is measured and recorded in ADR 007 and the showcase entry; stages that did not appear are reported as not reached.

## Sources

- Baker et al., *Emergent Tool Use From Multi-Agent Autocurricula*, 2019: [arXiv 1909.07528](https://arxiv.org/abs/1909.07528), [HTML version](https://ar5iv.labs.arxiv.org/html/1909.07528)
- [OpenAI, Emergent tool use from multi-agent interaction](https://openai.com/index/emergent-tool-use)
- [openai/multi-agent-emergence-environments](https://github.com/openai/multi-agent-emergence-environments) and its [grab and lock wrappers](https://github.com/openai/multi-agent-emergence-environments/blob/master/mae_envs/wrappers/manipulation.py)
- Kamal, Niazi and Afzal, *Replication of Multi-agent Reinforcement Learning for the "Hide and Seek" Problem*, 2023: [arXiv 2310.05430](https://ar5iv.labs.arxiv.org/html/2310.05430)
- Yu et al., *The Surprising Effectiveness of PPO in Cooperative, Multi-Agent Games*: [arXiv 2103.01955](https://arxiv.org/pdf/2103.01955), [BAIR blog](https://bair.berkeley.edu/blog/2021/07/14/mappo)
- PettingZoo, [SB3 PPO tutorial (Waterworld)](https://pettingzoo.farama.org/tutorials/sb3/waterworld) and [SuperSuit](https://pypi.org/project/SuperSuit/2.6.0); [MPE2 Simple Tag](https://mpe2.farama.org/environments/simple_tag/)
- [Unity ML-Agents overview: self-play and MA-POCA](https://unity-technologies.github.io/ml-agents/ML-Agents-Overview/)
