# Showcase projects

The projects that show what Icarus Studio 3D can do: each one is a real project, trained by the engine on a desktop CPU, with its whole learning history kept. A person who opens Icarus for the first time should be able to watch any of them learn, play with the trained brain, and train it again themselves in the same session.

**Spec:** `VISION.md` (Learning is something you can watch; Create, share, remix; Reproducible by default); `docs/architecture.md` › Library, Simulation, Training and the Training Timeline, Bundles; [`roadmap.md`](./roadmap.md); [`sprint-12-multi-agent-hide-and-seek.md`](./sprint-12-multi-agent-hide-and-seek.md); [`docs/design/app-gaps.md`](../design/app-gaps.md).

## Rules every showcase follows

- **Real or nothing.** A showcase appears in the product only with a reference run the engine produced from the showcase's own template revision: frozen project, seed, versions, metrics, checkpoints, rollouts and frames. Its card quotes that run's numbers and nothing else. A showcase whose run has not reached its goal is not shown; it is never replaced by a video, an animation or a placeholder.
- **Reproducible.** *Train it yourself* creates a fresh project from the same template and trains from zero; Results compares the new run with the reference run on the same evaluation seeds.
- **Data, never code.** A showcase is a bundle: the template as edit operations, the reference run and a brain stored as weights only (see *How showcases appear*).
- **The copilot can do it.** Every showcase can be started, explained, changed and retrained by talking, and its coach path (what goes wrong and how it is fixed) is written down in a skill.
- **Timing is measured or labeled.** Times below marked *measured* come from runs on the development machine (6 cores, 12 threads, no GPU, 16 copies); everything else is an *estimate* to be replaced by a measurement before it appears in the UI.

## What exists today

