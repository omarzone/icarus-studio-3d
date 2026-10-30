# Implementation roadmap

How Icarus Studio 3D goes from documents to the complete product, in sprints. Every capability in [`VISION.md`](../../VISION.md), [`docs/architecture.md`](../architecture.md) and every ID in [`docs/design/screens.md`](../design/screens.md) belongs to exactly one sprint below; nothing is left out. Each sprint ends with working, tested software that can be shown, never with half-built layers.

Each sprint gets its own detailed task plan (`sprint-NN-<name>.md`) written when the sprint starts, because it builds on the interfaces the previous sprint actually produced. The first one is [`sprint-01-foundation.md`](./sprint-01-foundation.md).

## How every sprint works

1. **Plan:** write `sprint-NN-<name>.md` with bite-sized tasks (files, interfaces, tests, commits).
2. **Contracts first:** any contract change lands alone, then `pnpm gen:contracts`, then the zones that consume it.
3. **Build in parallel by zone:** one worktree and one `feat/<zone>-<topic>` branch per task (zones in `docs/architecture.md` › Working in parallel).
4. **Verify:** `pnpm check` green, design parity for every screen and module touched (below), catalog structure test for every implemented ID.
5. **Merge and record:** merge to `main`, record a short screen capture of what now works (raw material for videos), update the README status line.

### Definition of done for any UI

- The module or screen renders in the design gallery (`/__design/<ID>`) with fixture data from tests, and the visual diff against `docs/design/reference/<ID>.png` stays under the threshold set in Sprint 1 (3D viewport regions masked).
- Every control listed for that ID in the catalog exists with `data-ui-id` and leads where the catalog says (checked against `docs/design/inventory.json`).
- Loading, empty, error and engine-down states exist.
- Tokens only: no hex values, no off-scale sizes.
- The same action can be requested through the copilot (from Sprint 6 on; earlier UI gets its copilot hooks in Sprint 6).

## Sprints

Order follows dependencies: each sprint only needs what earlier sprints delivered. Sprints 1–7 form the first complete loop (describe → build → play → train → watch → diagnose → fix); 8–14 extend it to every workspace and service.

### Sprint 1 · Foundation

Monorepo, engine and desktop skeletons talking to each other, the contract pipeline, the design tokens, the design verification harness, CI, and two measured risk checks.

- Root: pnpm workspaces, Biome, TypeScript base config, `pnpm check`, file-size report, dependency policy (`minimumReleaseAge`, build allowlist).
- Engine: `uv` project, FastAPI app, `/health`, `icarus-engine` CLI, ruff, pyright, pytest.
- Contracts: Pydantic → JSON Schema → `packages/contracts/src/generated.ts`, staleness check.
- `packages/ui-tokens`: `tokens.ts` → `tokens.css` + Tailwind preset, checked against `docs/design/tokens.md`.
- Desktop: electron-vite app; main process starts and supervises the engine; launcher shell (`HDR-LAUNCHER`) and workspace shell (`HDR-WORKSPACE`, three columns) as empty layouts; `SYS-ENGINE-DOWN`.
- Design verification: reference PNGs and `inventory.json` in `docs/design/`, the `/__design` gallery route, Playwright-Electron capture, pixel diff with masks, HTML report, catalog structure test.
- CI on GitHub Actions (Ubuntu and Windows).
- Risk checks recorded as ADRs: PPO learning a parking task on this CPU (time to a usable policy), and the copilot model's reasoning and vision calls (latency, structured output).

**Screens:** `SYS-ENGINE-DOWN`, shells only. **Demo:** the app opens, starts the engine, shows its health, and survives the engine being killed.

### Sprint 2 · Project model and physics design

The project document, edit operations, components with typed properties, the library, compilation to MuJoCo and design tests.

