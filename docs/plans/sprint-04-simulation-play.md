# Sprint 4 · Simulation and Play Implementation Plan

> **For agentic workers:** two workstreams run in parallel, one per zone: engine (`sim` and `engine-api`) and desktop. Each one starts from the Play contracts already on this branch (`services/engine/src/icarus/contracts/play.py`, generated into `@icarus/contracts`). Never edit the contracts; report a missing field instead.

**Goal:** Press Play on a project and watch it run live. The engine steps MuJoCo in real time with the current brain and streams frames, senses, brain outputs and events over a WebSocket. The desktop draws those frames in the Play viewport and lets the user act on the world with tools. Play never changes the project. Beneath it, a Gymnasium environment built from any navigation or locomotion project is ready for training in Sprint 5.

**Spec:**
- [`roadmap.md`](./roadmap.md) › Sprint 4
- [`docs/architecture.md`](../architecture.md) › Simulation, Play mode, HTTP API (`WS /projects/{id}/play`)
- `docs/design/screens.md` for `SCR-PLAY`, `HDR-PLAY`, `TAB-PLAY`, `TAB-AGENT-VIEW`, `PNL-PLAY-SENSES`, `PNL-PLAY-DECISIONS`, `PNL-PLAY-VISION`, `PNL-PLAY-EVENTS`
- the root, engine and desktop `AGENTS.md` files

## Decisions

- **The brain.** No trained brain exists before Sprint 5. Play runs an *untrained brain*: seeded random actions within each actuator's range, labelled in the session info as `"Untrained brain: random actions"`. When a run's checkpoint exists (Sprint 5), Play swaps it in through the same `Policy` interface (`act(observation) -> action`).
- **The protocol.**
  - The client sends `PlayCommandEnvelope` JSON.
  - The engine sends `PlayMessageEnvelope` JSON: one `ready` (session info and scene) first, then `frame` messages at about 30 per second, `event` messages when something happens, and `error` messages for bad commands. A bad command never closes the session.
- **Real time.**
  - The engine steps physics at the model timestep and the brain at 20 Hz (control every 25 physics steps at 2 ms).
  - Simulated time per real second equals `speed`. Speed 0.25 is "Slow".
  - Pause stops stepping. Reset reloads the initial state and clears the episode return.
- **Tools offered.**
  - Core, always: move, push, add object, light, wind, slow, reset.
  - Sense-derived: touch (only when the body has touch sensors) and shuffle (only when the world has movable props).
  - Shadow and scent need camera and smell sensors, which are not in library v1, so they are not offered. The design's `PlayToolId` keeps them for later.
- **Senses and outputs.**
  - Senses come from the model's sensors: rays as distances (min 0, max cutoff, unit m), gyro and accelerometer magnitudes, touch forces.
  - Outputs are the actuator controls (min and max from `ctrlrange`).
  - Events are human sentences, for example "You pushed Box 2 with 40 N·s", "Car touched Wall", "Car reached the parking spot", "Episode reset".
- **Rewards.** Reward terms are composed from the library terms of the task family (navigation: `reach_goal`, `progress_to_goal`, `heading_alignment`, `collision_penalty`, `time_penalty`; locomotion: `forward_progress`, `stay_upright`, `energy_cost`, `fall_penalty`). Each term is a small tested function of the previous and current state. Weights come from the project's task. Play shows the live reward and the episode return.
- **The agent.** The agent is the first body's root object. The goal is the world or body object with a `goal_zone`.

---

## Workstream A · Engine (`icarus/sim`, `icarus/api/play.py`)

New dependency: `gymnasium` (`uv add gymnasium`), justified because the architecture fixes Gymnasium as the environment interface and `check_env` as the gate.

1. **`sim/model_state.py`.** Builds a live world from a project: compiled model plus data, the agent body id, the goal site, sensor and actuator metadata (label, range, unit), and a mapping from geom name to object.
   - Tests:
     - the parking car has 5 ray sensors with range 0..10 m and 4 actuators;
     - the walker has balance and touch sensors and 6 actuators.
2. **`sim/rewards.py`.** One function per library reward term, plus `compose(terms, weights, before, after) -> (total, parts)`.
   - Tests, one per term with hand-built states: progress is positive when getting closer; collision is negative on contact with a non-ground geom; stay_upright is highest when the torso is vertical; and so on.
3. **`sim/env.py`.** `ProjectEnv(gymnasium.Env)` for navigation and locomotion projects.
   - Observation: the sensor data, plus the goal vector in the agent frame for navigation.
   - Action space: Box(−1, 1), scaled to `ctrlrange`.
   - Reward: composed as above.
   - Terminations: navigation ends when the goal is reached or the agent flips; locomotion ends when the agent falls (torso below 40% of its start height).
   - Truncation at 30 s.
   - Seeded `reset(seed=)`, with randomization per copy: randomizable properties (friction) are varied ±20% when `randomize=True`.
   - Tests:
     - `check_env` passes for `parking_car` and `walker_robot`;
     - the same seed gives the same first 50 observations;
     - a different seed with randomization gives different friction.
   - The env is unused by Play this sprint (Play keeps one live world), but the training sprint builds on it.