- **Library:** parts (box, sphere, capsule, cylinder, plane), hinge, slide, ball and fixed joints, position and torque motors, distance rays (up to 32, a fixed ±30° fan, tilt), balance, touch, spawn point, goal zone, zones (slow, slippery), surfaces (asphalt, concrete, grass, snow, ice, rubber, wood, metal; friction only), sky, randomize per copy.
- **Reward terms:** navigation (`reach_goal`, `progress_to_goal`, `heading_alignment`, `collision_penalty`, `time_penalty`, `object_to_goal`, `coverage`) and locomotion (`forward_progress`, `stay_upright`, `energy_cost`, `fall_penalty`, `height_gain`).
- **Task families:** navigation and locomotion; one body per project is trained; episodes are a fixed 30 s at 20 Hz.
- **Templates:** empty world, parking car, walker robot, humanoid. **Pieces:** box, ramp, wall, post, ball.
- **Training:** PPO, 2 × 256 tanh, 16 copies, log-spaced checkpoints with deterministic evaluation, rollouts and frames, failure groups, watch rules, diagnosis, autopilot, warm start, same-seed comparison.
- **Measured on this CPU** (from the engine's own run store):
  - Parking car, template defaults: 100% parked on the evaluation seeds after 1M steps, 11 minutes.
  - Walker, autopilot: one run learned to stand still (upright reward 150, forward progress −1.2 over a 30 s episode), a reward exploit; a later autopilot revision (forward weight 10, upright weight 0.01) walked about 15.8 m in 30 s without falling after 1M steps, 14.5 minutes, at 1,500–1,760 steps per second.
  - A small tracked robot pushing a box into a goal: delivered in 25% of evaluation episodes after 1M steps, 13 minutes.

## Ranked showcases

Ranked by how strongly a first-time viewer reacts, adjusted for what can honestly be trained on a CPU.

### 1. Hide and seek

- **What people see:** two small robots in an arena with a room and a door. At first they wander; then the seeker chases; then, during the seconds the seeker is frozen, the hider drags a box into the doorway and locks it. The timelapse is chaptered by the strategies the detectors found.
- **Supported:** MuJoCo bodies, boxes, walls, per-copy variation, PPO, checkpoints, rollouts of every moving body, timeline.
- **Missing:** everything in [Sprint 12](./sprint-12-multi-agent-hide-and-seek.md): several trained bodies in one world, teams and roles, vision cone with line of sight, grabber, grabbable and lockable objects, 360° rays, team rewards with a preparation phase, the `team_game` family, shared-policy self-play with a centralized critic, strategy detectors, cross-play.
- **CPU time (estimate):** chasing in 30 min – 1.5 h; door blocking 5–18 h, uncertain; ramps out of reach for the first version.
- **Coach to success:** chasing, likely; door blocking, uncertain, through curriculum revisions; the coach reports stages not reached.
- **Sprint:** 12.

### 2. A car that learns to park

- **What people see:** 16 cars learning at once, crashing into parked cars at first, then sliding into the spot; Play lets you move a parked car in the way.
- **Supported:** everything: template, rewards, rays, per-copy variation, autopilot, the parking skill.
- **Missing:** only the showcase packaging and the timelapse (`SCR-TIMELAPSE` on real runs, Sprint 7 open item).
- **CPU time (measured):** 11 minutes to 100% on the evaluation seeds.
- **Coach to success:** yes; this is the path the coach is built around.
- **Sprint:** 7 (ready as soon as the timelapse lands).

### 3. A walker that learns to walk

- **What people see:** a two-legged robot that falls over and over, then stands, then strides; the coach catches the moment it learns to cheat by standing still and fixes the reward.
- **Supported:** walker template, locomotion rewards, balance and touch, autopilot with reward fixes (measured: the stand-still exploit and its fix happened in real runs).
- **Missing:** a success definition for locomotion (today `success_rate` is empty for the family, so the coach cannot say "done"): a goal such as "walk 10 m without falling" in the task; a measured locomotion budget recorded as an ADR; a side camera that follows the walker in the timelapse.
- **CPU time:** walking after 1M steps in 14.5 minutes (measured once, after the autopilot's fix); the budget needs repeated seeds before it is promised.
- **Coach to success:** yes, with the walking-robot skill and the per-term reward breakdown (the "reward without success" watch rule needs the success definition above to fire for locomotion); already done once by the autopilot.
- **Sprint:** 9 (locomotion family), packaged earlier if the success definition lands first.

### 4. Robot soccer

- **What people see:** first a small robot that learns to dribble a ball into a goal; later two robots playing 1 v 1.
- **Supported:** ball piece, goal zone, `object_to_goal` (the body observes the ball and the goal), collision terms; a box-pushing robot measured 25% delivery after 1M steps.
- **Missing:** a goal-mouth piece (posts and a net as walls), ball randomization presets, a longer default budget for pushing tasks (measured, 3M candidate); for 1 v 1, Sprint 12's teams, plus a `score` rule in `team_game` (a team scores when the ball rests in the other goal).
- **CPU time:** single-robot penalty, estimate 3–5M steps, 30–50 min; 1 v 1, estimate 20–50M samples, several hours.
- **Coach to success:** single robot, likely (reward breakdown shows when it chases the ball but never scores); 1 v 1, uncertain.
- **Sprint:** single robot in 8 (learning settings and budgets); 1 v 1 as the second team game after 12.

### 5. A robot dog running over snow

- **What people see:** a four-legged robot learning to trot, then running across a snowfield where its feet slip.
- **Supported:** joints, motors, balance, touch, locomotion rewards, snow and ice surfaces (as friction), slippery zones.
- **Missing:** a quadruped template (four legs, two or three motors each); a heading or speed command so it runs where told; snow is honest as low friction and a white look: MuJoCo has no deformable terrain, so footprints or sinking are not simulated and the product says so; a measured legged budget.
- **CPU time (estimate):** 5–20M steps, 1–3 h.
- **Coach to success:** likely for trotting; the walking-robot skill needs a quadruped section (gait, foot contact, slipping).
- **Sprint:** 9.

### 6. A dance copied from a video

- **What people see:** a person dancing in a video, and next to it a physically simulated humanoid that learns the same dance and keeps its balance.
- **Supported:** humanoid template (12 motors, balance and foot sensors), PPO.
- **Missing:** the whole Sprint 10 pipeline: pose capability, `MotionClip`, retargeting, the imitation family with a tracking reward, reference-state starts, animation export.
- **CPU time (estimate):** a short clip of 5–10 s on a simplified humanoid, 20–60M steps, 4–10 h; long clips are not a CPU target.
- **Coach to success:** partial: it can find the hardest moment from per-frame tracking error and train it longer; a full clip is uncertain.
- **Sprint:** 10.

### 7. The fruit fly with a real connectome

- **What people see:** a fly body walking toward sugar, driven by a published wiring map of a real fly brain, with its neurons lighting up; no training.
- **Supported:** MuJoCo, Play, the connectome as a planned brain kind in the architecture.
- **Missing:** the whole Sprint 11 work: connectome format and import (the published adult fly brain map has well over 100,000 neurons and tens of millions of synapses), a leaky integrate-and-fire simulator, a fly body (open MuJoCo fly models exist and need a license check), sensory and motor mapping with unmapped neurons reported, behavior tests against recordings. A whole-brain simulation on a CPU may run slower than real time; Play then runs at a reduced time scale and says so.
- **CPU time:** no training; the cost is simulation speed, to be measured.
- **Coach to success:** the coach explains activity and mapping gaps; success is measured by behavior tests, not by training.
- **Sprint:** 11.

### 8. A humanoid that stands up

- **What people see:** a humanoid lying on the ground that learns to roll, push and rise to its feet.
- **Supported:** humanoid template, `height_gain`, `stay_upright`, balance.
- **Missing:** a lying start pose (today bodies start where they are designed); an episode that does not end on "fallen" for this task; a success definition (head above a height for 2 s); more motors (arms) for a believable rise; a measured budget.
- **CPU time (estimate):** 20–50M steps, 4–10 h; may not succeed in a night.
- **Coach to success:** uncertain; curriculum (start half-seated, then lower) is the coach's tool.
- **Sprint:** 9.

### 9. A vacuum robot covering a room

- **What people see:** a round robot in a furnished room, painting the floor it has cleaned; coverage climbs from patches to the whole room.
- **Supported:** wheeled bodies, distance rays, `coverage`, per-copy furniture variation, collision terms.
- **Missing:** furniture pieces (sofa, table, chair as static boxes with looks), a coverage share metric and a success definition ("cover 80% of the floor"), a cleaned-floor overlay in replays drawn from recorded positions, a 360° ray spread (shared with Sprint 12).
- **CPU time (estimate):** 2–5M steps, 20–50 min.
- **Coach to success:** likely; the reward breakdown shows when it circles the same cells.
- **Sprint:** 8.

### 10. A hexapod over rough ground

- **What people see:** a six-legged robot crossing rocky, uneven ground, legs finding footholds.
- **Supported:** joints, motors, balance, touch, locomotion rewards.
- **Missing:** a heightfield terrain piece with rough, steps and slope presets, randomized per copy (MuJoCo supports heightfields; the library does not); a hexapod template (18 motors); a measured budget.
- **CPU time (estimate):** 10–30M steps, 2–5 h.
- **Coach to success:** likely on flat ground, uncertain on rough ground without curriculum (raise roughness as success rises).
- **Sprint:** 9.

### 11. A jumping tripod

- **What people see:** a three-legged creature that discovers it can jump, higher at each checkpoint.
- **Supported:** `height_gain`, hinge joints, torque motors, balance.
- **Missing:** a tripod template; a jump metric (peak height per episode) and a success definition; a landing check so it is not rewarded for falling over after the jump.
- **CPU time (estimate):** 1–3M steps, 10–30 min.
- **Coach to success:** likely.
- **Sprint:** 9.

### 12. A snake

- **What people see:** a chain of segments with no legs that learns to slither or swim.
- **Supported:** chains of hinged parts and motors, locomotion rewards.
- **Missing:** ground slithering needs friction that differs along and across each segment (MuJoCo can express it with explicit contact pairs; the library has one friction value per collider) or passive wheels under the segments; swimming needs a water world with MuJoCo's fluid forces (the water component is planned in the architecture, not built). A snake template and the choice between the two.
- **CPU time (estimate):** 2–5M steps, 20–50 min.
- **Coach to success:** likely once the medium exists; without it the coach should say the body cannot move forward in this world.
- **Sprint:** 9.

## How showcases appear in the product

1. **Home › Start from.** Showcases join the template row (`SCR-HOME`) as cards with a rendered 3D thumbnail of their scene and a badge with the reference run's real numbers ("Parks 100% of tries · 1M steps · 11 min on a 6-core CPU"). Hovering plays the best checkpoint's real rollout in the card. The row shows only showcases whose reference run reached its goal.
2. **Opening a showcase** offers three things: *Watch how it learned* (the timelapse of the reference run's checkpoints), *Play with the trained brain* (Play with the reference brain) and *Train it yourself* (a fresh copy trained from zero, compared with the reference on the same seeds). The project opens with the reference run in its run list, so Results and the timeline work immediately.
3. **A timelapse per showcase.** Built by `SCR-TIMELAPSE` from the reference run's rollouts, with the step, the real metric at each checkpoint and, for team games, strategy chapters. Exported videos carry the run and step they come from.
4. **Community › Featured.** The same bundles, published by the studio's own account, are the first shelf of Icarus Community, with lineage so every remix points back to them. Locally, the showcases ship with the installer so Home works offline; nothing is downloaded without the person asking.
5. **The copilot knows them.** "Show me what Icarus can do" lists the showcases; "make the hide and seek two against two" remixes one through ordinary edit operations; the Architect uses showcase templates as known-good starting points, and each showcase's coach path lives in a skill.

**Packaging decisions.**

- **Brains ship as weights only.** A Stable-Baselines3 checkpoint archive can carry pickled Python objects that run code when loaded, which would break "bundles carry data, never code". Showcase and community brains are stored as tensors plus a JSON description of the brain template and observation and action sizes, loaded with weights-only loading into a network the engine builds itself. The engine's own run checkpoints keep their current format, because they never come from outside. This deserves an ADR before Sprint 13.
- **Size budget.** A 2 × 256 brain is under 1 MB; a reference run with about ten checkpoints, rollouts and frames is a few to a few tens of MB. Bundles keep the brains of every checkpoint the timelapse uses, the rollouts and a small set of frames, and drop optimizer state.
- **A showcase is gated by a test.** A catalog test checks that every listed showcase bundle validates, that its reference run meets the goal its card claims, and that every timelapse checkpoint has a rollout. A showcase that fails is removed from the list, not patched.
- **Library entry.** `library/showcases.py` lists each showcase: template, goal sentence, reference bundle id and the skill that covers its coach path. Its card text is generated from the bundle's metrics.

## Recommended build order

1. **Finish the timelapse** (`SCR-TIMELAPSE` on real runs with export): every showcase depends on it.
2. **Showcase packaging:** weights-only brain export, reference-run bundles (local, before the community service), Home cards with real badges, the gating test.
3. **Parking car** as the first showcase (already measured).
4. **Walker** (locomotion success definition and a measured budget), **vacuum robot** and **single-robot soccer** (small library additions, under an hour of training each).
5. **Hide and seek** (Sprint 12): measurement first, then the sprint; the reference run trains overnight.
6. **Bodies** (Sprint 9): jumping tripod, robot dog on snow, snake, hexapod with heightfield terrain, humanoid standing up, in that order of cost.
7. **Dance from video** (Sprint 10) and **the fruit fly** (Sprint 11).
8. **Community › Featured** (Sprint 13) publishes the same bundles; **1 v 1 soccer** follows as the second team game.

## Sources

- Baker et al., *Emergent Tool Use From Multi-Agent Autocurricula*, 2019: [arXiv 1909.07528](https://arxiv.org/abs/1909.07528)
- Shiu et al., *A Drosophila computational brain model reveals sensorimotor processing*, Nature 634, 2024: [record](https://ideas.repec.org/a/nat/nature/v634y2024i8032d10.1038_s41586-024-07763-9.html)