- Contracts: `Project`, `Revision`, `ObjectSpec`, `ComponentSpec`, `PropertySchema` (12 types), `EditOperation`, `DesignReport`, `SceneDescription`, `ApiError`.
- Library v1 components: Transform, Mesh (primitives), Material, Light, Physics body, Collider, Joint, Motor, Distance ray, Balance (IMU), Touch, Spawn point, Goal zone, Zone, surfaces; reward terms for navigation and locomotion; templates (empty world, parking car, walker robot, humanoid).
- `projects/`: store, append-only revisions, apply operations, undo and redo.
- `design/`: compiler to MJCF with inertias, design tests (compiles, settles, actuators move joints, sensors finite), readable reports.
- API: projects, operations, revisions, undo/redo, scene, library.

**Demo:** create a project from a template over the API, edit a property, see validation reject an out-of-range value, undo.

### Sprint 3 · Editor core and project management

The desktop editor on top of the engine: viewport, explorer, inspector with the 12 property controls, toolbars, history and project management.

- `engine-client` (typed fetch + SSE), TanStack Query hooks, `scene/` rendering a `SceneDescription` with R3F and the shared materials.
- `PNL-VIEWPORT` (`TAB-SCENE`, `TAB-GAME-VIEW`), selection, gizmos, orientation cube; `PNL-TOOLBAR` framework; `PNL-EXPLORER`; `PNL-INSPECTOR` with all 12 controls and 6 states, generated from `PropertySchema`; `POP-ADD-COMPONENT`; `REF-PROPERTY-TYPES` as the gallery of controls.
- `SCR-WORLD` with `PNL-LIBRARY`, `POP-TRAINING-COPIES`, `STA-WORLD-EMPTY`, `STA-WORLD-EMPTY-NOGUIDE` (guide card).
- Project management: `SCR-PROJECTS`, `POP-PROJECT-MENU`, `MOD-RENAME`, `MOD-DUPLICATE`, `MOD-DELETE-PROJECT`, `MOD-HISTORY`; `SCR-HOME` and `STA-HOME-EMPTY` with templates (community section shows its empty state until Sprint 13).

**Demo:** open a template, select the car, change friction with the slider, add a component, undo it, rename and duplicate the project.

### Sprint 4 · Simulation and Play

Environments built from projects, and Play mode.

- `sim/`: Gymnasium environment from a compiled project (navigation family first, then locomotion), reward composition from terms, randomization per copy, `check_env` and seeded determinism tests, offscreen rendering for vision.
- Play session over WebSocket (`PlayCommand`, `PlayFrame`, `PlayEvent`), core tools (Move, Push, Add object, Light, Wind, Slow, Reset) and sense-derived tools (Shadow, Scent, Touch, Shuffle), clip recording.
- `SCR-PLAY` with `HDR-PLAY`, `TAB-PLAY`, `TAB-AGENT-VIEW`, `PNL-PLAY-SENSES`, `PNL-PLAY-DECISIONS`, `PNL-PLAY-VISION`, `PNL-PLAY-EVENTS`; Play button wired in every workspace header.

**Demo:** press Play on the parking project, move a parked car in front of an untrained car, watch the senses react and the events log fill.

### Sprint 5 · Training and the Training Timeline

Real PPO training on the CPU, watched live.

- `training/` worker subprocess with `SubprocVecEnv`, checkpoint schedule (0, 25k, 50k, 100k, 250k, 500k, 1M…), deterministic evaluation, rollouts, final checkpoint on stop; `experiments/` runner and queue; run store layout from the architecture.
- Run API and SSE events; supervisor with process-tree kill and phased shutdown.
- `MOD-START-TRAINING`, `SCR-TRAIN` (`PNL-RUNS`, `PNL-METRICS`, `TAB-LIVE-TRAINING` with all parallel copies, `TAB-REPLAY` with `RolloutPlayer`), `MOD-STOP-RUN`, `STA-TRAIN-FAILED`, `SCR-SETTINGS-TRAINING`.

**Demo:** train the parking car from zero, watch 16 copies learn, scrub any checkpoint, stop and keep the best brain.

### Sprint 6 · Copilot

The copilot that designs, explains and proposes, through the same edit operations.