4. **`sim/play.py`.** `PlaySession(project, revision, brain: Policy, seed)`:
   - `step_realtime(dt_real)` advances `dt_real × speed` of simulated time;
   - `apply(command) -> list[PlayEvent]`;
   - `frame() -> PlayFrame`;
   - `info() -> PlaySessionInfo`.
   - How the tools act:
     - move sets a free body's position, or rejects with an error message for a jointed part;
     - push applies an impulse through `qvel`;
     - add_object rebuilds the model with the library piece added, while keeping the current state of existing bodies (or resets with an event saying so — choose the simpler and say which);
     - light scales light diffuse;
     - wind sets `opt.wind`;
     - speed, pause and reset do what their names say;
     - shuffle moves movable props by up to ±1 m (seeded);
     - touch pokes a touch-sensor body.
   - Detected events: contacts that start between the agent and a non-ground geom, the goal reached, a fall, and an episode reset.
   - Tests: the frame lists every geom pose; push changes velocity; reset restores time 0; speed 0.25 advances a quarter of the time; an unknown object gives an error event, not an exception; Play never writes to the project store.
5. **`api/play.py`.** The `WS /projects/{id}/play` route. It loads the current project state, creates the session with the untrained policy, sends `ready`, then runs an asyncio loop: at about 30 Hz it steps with the real elapsed time and sends a frame; it reads commands concurrently; it sends events. Unknown projects close with code 4404 and an error message.
   - Test: FastAPI `TestClient.websocket_connect`. It receives `ready` with tools, receives at least 3 frames with increasing time, sends `push` and receives an event, and sends a malformed command and receives `error` while the session stays open.

Verify: `uv run ruff check`, `uv run ruff format --check`, `uv run pyright`, `uv run pytest -m "not slow and not live"` (all from `services/engine`).

## Workstream B · Desktop (`apps/desktop`)

1. **`engine-client/play-socket.ts`.** `openPlay(projectId, handlers, options?) → { send(command), close() }`.
   - It resolves the URL from `engineUrl()` (http→ws) and parses every message with a structural check (`isPlayMessage`).
   - An invalid message calls `onError` and does not throw. A closed socket calls `onClosed(reason)`.
   - Tests with a fake WebSocket class (inject the constructor): ready, frame and event are routed; a malformed message reports an error; `send` serializes an envelope.
2. **Play port.** Keep the view types in `ports/play-port.ts` and add a streaming function:
   - `connect(project, listener: (session: PlaySession, live: PlayLive) => void) → disconnect`;
   - `PlayLive = { scene: SceneDescription | null; poses: Map<geomName, {position, quaternion}>; paused; speed }`;
   - a `send(project, action: PlayAction)` for tools, where `PlayAction` is a view-level union (`{tool:"push", object}`, `{tool:"add-object", piece, at}`, `{tool:"light"}`, `{tool:"wind"}`, `{tool:"slow"}`, `{tool:"reset"}`, `{tool:"shuffle"}`, `{tool:"touch", object}`, `{tool:"move", object, to}`, `{tool:"pause", paused}`).
   - `getSession`, `selectTool` and `setSpeed` stay for the screens.
   - App side: `ports/play-engine.ts` maps frames to `PlaySession`:
     - senses become `LiveBar`s (ratio within min..max, `display` with unit, tone warn below 20% for rays);
     - decisions become actuator bars with `brain` from the session info;
     - events become `{time: "mm:ss", text}`, newest first, keeping the last 50;
     - status comes from the frame;
     - the tools come from the session info;
     - `views` is `["Game view"]` (no cameras in v1).
   - The prototype side keeps the fixture and emits the fixture session once.
   - Test the mappers with a frame captured from the engine (`ports/testdata/play-frame.json`), written by a short script against the real `PlaySession`, or hand-built from the contract when workstream A is not done yet.
3. **Play screen.**
   - `use-play-session.ts` subscribes through the port while `SCR-PLAY` is open (and disconnects on leave), and keeps the latest `PlaySession` in the query cache under `playKey(project)` so the panels keep working unchanged.
   - The Play viewport (`TAB-PLAY`) draws `live.scene` with poses applied. Reuse `scene/scene-view.tsx`: add an optional `poses` prop that overrides each geom's position and quaternion, and a `tool` mode where clicks call `onPick(objectId, point)` instead of selecting. The gizmo is off in Play.
   - Tool bar: picking a tool selects it. Clicking an object in the viewport applies push, touch or move-to-click-point, and clicking the ground applies add-object (default piece `box`). light, wind, slow, reset and shuffle apply at once. Speed and pause go through the header controls.
   - Header Play button: every workspace header's Play goes to `SCR-PLAY` with the current `project` param, which already exists, so verify it.
   - Leaving Play returns to the previous workspace.
4. **States.** Connecting shows a loading state; a closed or failed socket shows an error with "Reconnect"; engine down uses the existing system state.

Verify: `pnpm -F desktop typecheck`, `pnpm -F desktop test`, Biome on changed files. Do **not** run `electron-vite build` or Playwright while the design suite runs.

## Integration (after both workstreams)

- `pnpm gen:pending` and `pnpm check`.
- App end-to-end test `tests/app/play.e2e.ts`:
  1. Create a parking car project and press Play.
  2. Within 10 s the canvas is visible, the senses panel lists 5 distance bars, and the frame time advances.
  3. Pick Add object and click in front of the car. The events list says an object was added.
  4. A distance bar drops.
  5. Push the box, and an event appears.
  6. Reset, and an event appears.
- The design suite on the Play routes; parity must hold in the gallery (prototype).
- A whole-branch review, then the fix pass, then the PR.