- `copilot/client.py` per capability (OpenAI-compatible), `fake` provider with fixtures, structured outputs with one retry, numbers-must-exist check, live tests.
- `PNL-CHAT` (`TAB-CHAT`, `TAB-HISTORY`), proposal previews in blue in the viewport, Apply and Discard (`STA-WORLD-PROPOSAL`), suggestion chips, autonomy mode.
- Architect: three `DesignIdea`s with compiled previews (`SCR-IDEAS`, `PNL-IDEAS`), then building with progress (`STA-WORLD-BUILDING`); Guide role (explain anything selected).
- Copilot hooks for every UI built in Sprints 3–5. `SCR-SETTINGS-MODELS`.

**Demo:** type "a little car that learns to park itself", pick one of three ideas, watch it build, ask "make it night", apply the proposal.

### Sprint 7 · Results, diagnosis and autopilot

Judge brains fairly, understand failures with vision, and let the copilot iterate.

- `SCR-RESULTS` (`PNL-RESULT-RUNS`, `PNL-SUMMARY`, `PNL-RESULTS-VIEW` › `TAB-COMPARE`, `PNL-LEARNED`), same-seed comparison.
- Coach: rollout frames to the vision capability, failure grouping, `Diagnosis` with proposed operations (`STA-RESULTS-FAILURES`, `PNL-FAILURES`, `TAB-WHERE-IT-FAILS`), *Apply as revision*.
- Autopilot loop with budget (`MOD-AUTOPILOT`), coach commentary during training.
- `SCR-TIMELAPSE` presentation mode with real metrics and video export.

**Demo:** the full first loop: describe, build, play, train, compare, diagnose a failure, apply the fix, retrain, present the timelapse.

### Sprint 8 · Brain workspace

Everything about what the agent perceives, does and is rewarded for.

- `SCR-BRAIN` (`PNL-SENSES-ACTIONS`, `PNL-LEARNING` › Reward, Goal, Curriculum, Practice and Expert settings in the inspector), curriculum stages in the engine.
- `STA-BRAIN-NETWORK` (`PNL-BRAIN-SHAPE`, `TAB-NETWORK` with live activations from the policy), `MOD-BRAIN-SIZES` with estimates from measured budgets, brains from the community as a source (wired fully in Sprint 13).

**Demo:** turn on two side sensors, raise a penalty, pick a bigger brain, train and see the network light up.

### Sprint 9 · Body workspace and import

Any body, built in Icarus or imported.

- `SCR-BODY` (`TAB-RIG-VIEW`, `TAB-MESH-VIEW`, `PNL-RIG-CHECK` › Rig check, Pose test, Weights), joint limit handles, mirror, colliders.
- `MOD-IMPORT` for models (glb, gltf, fbx, obj), environments (glb, usd) and robots (URDF, MJCF); `MOD-AUTO-RIG` (shape detection, bones and joints, mass and motor estimates, stand-up test); `STA-BODY-CHECK-FAILED` with copilot repair.
- Locomotion task family and the walker template trained end to end.

**Demo:** import a humanoid model, auto-rig it, fix the failed check with the copilot, make it stand in Play.

### Sprint 10 · Motion from video

Characters that copy a reference video under physics.

- Pose capability pipeline, `MotionClip`, retargeting, imitation task family with a tracking reward, animation export (glTF, FBX, BVH).
- `MOD-MOTION-VIDEO` (file, link, webcam, trim, who to copy, onto which character), `MOD-MOTION-TRACKING`, `SCR-MOTION` (`PNL-MOTION-COMPARE`, `PNL-CLIP-TIMELINE`), `MOD-MOTION-TRAIN`, `STA-MOTION-TRAINING`, `MOD-EXPORT-ANIMATION`; Motion workspace tab appears with the first clip.

**Demo:** upload a dance clip, track it, train the copy focusing on the hardest moment, export the animation.

### Sprint 11 · Connectome brains

Bodies driven by real wiring maps, with no training.

- Connectome format in the library, import and preprocessing of a published fly connectome, a leaky integrate-and-fire simulator fast enough for Play, a fly body model, sensory and motor mapping with unmapped-neuron reporting.
- `MOD-BRAIN-SOURCE`, `STA-BRAIN-CONNECTOME` (`PNL-BRAIN-ACTIVITY` › activity, behaviors, wiring), Play tools for vision and smell, the outdoor world with food.
- `BehaviorTest` and `ReferenceRecording`, `STA-RESULTS-REFERENCE` (`PNL-REFERENCE-TESTS`, `PNL-REFERENCE-VIEW`, `PNL-REFERENCE-MATCH`).

**Demo:** load the connectome into the fly, drop sugar in Play, watch it walk there and its neurons fire, compare its walk with recordings.

### Sprint 12 · Build and hardware

Taking creations out of Icarus.

- Export: ONNX, TorchScript and a game-engine format (`MOD-EXPORT-BRAIN`), URDF and MJCF, use in a game.
- Hardware profiles with real components and limits, parts lists, the single-board runtime package, and the guided flow `STA-BUILD-HARDWARE` (parts, connect, calibrate, test drive, load the brain).
- `SCR-BUILD` (`PNL-BUILD-TARGETS`, `PNL-BUILD-TARGET-VIEW`), sim-to-real randomization presets.

**Demo:** export the parking brain to ONNX, run it with the runtime on a single-board computer reading real sensors.

### Sprint 13 · Community

Sharing, remixing and safety.

- `services/community` with its stack recorded in an ADR (proposed: Supabase for accounts, Postgres and object storage, plus a small Python service reusing the engine contracts for bundle validation, automatic scan and moderation): accounts (Google, GitHub, email), bundle storage, catalog with previews, lineage, votes, comments, follows, reports, moderation, rate limits and backups.
- Desktop sign-in through the system browser with OAuth PKCE and an `icarus://` deep link; session stored with the OS keychain (Electron `safeStorage`). Creating and training never require an account.
- Open source and self-hostable: the whole service runs with `docker compose up`; the app has a *Community server* setting that defaults to the official instance. The official instance is deployed and operated by the maintainers (domain, secrets, moderation team), with terms and privacy pages.
- `bundles/` pack and unpack with validation; `community-client`.
- Artist role: thumbnails for every creation and skins on request through the image capability.
- `MOD-SIGN-IN`, `MOD-SHARE`, `MOD-PUBLISH`, `MOD-PUBLISHED`, `SCR-COMMUNITY`, `SCR-CREATION`, `MOD-REPORT`, `SCR-PROFILE`, `POP-NOTIFICATIONS`, `SCR-SETTINGS-PROFILE`, `SCR-SETTINGS-PRIVACY`, `SCR-SETTINGS-NOTIFICATIONS`, `SCR-MODERATION`; community sections of `SCR-HOME` and `PNL-LIBRARY`.

**Demo:** publish the parking car, open its page from another account, remix it and retrain.

### Sprint 14 · Release

Ship it.

- Installers for Windows, macOS and Linux with the bundled engine runtime, first-launch preparation, updates with the engine stopped first.
- Full design parity pass over all 62 catalog entries, accessibility audit, performance budgets (viewport, training throughput, memory), presentation-ready check of every screen.
- Final documentation, README with real screenshots, release notes.

**Demo:** install on a clean machine of each platform and complete the first loop without a terminal.

## Coverage

Every catalog ID mapped to its sprint.

| Sprint | IDs |
|---|---|
| 1 | `HDR-LAUNCHER` (shell), `HDR-WORKSPACE` (shell), `SYS-ENGINE-DOWN` |
| 2 | engine only |
| 3 | `PNL-VIEWPORT`, `PNL-TOOLBAR`, `PNL-EXPLORER`, `PNL-INSPECTOR`, `POP-ADD-COMPONENT`, `REF-PROPERTY-TYPES`, `PNL-LIBRARY`, `SCR-WORLD`, `POP-TRAINING-COPIES`, `STA-WORLD-EMPTY`, `STA-WORLD-EMPTY-NOGUIDE`, `SCR-PROJECTS`, `POP-PROJECT-MENU`, `MOD-RENAME`, `MOD-DUPLICATE`, `MOD-DELETE-PROJECT`, `MOD-HISTORY`, `SCR-HOME`, `STA-HOME-EMPTY` |
| 4 | `SCR-PLAY`, `HDR-PLAY`, `PNL-PLAY-SENSES`, `PNL-PLAY-DECISIONS`, `PNL-PLAY-VISION`, `PNL-PLAY-EVENTS` |
| 5 | `MOD-START-TRAINING`, `SCR-TRAIN`, `PNL-RUNS`, `PNL-METRICS`, `MOD-STOP-RUN`, `STA-TRAIN-FAILED`, `SCR-SETTINGS-TRAINING` |
| 6 | `PNL-CHAT`, `STA-WORLD-PROPOSAL`, `SCR-IDEAS`, `PNL-IDEAS`, `STA-WORLD-BUILDING`, `SCR-SETTINGS-MODELS` |
| 7 | `SCR-RESULTS`, `PNL-RESULT-RUNS`, `PNL-SUMMARY`, `PNL-RESULTS-VIEW`, `PNL-LEARNED`, `STA-RESULTS-FAILURES`, `PNL-FAILURES`, `MOD-AUTOPILOT`, `SCR-TIMELAPSE` |
| 8 | `SCR-BRAIN`, `PNL-SENSES-ACTIONS`, `PNL-LEARNING`, `STA-BRAIN-NETWORK`, `PNL-BRAIN-SHAPE`, `MOD-BRAIN-SIZES` |
| 9 | `SCR-BODY`, `PNL-RIG-CHECK`, `MOD-IMPORT`, `MOD-AUTO-RIG`, `STA-BODY-CHECK-FAILED` |
| 10 | `MOD-MOTION-VIDEO`, `MOD-MOTION-TRACKING`, `SCR-MOTION`, `PNL-MOTION-COMPARE`, `PNL-CLIP-TIMELINE`, `MOD-MOTION-TRAIN`, `STA-MOTION-TRAINING`, `MOD-EXPORT-ANIMATION` |
| 11 | `MOD-BRAIN-SOURCE`, `STA-BRAIN-CONNECTOME`, `PNL-BRAIN-ACTIVITY`, `STA-RESULTS-REFERENCE`, `PNL-REFERENCE-TESTS`, `PNL-REFERENCE-VIEW`, `PNL-REFERENCE-MATCH` |
| 12 | `SCR-BUILD`, `PNL-BUILD-TARGETS`, `PNL-BUILD-TARGET-VIEW`, `MOD-EXPORT-BRAIN`, `STA-BUILD-HARDWARE` |
| 13 | `MOD-SIGN-IN`, `MOD-SHARE`, `MOD-PUBLISH`, `MOD-PUBLISHED`, `SCR-COMMUNITY`, `SCR-CREATION`, `MOD-REPORT`, `SCR-PROFILE`, `POP-NOTIFICATIONS`, `SCR-SETTINGS-PROFILE`, `SCR-SETTINGS-PRIVACY`, `SCR-SETTINGS-NOTIFICATIONS`, `SCR-MODERATION` |
| 14 | parity pass over every ID, installers |

Architecture coverage: contract (2, extended where used), library (2, 9, 11), projects and edit operations (2), objects and components (2–3), design ideas (6), design compilation and tests (2), simulation (4), brains (5 learned, 11 connectome, 13 community), Play (4), comparison with real behavior (11), training and timeline (5), run store (5), copilot roles (6 Architect and Guide, 7 Coach, 10 Motion, 12 Builder, 13 Artist for thumbnails and skins), coach and autopilot (7), motion (10), hardware (12), bundles (13), HTTP API (grows each sprint), desktop studio (1, 3), distribution (14), community service (13), quality (1, every sprint).
