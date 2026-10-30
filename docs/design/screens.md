# Screen catalog

Every screen, dialog, menu and state of the Icarus desktop app, with a stable identifier, its purpose, its modules and tabs, and every action. Identifiers are used in code, issues and tests: a module or tab ID maps to one folder or file in `apps/desktop/src/renderer/`. The mockup of each entry is listed.

The examples on screen (a car that parks, a dancer, a fruit fly) are sample data. Every label of the interface itself is generic and works for any world, body or brain.

## Contents

1. [Identifiers](#identifiers)
2. [Application shell](#application-shell)
3. [Modules and tabs](#modules-and-tabs)
4. [Use cases](#use-cases)
5. [Screens by flow](#screens-by-flow)
6. [Index](#index)

## Identifiers

| Prefix | Meaning |
|---|---|
| `SCR-` | Screen |
| `STA-` | State of a screen |
| `MOD-` | Modal dialog |
| `POP-` | Popover or menu |
| `SYS-` | System screen |
| `REF-` | Design reference |
| `HDR-` | Header (shell) |
| `PNL-` | Panel module, one folder in code |
| `TAB-` | Tab inside a panel, one file in code |
| `UC-` | Use case |

Rules: IDs never change once used in code; a new variant gets a new ID; a *state* (`STA-`) is the same route as its parent with different content, so it shares the parent's modules.

## Application shell

Two shells exist:

- **Launcher shell** (`HDR-LAUNCHER` + page): Home, Projects, Community, Creation, Profile and Settings. One column, max content width, no chat.
- **Workspace shell** (`HDR-WORKSPACE` + three columns): left column 270 px (Explorer over Inspector, or the workspace's own panels), center column flexible (Toolbar, Viewport and a bottom panel), right column 380 px (`PNL-CHAT`, always visible). Panels are dockable: the grip on each tab bar drags it to another dock. Play mode swaps the header for `HDR-PLAY` and the panels for Play panels.

Overlays: **modals** dim the screen (scrim 60%) and center a dialog; **popovers** dim lightly (35%) and anchor to the control that opened them. Closing returns to the screen underneath.

## Modules and tabs

Each module is a folder; each tab is a file inside it. Paths are relative to `apps/desktop/src/renderer/`.

### `HDR-WORKSPACE` Workspace header

Top bar of every project workspace. Always visible while a project is open. Folder: `app/shell/workspace-header/`.

- Native window controls (see the style guide's window frame), then the **project name** with a chevron that opens `POP-PROJECT-MENU`.
- **Workspace switcher**: segmented tabs `World · Body · Motion · Brain · Train · Results · Build` plus `+` to add a workspace. Tabs depend on the project: `Motion` only exists when the body is a character with motion clips.
- **Play** button: enters `SCR-PLAY` for the current project. Disabled (35% opacity, tooltip *Available once the project exists*) until a design exists.
- **Guide** pill: shows *Getting started n/5* while the guide is active, or *Guide* when hidden; opens the guide (`STA-WORLD-EMPTY`).
- **Share** opens `MOD-SHARE`. The **primary action** is always the next step of the project: *Train* → `MOD-START-TRAINING`, *Stop* while training → `MOD-STOP-RUN`, *Publish* in Build → `MOD-PUBLISH`, *Train copy* in Motion → `MOD-MOTION-TRAIN`, *Run test* for reference brains. Disabled before a design exists.

### `HDR-LAUNCHER` Launcher header

Top bar of the pages outside a project: Home, Projects, Community, Profile, Settings. Folder: `app/shell/launcher-header/`.

- Logo, nav links **Home** (`SCR-HOME`), **Projects** (`SCR-PROJECTS`), **Community** (`SCR-COMMUNITY`); the active one is underlined.
- **Search creations** field → `SCR-COMMUNITY` with results. **Bell** with an unread dot → `POP-NOTIFICATIONS`. **Avatar** → `SCR-PROFILE` (signed out: `MOD-SIGN-IN`).

### `HDR-PLAY` Play header

Replaces the workspace header while playing. Folder: `features/play/play-header/`.

- Green status pill *Playing · nothing you do here changes the project*.
- **Stop** returns to the workspace Play was started from. **Record** saves a clip and opens it in `SCR-TIMELAPSE`.

### `PNL-EXPLORER` Explorer

Left column, top. The project's scene tree. Folder: `editor/explorer/`. Used in: `MOD-AUTO-RIG`, `MOD-BRAIN-SOURCE`, `MOD-DELETE-PROJECT`, `MOD-DUPLICATE`, `MOD-EXPORT-ANIMATION`, `MOD-HISTORY`, `MOD-IMPORT`, `MOD-MOTION-TRACKING`, `MOD-MOTION-TRAIN`, `MOD-MOTION-VIDEO`, `MOD-RENAME`, `MOD-SHARE`, `POP-PROJECT-MENU`, `POP-TRAINING-COPIES`, `SCR-BODY`, `SCR-MOTION`, `SCR-WORLD`, `STA-BODY-CHECK-FAILED`, `STA-BRAIN-CONNECTOME`, `STA-MOTION-TRAINING`, `STA-WORLD-BUILDING`, `STA-WORLD-EMPTY`, `STA-WORLD-EMPTY-NOGUIDE`, `STA-WORLD-PROPOSAL`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-EXPLORER` | Explorer · Rig · Clip | `explorer-tab.tsx` | Tree of everything in the project, grouped in sections (Workspace, World, Agents; Skeleton, Physics; Clip, Character, Exports; Body, Brain). Each row: component icon, name, short meta (count, kind, state). Proposed items show in blue. The label adapts to the workspace: *Explorer* in World and Brain, *Rig* in Body, *Clip* in Motion. | Select (fills `PNL-INSPECTOR` and highlights in the viewport), multi-select, drag to reparent, right-click for rename, duplicate, delete and *Ask the copilot*. `+` in the tab bar adds an object. |

- One tab only: imported files live in the Library (`PNL-LIBRARY` › My files).

### `PNL-INSPECTOR` Inspector

Left column, bottom. Edits whatever is selected. Folder: `editor/inspector/`. Used in: `MOD-AUTO-RIG`, `MOD-AUTOPILOT`, `MOD-BRAIN-SOURCE`, `MOD-DELETE-PROJECT`, `MOD-DUPLICATE`, `MOD-EXPORT-ANIMATION`, `MOD-HISTORY`, `MOD-IMPORT`, `MOD-MOTION-TRACKING`, `MOD-MOTION-TRAIN`, `MOD-MOTION-VIDEO`, `MOD-RENAME`, `MOD-SHARE`, `MOD-START-TRAINING`, `MOD-STOP-RUN`, `POP-PROJECT-MENU`, `POP-TRAINING-COPIES`, `SCR-BODY`, `SCR-BRAIN`, `SCR-MOTION`, `SCR-TRAIN`, `SCR-WORLD`, `STA-BODY-CHECK-FAILED`, `STA-BRAIN-CONNECTOME`, `STA-MOTION-TRAINING`, `STA-TRAIN-FAILED`, `STA-WORLD-BUILDING`, `STA-WORLD-EMPTY`, `STA-WORLD-EMPTY-NOGUIDE`, `STA-WORLD-PROPOSAL`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-PROPERTIES` | Properties | `properties-tab.tsx` | Selected item's title and subtitle, a filter field, then one collapsible section per component (Transform, Physics body, Joint, Motor, Sensor, Randomize per copy…) or per settings group (Practice, Expert settings). Every row uses one of the 12 property types (see `REF-PROPERTY-TYPES`). | Edit values with the control of their type, drag names to scrub, right-click to reset or ask the copilot, `···` for component actions, **+ Add component** (objects only) → `POP-ADD-COMPONENT`. |

- Expert settings (algorithm, learning rate, network) are a collapsed section, never a separate screen.
- Runs, brains and motion settings use the inspector without *Add component*: only scene objects have components.

### `PNL-VIEWPORT` Viewport

Center column. The 3D view with a workspace toolbar on top. Folder: `editor/viewport/`. Used in: `MOD-AUTO-RIG`, `MOD-AUTOPILOT`, `MOD-BRAIN-SIZES`, `MOD-BRAIN-SOURCE`, `MOD-DELETE-PROJECT`, `MOD-DUPLICATE`, `MOD-HISTORY`, `MOD-IMPORT`, `MOD-MOTION-VIDEO`, `MOD-RENAME`, `MOD-SHARE`, `MOD-START-TRAINING`, `MOD-STOP-RUN`, `POP-PROJECT-MENU`, `POP-TRAINING-COPIES`, `SCR-BODY`, `SCR-BRAIN`, `SCR-PLAY`, `SCR-TRAIN`, `SCR-WORLD`, `STA-BODY-CHECK-FAILED`, `STA-BRAIN-CONNECTOME`, `STA-BRAIN-NETWORK`, `STA-TRAIN-FAILED`, `STA-WORLD-BUILDING`, `STA-WORLD-EMPTY`, `STA-WORLD-EMPTY-NOGUIDE`, `STA-WORLD-PROPOSAL`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-SCENE` | Scene | `scene-tab.tsx` | Editable 3D view of the world with gizmo, orientation cube, selection outlines, sensor rays and copilot ghosts (blue). | Orbit, select, move/rotate/scale, use the toolbar tools. |
| `TAB-GAME-VIEW` | Game view | `game-view-tab.tsx` | The world through the project camera, without editing chrome. | Look only. |
| `TAB-RIG-VIEW` | Rig | `rig-tab.tsx` | Body workspace: see-through mesh with bones, joints and colliders. | Select bones and joints, drag joint limits. |
| `TAB-MESH-VIEW` | Mesh | `mesh-tab.tsx` | Body workspace: the shaded mesh only. | Look, paint weights. |
| `TAB-LIVE-TRAINING` | Live training | `live-training-tab.tsx` | Train workspace: all parallel copies training, with the current checkpoint card and a scrubber. | Pick a copy, scrub the latest episode. |
| `TAB-REPLAY` | Replay | `replay-tab.tsx` | Train workspace: replay of any recorded rollout. | Play, scrub, change speed. |
| `TAB-NETWORK` | Network | `network-tab.tsx` | Brain network view: the body with its sensors wired into a live diagram of the network. | Hover neurons for an explanation; switch Live / checkpoint. |
| `TAB-PLAY` | Play | `play-tab.tsx` | Play mode view with the floating Play tool bar and a status card. | Use Play tools; click in the world to apply the selected tool. |
| `TAB-AGENT-VIEW` | Agent view · Game view | `agent-view-tab.tsx` | Play mode: what the agent's own camera sees, or the project camera. | Look only. |

- `+` adds another view (split). The right side of the tab bar holds view options: *Lit*, *Perspective*, speed.

### `PNL-TOOLBAR` Workspace toolbar

Strip above the viewport. Icon + label buttons in groups. The selected tool is white. Folder: `editor/viewport/toolbar/`.

- **World**: Terrain, Paint, Props · Sky, Light, Camera · Copies, Randomize (→ `POP-TRAINING-COPIES`) · Import world (→ `MOD-IMPORT`).
- **New project**: Terrain, Sky, Light · Part, Agent (→ `SCR-IDEAS`), Goal · Import.
- **Body**: Import, Auto-rig · Bone, Joint, Motor, Sensor · Mirror, Collider, Weights · Test pose.
- **Brain**: Senses (rays overlay), Network (→ `STA-BRAIN-NETWORK`). Connectome brains: Neurons, Connections, Regions · Senses map, Motor map.
- **Train**: Train, Pause (→ `MOD-STOP-RUN`), Stop · Timelapse · Autopilot (→ `MOD-AUTOPILOT`).
- **Motion**: Video (→ `MOD-MOTION-VIDEO`), Detect pose (→ `MOD-MOTION-TRACKING`), Retarget · Trim · Export (→ `MOD-EXPORT-ANIMATION`).
- **Play** (floating bar): core tools *Move, Push, Add object, Light, Wind, Slow, Reset* for every project, plus tools derived from the body's senses (*Shadow* for vision, *Scent* for smell, *Shuffle* for randomized worlds).

### `PNL-LIBRARY` Library

Center column, bottom strip in World. Ready-made pieces to drag into the world. Folder: `features/world-studio/library/`. Used in: `MOD-DELETE-PROJECT`, `MOD-DUPLICATE`, `MOD-HISTORY`, `MOD-MOTION-VIDEO`, `MOD-RENAME`, `MOD-SHARE`, `POP-PROJECT-MENU`, `POP-TRAINING-COPIES`, `SCR-WORLD`, `STA-WORLD-EMPTY`, `STA-WORLD-EMPTY-NOGUIDE`, `STA-WORLD-PROPOSAL`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-LIBRARY` | Library | `library-tab.tsx` | Built-in environments, props, agents and bodies as cards with a 3D thumbnail. Last card: dashed *Import a model or environment*. | Drag into the viewport, click to preview, Import → `MOD-IMPORT`. |
| `TAB-LIBRARY-COMMUNITY` | Community | `community-tab.tsx` | Pieces published by others (worlds, bodies, brains), safe data only. | Drag in (creates a remix link), open its page → `SCR-CREATION`. |
| `TAB-MY-FILES` | My files | `my-files-tab.tsx` | Files this user imported: models, environments, videos. | Drag in, rename, delete. |

- *Search assets* on the right filters the current tab.

### `PNL-CHAT` Copilot

Right column, always present in workspaces. Folder: `features/copilot/`. Used in: `MOD-AUTO-RIG`, `MOD-AUTOPILOT`, `MOD-BRAIN-SIZES`, `MOD-BRAIN-SOURCE`, `MOD-DELETE-PROJECT`, `MOD-DUPLICATE`, `MOD-EXPORT-ANIMATION`, `MOD-EXPORT-BRAIN`, `MOD-HISTORY`, `MOD-IMPORT`, `MOD-MOTION-TRACKING`, `MOD-MOTION-TRAIN`, `MOD-MOTION-VIDEO`, `MOD-PUBLISH`, `MOD-PUBLISHED`, `MOD-RENAME`, `MOD-SHARE`, `MOD-START-TRAINING`, `MOD-STOP-RUN`, `POP-PROJECT-MENU`, `POP-TRAINING-COPIES`, `SCR-BODY`, `SCR-BRAIN`, `SCR-BUILD`, `SCR-IDEAS`, `SCR-MOTION`, `SCR-PLAY`, `SCR-RESULTS`, `SCR-TRAIN`, `SCR-WORLD`, `STA-BODY-CHECK-FAILED`, `STA-BRAIN-CONNECTOME`, `STA-BRAIN-NETWORK`, `STA-BUILD-HARDWARE`, `STA-MOTION-TRAINING`, `STA-RESULTS-FAILURES`, `STA-RESULTS-REFERENCE`, `STA-TRAIN-FAILED`, `STA-WORLD-BUILDING`, `STA-WORLD-EMPTY`, `STA-WORLD-EMPTY-NOGUIDE`, `STA-WORLD-PROPOSAL`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-CHAT` | Chat | `chat-tab.tsx` | The conversation: user bubbles (white, right), copilot bubbles (grey, left) with check lists, inline actions and proposal cards. Suggestion chips above the composer. Composer with attach (+), autonomy mode (*Ask before changes* / Autopilot) and send. | Type, send, click chips (they send that message), click inline actions (Apply, Discard, Train the spin…). |
| `TAB-HISTORY` | History | `history-tab.tsx` | Every revision of the project, by the user or the copilot, with what changed. Opens as `MOD-HISTORY`. | Restore any revision (creates a new one). |

- Copilot proposals never change the project until applied; they are previewed in blue in the viewport (`STA-WORLD-PROPOSAL`).

### `PNL-IDEAS` Ideas

Center panel of `SCR-IDEAS`. Folder: `features/copilot/ideas/`. Used in: `SCR-IDEAS`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-IDEAS` | Ideas | `ideas-tab.tsx` | Three generated alternatives, each a real 3D preview with World, Body, Learns and estimated training time. One is marked *Recommended*. A filter switches between whole ideas, worlds only and bodies only. A *Mix them* bar combines parts. | Use this, Tweak, Mix and build. |
| `TAB-IDEAS-SCENE` | Scene | `ideas-scene-tab.tsx` | The highlighted idea in the full 3D viewport. | Orbit, look. |


### `PNL-RIG-CHECK` Rig check

Center, bottom panel in Body. Folder: `features/body-studio/rig-check/`. Used in: `MOD-AUTO-RIG`, `SCR-BODY`, `STA-BODY-CHECK-FAILED`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-RIG-CHECK` | Rig check | `rig-check-tab.tsx` | Physics checks of the body: joints and motors present, stands in a test, colliders, joint ranges. Pass in green, problems in amber. | Click a problem to select the part. |
| `TAB-POSE-TEST` | Pose test | `pose-test-tab.tsx` | Preset poses (T-pose, A-pose, frame from video) to feel joint limits. | Apply a pose to the viewport. |
| `TAB-WEIGHTS` | Weights | `weights-tab.tsx` | Skin weights per bone for imported meshes. | Paint, auto-fix. |


### `PNL-SENSES-ACTIONS` Senses and actions

Left column, top, in Brain (learned brains). Folder: `features/brain-studio/senses-actions/`. Used in: `MOD-START-TRAINING`, `SCR-BRAIN`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-WHAT-IT-SEES` | What it sees | `what-it-sees-tab.tsx` | Every input the brain receives, with a switch, a name and a plain description. Inputs proposed by the copilot are blue and off. | Turn inputs on or off; `+` adds a sensor input. |
| `TAB-WHAT-IT-CAN-DO` | What it can do | `what-it-can-do-tab.tsx` | Every output: motors, steering, throttle, with ranges. | Turn outputs on or off, limit ranges. |


### `PNL-LEARNING` Learning

Center, bottom panel in Brain. Folder: `features/brain-studio/learning/`. Used in: `MOD-START-TRAINING`, `SCR-BRAIN`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-REWARD` | Reward | `reward-tab.tsx` | One card per reward term: name, plain description, signed weight and slider. Penalties in red or amber. | Drag weights; the copilot's proposed changes show in blue (*1 change proposed*). |
| `TAB-GOAL` | Goal | `goal-tab.tsx` | What success means and when an episode ends. | Edit success condition and time limit. |
| `TAB-CURRICULUM` | Curriculum | `curriculum-tab.tsx` | Stages that make the task harder as the brain improves. | Add, reorder and edit stages. |


### `PNL-BRAIN-SHAPE` Brain shape

Left column in the network view. Folder: `features/brain-studio/brain-shape/`. Used in: `MOD-BRAIN-SIZES`, `STA-BRAIN-NETWORK`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-SHAPE` | Shape | `shape-tab.tsx` | Layers and neurons as sliders, decisions per second, a hint about speed on this computer, episode rules as switches. | Change sizes, *+ Add a layer* → `MOD-BRAIN-SIZES`. |


### `PNL-BRAIN-ACTIVITY` Brain activity

Center, bottom panel for connectome brains, and in Play. Folder: `features/brain-studio/brain-activity/`. Used in: `MOD-BRAIN-SOURCE`, `SCR-PLAY`, `STA-BRAIN-CONNECTOME`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-BRAIN-ACTIVITY` | Brain activity | `brain-activity-tab.tsx` | Neuron groups as clusters of dots, active neurons lit red, labelled by region. *● live* while simulating. | Hover a region for an explanation; click to select. |
| `TAB-BEHAVIORS` | Behaviors | `behaviors-tab.tsx` | Behaviors observed so far (walk, turn, groom) with when they happened. | Jump to the moment. |
| `TAB-WIRING` | Wiring | `wiring-tab.tsx` | How sensory and motor neurons connect to the body (senses map, motor map). | Fix unmatched neurons. |


### `PNL-RUNS` Runs

Left column, top, in Train. Folder: `features/timeline/runs/`. Used in: `MOD-AUTOPILOT`, `MOD-STOP-RUN`, `SCR-TRAIN`, `STA-TRAIN-FAILED`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-RUNS` | Runs | `runs-tab.tsx` | Every training run with status (● percent, done, stopped, failed) and a one-line result. | Select a run; `+` → `MOD-START-TRAINING`. |


### `PNL-METRICS` Metrics

Center, bottom panel in Train. Folder: `features/timeline/metrics/`. Used in: `MOD-AUTOPILOT`, `MOD-STOP-RUN`, `SCR-TRAIN`, `STA-TRAIN-FAILED`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-METRICS` | Metrics | `metrics-tab.tsx` | Mean reward and failure-rate charts with change chips, and the reward breakdown by term. Right side: steps done and speed. | Hover for values. |
| `TAB-CONSOLE` | Console | `console-tab.tsx` | Timestamped log of the run and the engine. | Copy, filter. |


### `PNL-RESULT-RUNS` Result runs

Left column, top, in Results. Folder: `features/timeline/result-runs/`. Used in: `SCR-RESULTS`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-RESULT-RUNS` | Runs | `result-runs-tab.tsx` | Runs with a checkbox to compare and their score. | Pick two runs (*Compare 2*). |
| `TAB-BEST-BRAINS` | Best brains | `best-brains-tab.tsx` | The best checkpoint of each run. | Use a brain, export it. |


### `PNL-SUMMARY` Summary

Left column, bottom, in Results. Folder: `features/timeline/summary/`. Used in: `SCR-RESULTS`, `STA-RESULTS-FAILURES`, `STA-RESULTS-REFERENCE`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-SUMMARY` | Summary | `summary-tab.tsx` | Best brain so far, key scores with bars, or the overall match for reference brains. | Use this brain (→ `SCR-BUILD`), Keep training (→ `SCR-TRAIN`). |
| `TAB-NOTES` | Notes | `notes-tab.tsx` | Free notes about the run, by the user or the copilot. | Write notes. |


### `PNL-RESULTS-VIEW` Results view

Center panel in Results. Folder: `features/timeline/results-view/`. Used in: `SCR-RESULTS`, `STA-RESULTS-FAILURES`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-COMPARE` | Compare | `compare-tab.tsx` | Two runs side by side on the same seed, each with its score chips. | Play both, scrub together. |
| `TAB-WHERE-IT-FAILS` | Where it fails | `where-it-fails-tab.tsx` | Replay of a failing test run with the copilot's vision annotations (dashed circle, path, explanation card) and a scrubber. | Play, step through failing runs. |
| `TAB-TIMELAPSE` | Timelapse | `timelapse-tab.tsx` | Opens `SCR-TIMELAPSE`. | — |


### `PNL-LEARNED` How it learned

Center, bottom strip in Results. Folder: `features/timeline/learned/`. Used in: `SCR-RESULTS`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-HOW-IT-LEARNED` | How it learned | `how-it-learned-tab.tsx` | Checkpoint cards with a thumbnail and score, future checkpoints greyed with an ETA. Right side: *● Training* and *▶ Timelapse*. | Click a checkpoint → `SCR-TIMELAPSE` at that point. |


### `PNL-FAILURES` Failures

Left column, top, in `STA-RESULTS-FAILURES`. Folder: `features/timeline/failures/`. Used in: `STA-RESULTS-FAILURES`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-FAILURES` | Failures | `failures-tab.tsx` | Failure groups found by the copilot, each with a thumbnail and how many test runs it covers. | Select a group to replay it. |
| `TAB-ALL-TEST-RUNS` | All test runs | `all-test-runs-tab.tsx` | Every evaluation episode with pass or fail. | Replay any episode. |


### `PNL-MOTION-COMPARE` Motion compare

Center panel in Motion. Tabs are view modes. Folder: `features/motion-studio/compare/`. Used in: `MOD-EXPORT-ANIMATION`, `MOD-MOTION-TRACKING`, `MOD-MOTION-TRAIN`, `SCR-MOTION`, `STA-MOTION-TRAINING`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-SIDE-BY-SIDE` | Side by side | `side-by-side-tab.tsx` | Reference video with tracked skeleton on the left, the physics character on the right with its match score. | Play, change speed (0.5×, 1×). |
| `TAB-OVERLAY` | Overlay | `overlay-tab.tsx` | Character drawn over the video. | Same controls. |
| `TAB-REFERENCE-ONLY` | Reference only | `reference-only-tab.tsx` | Only the video and its skeleton. | Same controls. |


### `PNL-CLIP-TIMELINE` Clip timeline

Center, bottom panel in Motion. Folder: `features/motion-studio/clip-timeline/`. Used in: `MOD-EXPORT-ANIMATION`, `MOD-MOTION-TRACKING`, `MOD-MOTION-TRAIN`, `SCR-MOTION`, `STA-MOTION-TRAINING`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-CLIP` | Clip | `clip-tab.tsx` | Pose frames along the clip, the current one highlighted, and the match curve with a playhead. Right side: the lowest match moment. | Scrub, select a range to focus training. |
| `TAB-MATCH-SCORE` | Match score | `match-score-tab.tsx` | Match per body part over time. | Find weak parts. |


### `PNL-BUILD-TARGETS` Build targets

Left column in Build. Folder: `features/build/targets/`. Used in: `MOD-EXPORT-BRAIN`, `MOD-PUBLISH`, `MOD-PUBLISHED`, `SCR-BUILD`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-BUILD` | Build | `build-tab.tsx` | What to do with the project: Share to community, Export brain, Run on real hardware, Use in a game, Export animation (characters only). | Each item opens its view or dialog. |


### `PNL-BUILD-TARGET-VIEW` Build target view

Center panel in Build. Its title is the selected target. Folder: `features/build/target-view/`. Used in: `MOD-EXPORT-BRAIN`, `MOD-PUBLISH`, `MOD-PUBLISHED`, `SCR-BUILD`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-SHARE-TO-COMMUNITY` | Share to community | `share-to-community-tab.tsx` | Title, description, what people can do (remix, download brain, retrain, commercial use), what is included, and the preview card. | Save draft, Publish to community → `MOD-PUBLISH`. |

- Other targets render their own view here: *Run on real hardware* → `STA-BUILD-HARDWARE`.

### `PNL-PLAY-SENSES` What it senses

Left column in Play. Folder: `features/play/senses/`. Used in: `SCR-PLAY`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-WHAT-IT-SENSES` | What it senses | `what-it-senses-tab.tsx` | Every sense of the body as a live bar with its value. Built from the body's sensor components, so any body works. | Look; hover for meaning. |


### `PNL-PLAY-DECISIONS` What it decides

Left column in Play (learned brains). Folder: `features/play/decisions/`. Used in: `SCR-PLAY`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-WHAT-IT-DECIDES` | What it decides | `what-it-decides-tab.tsx` | Live outputs of the brain and which brain is playing. | Use another brain → `SCR-RESULTS`. |


### `PNL-PLAY-VISION` Vision

Left column in Play, only when the body has a vision sensor. Folder: `features/play/vision/`. Used in: `SCR-PLAY`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-VISION` | Vision | `vision-tab.tsx` | What each eye or camera sees (compound eyes as hexagons, cameras as images). | Look. |


### `PNL-PLAY-EVENTS` What happened

Center, bottom, in Play. Folder: `features/play/events/`. Used in: `SCR-PLAY`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-WHAT-HAPPENED` | What happened | `what-happened-tab.tsx` | Timestamped log of behavior and of what the user did. | Click a line to jump there in the recording. |


### `PNL-REFERENCE-TESTS` Behavior tests

Left column in `STA-RESULTS-REFERENCE`. Folder: `features/timeline/reference-tests/`. Used in: `STA-RESULTS-REFERENCE`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-BEHAVIOR-TESTS` | Behavior tests | `behavior-tests-tab.tsx` | Tests against recorded real behavior, with pass, warning or *not run*. | Select a test; `+` adds one. |
| `TAB-RECORDINGS` | Recordings | `recordings-tab.tsx` | Reference recordings imported for comparison. | Import, remove. |


### `PNL-REFERENCE-VIEW` Reference view

Center panel in `STA-RESULTS-REFERENCE`. One tab per behavior test. Folder: `features/timeline/reference-view/`. Used in: `STA-RESULTS-REFERENCE`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-REFERENCE-TEST` | ‹test name› | `reference-test-tab.tsx` | Recorded behavior and the simulated one side by side, for example walking paths in an arena. | Play, switch test. |


### `PNL-REFERENCE-MATCH` Behavior match

Center, bottom, in `STA-RESULTS-REFERENCE`. Folder: `features/timeline/reference-match/`. Used in: `STA-RESULTS-REFERENCE`.

| Tab | Label | File | Shows | User can |
|---|---|---|---|---|
| `TAB-BEHAVIOR-MATCH` | Behavior match | `behavior-match-tab.tsx` | Table: behavior, recorded value, simulated value, *close* or *off*. | Sort, open a test. |
| `TAB-NEURONS` | Neurons | `neurons-tab.tsx` | Which neurons drive each behavior. | Select neurons. |


## Use cases

### `UC-01` Create a project from a sentence

A beginner describes an idea and gets a working project without touching any tool.

1. `SCR-HOME` Home — Type the idea in the hero field and press enter
2. `SCR-IDEAS` Ideas — Compare three real 3D ideas, pick one or mix parts
3. `STA-WORLD-BUILDING` World · building — Watch the world and body appear while physics checks run
4. `SCR-WORLD` World workspace — The project opens, ready to play or train

### `UC-02` Start from a template

Skip generation and open a ready-made project.

1. `SCR-HOME` Home — Click a *Start from* card
2. `SCR-WORLD` World workspace — The template opens as a new project

### `UC-03` Start empty and build by hand

An expert starts from a default workspace.

1. `SCR-HOME` Home — Empty world card, or Projects › New project
2. `STA-WORLD-EMPTY` World · new project with guide — Default terrain, sky, light, camera and spawn point; non-linear guide
3. `STA-WORLD-EMPTY-NOGUIDE` World · new project, guide hidden — Hide the guide; it stays one click away in the header

### `UC-04` Bring your own model

Import any model or robot and make it physical.

1. `MOD-IMPORT` Import — Pick model, environment or robot file
2. `MOD-AUTO-RIG` Auto-rig progress — Bones, joints, masses and motors are estimated
3. `STA-BODY-CHECK-FAILED` Body · physics check failed — If the physics check fails, the copilot fixes it
4. `SCR-BODY` Body workspace — Edit any bone, joint or motor in the inspector

### `UC-05` Edit anything with components

Every object, built-in or imported, is edited the same way.

1. `PNL-INSPECTOR` Inspector — Select an object; its components appear
2. `POP-ADD-COMPONENT` Components and Add component — Add physics, senses, motors, randomization or a brain
3. `REF-PROPERTY-TYPES` Property types — Every property uses the control of its type

### `UC-06` Change something by asking

The copilot proposes, the user approves.

1. `PNL-CHAT` Copilot — Ask for a change or click a suggestion
2. `STA-WORLD-PROPOSAL` World · copilot proposal preview — Preview of the change in blue, with the list of differences
3. `SCR-WORLD` World workspace — Apply creates a revision; Discard leaves nothing

### `UC-07` Play with it

Test any project live without training.

1. `HDR-WORKSPACE` Workspace header — Press Play
2. `SCR-PLAY` Play — Use Play tools; senses, decisions and events update live
3. `SCR-TIMELAPSE` Timelapse presentation — Record a clip to keep or share

### `UC-08` Train and watch it learn

Run reinforcement learning and follow it.

1. `SCR-BRAIN` Brain workspace — Check what it sees, what it can do and the reward
2. `MOD-BRAIN-SIZES` Brain sizes — Optionally pick a brain size
3. `MOD-START-TRAINING` Start training — Confirm steps, copies and time estimate
4. `SCR-TRAIN` Train workspace — Watch live copies, metrics and the copilot's coaching
5. `MOD-AUTOPILOT` Autopilot — Let the copilot fix things on its own, or ask first

### `UC-09` Understand and fix failures

Know why it fails and fix it.

1. `SCR-RESULTS` Results workspace — Compare runs on the same seed
2. `STA-RESULTS-FAILURES` Results · where it fails — The copilot groups failures and explains them with vision
3. `SCR-BRAIN` Brain workspace — Apply the fix as a new revision and train again

### `UC-10` Copy motion from a video

A character learns to move like a person in a video.

1. `MOD-MOTION-VIDEO` Copy motion from a video — Upload, link or record; trim; choose who to copy and onto which character
2. `MOD-MOTION-TRACKING` Tracking the motion — Pose is tracked frame by frame
3. `SCR-MOTION` Motion workspace — Compare reference and physics character
4. `MOD-MOTION-TRAIN` Train the copy — Train the copy, focusing on hard moments
5. `STA-MOTION-TRAINING` Motion · training the copy — Follow match and balance
6. `MOD-EXPORT-ANIMATION` Export animation — Export the physics result

### `UC-11` Run a real brain map

Drive a body with a connectome instead of a trained network.

1. `MOD-BRAIN-SOURCE` Choose the brain source — Choose *Load a connectome* and check how neurons map to the body
2. `STA-BRAIN-CONNECTOME` Brain · connectome — See wiring and activity; no training
3. `SCR-PLAY` Play — Poke it with Play tools and watch its brain
4. `STA-RESULTS-REFERENCE` Results · compare with recordings — Compare its behavior with real recordings

### `UC-12` Share, publish and remix

Get the creation to other people.

1. `MOD-SHARE` Share — Private link and collaborators
2. `SCR-BUILD` Build workspace — Prepare the community page
3. `MOD-PUBLISH` Publish to the community — Agree to guidelines and publish
4. `MOD-PUBLISHED` Sent for review — Automatic review, then public
5. `SCR-CREATION` Creation page — Others watch, vote and remix

### `UC-13` Take it out of Icarus

Use the brain or motion elsewhere.

1. `MOD-EXPORT-BRAIN` Export brain — ONNX, TorchScript or game engine format
2. `STA-BUILD-HARDWARE` Build · real hardware — Parts list, connect, calibrate, test drive and load the brain on a real device
3. `MOD-EXPORT-ANIMATION` Export animation — Animation files for game engines

### `UC-14` Manage projects

Find, rename, duplicate, restore and delete.

1. `SCR-PROJECTS` Projects — All local projects with status
2. `POP-PROJECT-MENU` Project menu — Rename, duplicate, history, open, settings, delete
3. `MOD-HISTORY` History — Restore a revision
4. `MOD-DELETE-PROJECT` Delete project — Confirm deletion

### `UC-15` Community and safety

Browse, report and moderate.

1. `SCR-COMMUNITY` Community — Browse by category and sort
2. `SCR-CREATION` Creation page — Watch how it learned, remix
3. `MOD-REPORT` Report a creation — Report and optionally block
4. `SCR-MODERATION` Moderation (team tool) — The team reviews reports

### `UC-16` Account and settings

Sign in only when sharing; configure the app.

1. `MOD-SIGN-IN` Sign in — Google, GitHub or email
2. `SCR-PROFILE` Profile — Public profile and signature
3. `SCR-SETTINGS-MODELS` Settings · AI models — AI connections per capability
4. `SCR-SETTINGS-TRAINING` Settings · training and hardware — CPU threads, folders, engine

### `UC-17` Recover from problems

Errors never lose work.

1. `STA-TRAIN-FAILED` Train · run failed — A run stops; the reason and the last good brain are shown
2. `STA-BODY-CHECK-FAILED` Body · physics check failed — Training is blocked until physics checks pass
3. `SYS-ENGINE-DOWN` Engine stopped — The engine stopped; restart it

## Screens by flow

Order follows the main flows. For each entry: kind, parent, how you get there, purpose, content, then regions with their modules and every action.

### Create from a sentence · Park Pilot

#### `SCR-HOME` Home

- **Kind:** Screen
- **Mockup:** *Home* (`Main`)
- **Reached from:** `MOD-IMPORT`, `POP-PROJECT-MENU`, `SCR-SETTINGS-MODELS`, `SYS-ENGINE-DOWN` · also from every workspace header
- **Purpose:** Launcher and front door. Gets a beginner from a sentence to a project in one step, and shows what the community makes.
- **Content:**
  - Hero with a live 3D scene behind it, the headline, a subtitle and a prompt field with a send button. Under the field: *Press enter to see 3 ideas →*.
  - **Start from**: template cards (empty world, examples from the library) and a dashed *Import your own* card.
  - **From the community**: Featured / Recent / Most voted switch, four creation cards with thumbnail, votes, author and a *Remix* pill, and *View all*.
- **Note:** Template cards open the template as a new project. The prototype opens the same example project for every vehicle and robot template.
- **Header:** `HDR-LAUNCHER` · active: **Home**
- **Page:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Page | Press enter to see 3 ideas → | Button or link | → `SCR-IDEAS` Ideas |
| Page | Empty world Terrain, sky and camera ready | Button or link | → `STA-WORLD-EMPTY-NOGUIDE` World · new project, guide hidden |
| Page | Parking car Learns to park with sensors | Button or link | → `SCR-WORLD` World workspace |
| Page | Walker robot Learns to walk and jump | Button or link | → `SCR-WORLD` World workspace |
| Page | Dancer Copies a video | Button or link | → `MOD-MOTION-VIDEO` Copy motion from a video |
| Page | Fruit fly A real fly brain in a fly body | Button or link | → `MOD-BRAIN-SOURCE` Choose the brain source |
| Page | Import your own Model, robot or environment | Button or link | → `MOD-IMPORT` Import |
| Page | Featured | Button or link | → `SCR-COMMUNITY` Community |
| Page | Recent | Button or link | → `SCR-COMMUNITY` Community |
| Page | Most voted | Button or link | → `SCR-COMMUNITY` Community |
| Page | View all | Button or link | → `SCR-COMMUNITY` Community |
| Page | 2.3k Valet Bot by mara · 2.3k votes Remix | Button or link | → `SCR-CREATION` Creation page |
| Page | 1.8k Stair Tripod by kenji · 1.8k votes Remix | Button or link | → `SCR-CREATION` Creation page |
| Page | 1.4k Salsa Dancer by lu · 1.4k votes Remix | Button or link | → `SCR-CREATION` Creation page |
| Page | 960 Lot Swarm by dev_ana · 960 votes Remix | Button or link | → `SCR-CREATION` Creation page |

#### `SCR-IDEAS` Ideas

- **Kind:** Screen
- **Mockup:** *Three ideas to pick from* (`Proposals`)
- **Reached from:** `MOD-MOTION-VIDEO`, `SCR-HOME`, `STA-WORLD-BUILDING`, `STA-WORLD-EMPTY`, `STA-WORLD-EMPTY-NOGUIDE`
- **Purpose:** Before building anything, the copilot shows three different ways to make the idea, so the user chooses with their eyes instead of reading text.
- **Content:**
  - Each idea: real 3D preview, title, World / Body / Learns lines and estimated training time on this computer. The recommended one has a white outline and badge.
  - Filter *Whole idea · Worlds only · Bodies only* to mix parts. A bottom bar proposes a mix and builds it.
  - Chat explains how the ideas differ. Train and Play are disabled: there is no project yet.
- **Header:** `HDR-WORKSPACE` · project **Untitled project** · workspaces World · Body · Brain · Train · Results · Build (active: **World**) · Play → disabled · primary *Train* → disabled
- **Page:** `PNL-IDEAS` (**Ideas**, Scene)
- **Chat column:** `PNL-CHAT` (**Chat**, History)

| Region | Control | Type | Result |
|---|---|---|---|
| Page | Use this | Button or link | → `STA-WORLD-BUILDING` World · building |
| Page | Tweak | Button or link | Acts in place |
| Page | Mix and build | Button or link | → `STA-WORLD-BUILDING` World · building |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Make it at night | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Chat column | Use a bigger car | Chat suggestion | Acts in place |
| Chat column | Show 3 more | Chat suggestion | Acts in place |

#### `STA-WORLD-BUILDING` World · building

- **Kind:** State of a screen of `SCR-WORLD` World workspace
- **Mockup:** *Building it* (`Generating`)
- **Reached from:** `SCR-IDEAS`
- **Purpose:** The project is being generated. The user sees the world appear and can keep talking.
- **Content:**
  - Viewport shows the world as it is built, with a status pill (*Running physics checks…*).
  - Chat card *Building ‹project›* with a progress bar and the steps: understand, build world, build body, physics checks, goal and reward, ready.
  - Explorer fills in as objects are created. Inspector shows *Building…*.
  - *Open when ready* jumps to the finished world. Train and Play are disabled until the build finishes.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **World**) · Play → disabled · primary *Train* → disabled
- **Left column:** `PNL-EXPLORER` (**Explorer**); `PNL-INSPECTOR` (**Properties**)
- **Center column:** `PNL-VIEWPORT` (**Scene**, Game view) · toolbar: Terrain, Sky, Light
- **Chat column:** `PNL-CHAT` (**Chat**, History)

| Region | Control | Type | Result |
|---|---|---|---|
| Center column | Open when ready | Button or link | → `SCR-WORLD` World workspace |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Make it night time | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Chat column | Use a bigger car | Chat suggestion | → `SCR-IDEAS` Ideas |

#### `SCR-WORLD` World workspace

- **Kind:** Screen
- **Mockup:** *World* (`World`)
- **Reached from:** `MOD-DUPLICATE`, `MOD-HISTORY`, `MOD-IMPORT`, `MOD-RENAME`, `MOD-SHARE`, `MOD-SIGN-IN`, `POP-ADD-COMPONENT`, `POP-NOTIFICATIONS`, `POP-TRAINING-COPIES`, `SCR-HOME`, `SCR-PROJECTS`, `STA-HOME-EMPTY`, `STA-WORLD-BUILDING`, `STA-WORLD-PROPOSAL` · also from every workspace header
- **Purpose:** Edit the environment the agent lives and trains in.
- **Content:**
  - Explorer with Workspace (camera, terrain, sky, lighting), World objects and Agents.
  - Inspector for the selected object, here a world object duplicated for training: Training (copies, layout, randomize), Surface (material, friction).
  - Viewport with the World toolbar and the Library strip below.
  - Chat with the last change explained as a check list.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **World**) · Play → `SCR-PLAY` · primary *Train* → `MOD-START-TRAINING`
- **Left column:** `PNL-EXPLORER` (**Explorer**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Copies, Layout, Randomize, Material, Friction
- **Center column:** `PNL-VIEWPORT` (**Scene**, Game view); `PNL-LIBRARY` (**Library**, Community, My files) · toolbar: Terrain, Paint, Props, Sky, Light, Camera, Copies, Randomize, Import world
- **Chat column:** `PNL-CHAT` (**Chat**, History)

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | Positions, colors | Button or link | → `POP-TRAINING-COPIES` Training copies |
| Left column | + Add component | Button or link | → `POP-ADD-COMPONENT` Components and Add component |
| Center column | Copies | Tool | → `POP-TRAINING-COPIES` Training copies |
| Center column | Randomize | Tool | → `POP-TRAINING-COPIES` Training copies |
| Center column | Import world | Tool | → `MOD-IMPORT` Import |
| Center column | Import environment .glb .fbx .usd | Button or link | → `MOD-IMPORT` Import |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Add rain | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Chat column | Make the spots tighter | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Chat column | Night time | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |

#### `SCR-PLAY` Play

- **Kind:** Screen
- **Mockup:** *Play · test the car live* (`PlayCar`)
- **Reached from:** `MOD-BRAIN-SOURCE`, `STA-BRAIN-CONNECTOME` · also from every workspace header
- **Purpose:** Play mode: run the current brain live in its world and poke it, with no training and no changes to the project. The playground for beginners and the quick test for experts.
- **Content:**
  - Header replaced by `HDR-PLAY`.
  - Floating Play tool bar: core tools for every project plus tools derived from the body's senses. A note says *Tools follow its senses*.
  - Left: what it senses (live bars), and depending on the brain what it decides or what its eyes see.
  - Bottom: what happened (event log) and, for connectome brains, brain activity.
  - Status card on the viewport explains the current behavior in one line.
  - Chat answers *what is it doing?* and can turn a surprise into a training change.
- **Note:** Two examples are drawn: a learned brain (artboard *PlayCar*) and a connectome brain in a field with food (artboard *PlayFly*).
- **Header:** `HDR-PLAY` · Stop returns to the workspace · Record → `SCR-TIMELAPSE`
- **Left column:** `PNL-PLAY-SENSES` (**What it senses**); `PNL-PLAY-DECISIONS` (**What it decides**)
- **Center column:** `PNL-VIEWPORT` (**Play**, Agent view); `PNL-PLAY-EVENTS` (**What happened**) · toolbar: Move, Push, Add object, Light, Shuffle, Slow, Reset
- **Chat column:** `PNL-CHAT` (**Chat**, History)

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | Use another brain | Button or link | → `SCR-RESULTS` Results workspace |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Add to training | Button or link | → `POP-TRAINING-COPIES` Training copies |
| Chat column | Not now | Button or link | Acts in place |
| Chat column | Make it night | Chat suggestion | Acts in place |
| Chat column | Try 10 random lots | Chat suggestion | Acts in place |
| Chat column | Record this | Chat suggestion | → `SCR-TIMELAPSE` Timelapse presentation |

#### `SCR-BRAIN` Brain workspace

- **Kind:** Screen
- **Mockup:** *Brain* (`Brain`)
- **Reached from:** `MOD-MOTION-VIDEO`, `MOD-START-TRAINING`, `STA-RESULTS-FAILURES`, `STA-WORLD-EMPTY`, `STA-WORLD-EMPTY-NOGUIDE` · also from every workspace header
- **Purpose:** Decide what the agent perceives, what it can do and what it is rewarded for. Beginners stay at the top; expert settings are collapsed.
- **Content:**
  - Left: What it sees / What it can do with switches; copilot proposals in blue.
  - Inspector: Practice (steps, parallel copies) and Expert settings (method, network, learning rate). A copilot-proposed value shows in blue with Accept.
  - Viewport with the sensor rays and a *What the brain sees now* card with live readings and the resulting decision.
  - Bottom: Reward / Goal / Curriculum. *1 change proposed* in blue.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **Brain**) · Play → `SCR-PLAY` · primary *Train* → `MOD-START-TRAINING`
- **Left column:** `PNL-SENSES-ACTIONS` (**What it sees**, What it can do); `PNL-INSPECTOR` (**Properties**) · inspector rows: Steps, Parallel copies, Method, Network, Learning rate
- **Center column:** `PNL-VIEWPORT` (**Scene**, Game view); `PNL-LEARNING` (**Reward**, Goal, Curriculum) · toolbar: Senses, Network
- **Chat column:** `PNL-CHAT` (**Chat**, History)

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | 2 layers · 256 | Button or link | → `MOD-BRAIN-SIZES` Brain sizes |
| Center column | Network | Tool | → `STA-BRAIN-NETWORK` Brain · network view |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Explain the reward | Chat suggestion | → `STA-BRAIN-NETWORK` Brain · network view |
| Chat column | Make it faster | Chat suggestion | → `MOD-BRAIN-SIZES` Brain sizes |
| Chat column | Reset to default | Chat suggestion | Acts in place |

#### `MOD-BRAIN-SIZES` Brain sizes

- **Kind:** Modal dialog of `STA-BRAIN-NETWORK` Brain · network view
- **Mockup:** *Brain sizes* (`BrainOptions`)
- **Reached from:** `MOD-START-TRAINING`, `REF-PROPERTY-TYPES`, `SCR-BRAIN`, `STA-BRAIN-NETWORK`
- **Purpose:** Help choose a network size with honest trade-offs.
- **Content:**
  - Three cards (small, medium, large), each with a mini diagram, training time on this computer and expected result. Recommended one outlined.
  - Note that estimates come from similar projects and the real number appears after training.
  - Option to start from a brain someone already trained.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **Brain**) · Play → `SCR-PLAY` · primary *Train* → `MOD-START-TRAINING`
- **Left column:** `PNL-BRAIN-SHAPE` (**Shape**)
- **Center column:** `PNL-VIEWPORT` (**Network**, Scene) · toolbar: Senses, Network
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Dialog · Brain sizes Icarus suggests:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | + Add a layer | Button or link | Acts in place |
| Center column | Network | Tool | → `STA-BRAIN-NETWORK` Brain · network view |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Make the brain bigger | Chat suggestion | Acts in place |
| Chat column | Compare with 25k | Chat suggestion | → `SCR-RESULTS` Results workspace |
| Chat column | What does layer 1 do? | Chat suggestion | → `STA-BRAIN-NETWORK` Brain · network view |
| Dialog · Brain sizes Icarus suggests | Close | Button or link | → `STA-BRAIN-NETWORK` Brain · network view |
| Dialog · Brain sizes Icarus suggests | Use Small | Button or link | → `STA-BRAIN-NETWORK` Brain · network view |
| Dialog · Brain sizes Icarus suggests | Use Medium | Button or link | → `STA-BRAIN-NETWORK` Brain · network view |
| Dialog · Brain sizes Icarus suggests | Use Large | Button or link | → `STA-BRAIN-NETWORK` Brain · network view |
| Dialog · Brain sizes Icarus suggests | Browse brains | Button or link | → `SCR-COMMUNITY` Community |

#### `STA-BRAIN-NETWORK` Brain · network view

- **Kind:** State of a screen of `SCR-BRAIN` Brain workspace
- **Mockup:** *Brain · network* (`Network`)
- **Reached from:** `MOD-AUTOPILOT`, `MOD-BRAIN-SIZES`, `MOD-START-TRAINING`, `MOD-STOP-RUN`, `SCR-BRAIN`, `SCR-TRAIN`, `STA-TRAIN-FAILED`
- **Purpose:** See and size the network that is learning, connected to the body.
- **Content:**
  - Left: Shape tab with layers, neurons, decisions per second, a speed hint, and episode rules.
  - Center: the body with sensor rays wired into the network diagram; hot neurons in red, a tooltip explains one neuron. Live / checkpoint switch.
  - Bottom caption: layers, parameters and decisions per second.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **Brain**) · Play → `SCR-PLAY` · primary *Train* → `MOD-START-TRAINING`
- **Left column:** `PNL-BRAIN-SHAPE` (**Shape**)
- **Center column:** `PNL-VIEWPORT` (**Network**, Scene) · toolbar: Senses, Network
- **Chat column:** `PNL-CHAT` (**Chat**, History)

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | + Add a layer | Button or link | → `MOD-BRAIN-SIZES` Brain sizes |
| Center column | Network | Tool | Acts in place |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Make the brain bigger | Chat suggestion | → `MOD-BRAIN-SIZES` Brain sizes |
| Chat column | Compare with 25k | Chat suggestion | → `SCR-RESULTS` Results workspace |
| Chat column | What does layer 1 do? | Chat suggestion | Acts in place |

#### `MOD-START-TRAINING` Start training

- **Kind:** Modal dialog of `SCR-BRAIN` Brain workspace
- **Mockup:** *Start training* (`StartTraining`)
- **Reached from:** `MOD-AUTOPILOT`, `MOD-STOP-RUN`, `SCR-RESULTS`, `SCR-TRAIN`, `STA-RESULTS-FAILURES`, `STA-TRAIN-FAILED` · also from every workspace header
- **Purpose:** Confirm a training run with a clear cost.
- **Content:**
  - Plain explanation of what will happen, practice steps and parallel copies, estimated time and CPU threads used, and the *Let the copilot coach* switch.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **Brain**) · Play → `SCR-PLAY` · primary *Train* → `MOD-START-TRAINING`
- **Left column:** `PNL-SENSES-ACTIONS` (**What it sees**, What it can do); `PNL-INSPECTOR` (**Properties**) · inspector rows: Steps, Parallel copies, Method, Network, Learning rate
- **Center column:** `PNL-VIEWPORT` (**Scene**, Game view); `PNL-LEARNING` (**Reward**, Goal, Curriculum) · toolbar: Senses, Network
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Dialog · Start training:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | 2 layers · 256 | Button or link | → `MOD-BRAIN-SIZES` Brain sizes |
| Center column | Network | Tool | → `STA-BRAIN-NETWORK` Brain · network view |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Explain the reward | Chat suggestion | → `STA-BRAIN-NETWORK` Brain · network view |
| Chat column | Make it faster | Chat suggestion | → `MOD-BRAIN-SIZES` Brain sizes |
| Chat column | Reset to default | Chat suggestion | → `SCR-BRAIN` Brain workspace |
| Dialog · Start training | Close | Button or link | → `SCR-BRAIN` Brain workspace |
| Dialog · Start training | Cancel | Button or link | → `SCR-BRAIN` Brain workspace |
| Dialog · Start training | Start run 4 | Button or link | → `SCR-TRAIN` Train workspace |

#### `SCR-TRAIN` Train workspace

- **Kind:** Screen
- **Mockup:** *Train* (`Train`)
- **Reached from:** `MOD-AUTOPILOT`, `MOD-START-TRAINING`, `MOD-STOP-RUN`, `SCR-PROJECTS`, `SCR-RESULTS`, `SCR-TIMELAPSE`, `STA-TRAIN-FAILED` · also from every workspace header
- **Purpose:** Watch learning happen live.
- **Content:**
  - Left: Runs list and the inspector of the selected run (budget locked while it runs, autopilot settings).
  - Viewport: all parallel copies, checkpoint card and scrubber.
  - Bottom: metrics with charts and the reward breakdown.
  - Chat: the coach's running commentary with milestones and a suggestion card for the next run.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **Train**) · Play → `SCR-PLAY` · primary *Stop* → `MOD-STOP-RUN`
- **Left column:** `PNL-RUNS` (**Runs**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Steps, Parallel copies, Mode, Tries left
- **Center column:** `PNL-VIEWPORT` (**Live training**, Replay); `PNL-METRICS` (**Metrics**, Console) · toolbar: Train, Pause, Stop, Timelapse, Autopilot
- **Chat column:** `PNL-CHAT` (**Chat**, History)

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | Ask first | Button or link | → `MOD-AUTOPILOT` Autopilot |
| Center column | Train | Tool | → `MOD-START-TRAINING` Start training |
| Center column | Pause | Tool | → `MOD-STOP-RUN` Stop run |
| Center column | Stop | Tool | → `MOD-STOP-RUN` Stop run |
| Center column | Timelapse | Tool | → `SCR-TIMELAPSE` Timelapse presentation |
| Center column | Autopilot | Tool | → `MOD-AUTOPILOT` Autopilot |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Try it as run 4 | Button or link | → `MOD-START-TRAINING` Start training |
| Chat column | Explain more | Button or link | → `STA-BRAIN-NETWORK` Brain · network view |
| Chat column | Why does it scrape? | Chat suggestion | → `STA-RESULTS-FAILURES` Results · where it fails |
| Chat column | Compare with run 2 | Chat suggestion | → `SCR-RESULTS` Results workspace |
| Chat column | Stop at 500k | Chat suggestion | → `MOD-STOP-RUN` Stop run |

#### `SCR-RESULTS` Results workspace

- **Kind:** Screen
- **Mockup:** *Results* (`Results`)
- **Reached from:** `MOD-AUTOPILOT`, `MOD-BRAIN-SIZES`, `MOD-STOP-RUN`, `POP-NOTIFICATIONS`, `SCR-PLAY`, `SCR-TRAIN`, `STA-BRAIN-NETWORK`, `STA-RESULTS-FAILURES`, `STA-TRAIN-FAILED` · also from every workspace header
- **Purpose:** Judge whether a brain is better, with fair comparisons.
- **Content:**
  - Left: runs with compare checkboxes and scores; summary of the best brain with *Use this brain* and *Keep training*.
  - Center: two runs side by side on the same seed with score chips.
  - Bottom: how it learned, checkpoint by checkpoint, with future checkpoints and ETAs.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **Results**) · Play → `SCR-PLAY` · primary *Train* → `MOD-START-TRAINING`
- **Left column:** `PNL-RESULT-RUNS` (**Runs**, Best brains); `PNL-SUMMARY` (**Summary**, Notes)
- **Center column:** `PNL-RESULTS-VIEW` (**Compare**, Where it fails, Timelapse); `PNL-LEARNED` (**How it learned**)
- **Chat column:** `PNL-CHAT` (**Chat**, History)

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | Use this brain | Button or link | → `SCR-BUILD` Build workspace |
| Left column | Keep training | Button or link | → `SCR-TRAIN` Train workspace |
| Center column | Where it fails | Tab | → `STA-RESULTS-FAILURES` Results · where it fails |
| Center column | Timelapse | Tab | → `SCR-TIMELAPSE` Timelapse presentation |
| Center column | Start circles | Button or link | → `SCR-TIMELAPSE` Timelapse presentation |
| Center column | 25k hits a car | Button or link | → `SCR-TIMELAPSE` Timelapse presentation |
| Center column | 50k reaches lot | Button or link | → `SCR-TIMELAPSE` Timelapse presentation |
| Center column | 100k 12% | Button or link | → `SCR-TIMELAPSE` Timelapse presentation |
| Center column | 250k 71% | Button or link | → `SCR-TIMELAPSE` Timelapse presentation |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Show where it fails | Chat suggestion | → `STA-RESULTS-FAILURES` Results · where it fails |
| Chat column | Share run 3 | Chat suggestion | → `MOD-SHARE` Share |
| Chat column | Train run 4 | Chat suggestion | → `MOD-START-TRAINING` Start training |

#### `STA-RESULTS-FAILURES` Results · where it fails

- **Kind:** State of a screen of `SCR-RESULTS` Results workspace
- **Mockup:** *Where it fails* (`Diagnose`)
- **Reached from:** `MOD-AUTOPILOT`, `MOD-STOP-RUN`, `SCR-RESULTS`, `SCR-TRAIN`, `STA-TRAIN-FAILED`
- **Purpose:** Explain why it fails and propose the fix. This is where the copilot's vision earns its place.
- **Content:**
  - Left: failure groups with thumbnails and counts; summary with rates over the same seeds.
  - Center: replay of a failing test run with annotations drawn by the copilot and an explanation card.
  - Chat: the diagnosis in plain words, the proposed changes and *Apply as revision ‹n›*.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **Results**) · Play → `SCR-PLAY` · primary *Train* → `MOD-START-TRAINING`
- **Left column:** `PNL-FAILURES` (**Failures**, All test runs); `PNL-SUMMARY` (**Summary**, Notes)
- **Center column:** `PNL-RESULTS-VIEW` (Compare, **Where it fails**, Timelapse)
- **Chat column:** `PNL-CHAT` (**Chat**, History)

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | Tight left turns 23 of 50 test runs | Button or link | Acts in place |
| Left column | Overshoots the spot 9 of 50 | Button or link | Acts in place |
| Left column | Stops too early 4 of 50 | Button or link | Acts in place |
| Center column | Compare | Tab | → `SCR-RESULTS` Results workspace |
| Center column | Timelapse | Tab | → `SCR-TIMELAPSE` Timelapse presentation |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Apply as revision 14 | Button or link | → `SCR-BRAIN` Brain workspace |
| Chat column | Show other failures | Button or link | Acts in place |
| Chat column | Why only on the left? | Chat suggestion | Acts in place |
| Chat column | Train run 4 | Chat suggestion | → `MOD-START-TRAINING` Start training |

#### `SCR-BUILD` Build workspace

- **Kind:** Screen
- **Mockup:** *Build* (`Build`)
- **Reached from:** `MOD-EXPORT-BRAIN`, `MOD-PUBLISH`, `MOD-PUBLISHED`, `SCR-RESULTS`, `SCR-TIMELAPSE` · also from every workspace header
- **Purpose:** Get the creation out: community, files, hardware, games.
- **Content:**
  - Left: build targets. Center: the selected target; here the community page form with preview card.
  - Chat: what the copilot prepared and what to watch out for.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **Build**) · Play → `SCR-PLAY` · primary *Publish* → `MOD-PUBLISH`
- **Left column:** `PNL-BUILD-TARGETS` (**Build**)
- **Center column:** `PNL-BUILD-TARGET-VIEW` (**Share to community**)
- **Chat column:** `PNL-CHAT` (**Chat**, History)

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | Share to community Publish so others can remix it | Button or link | Acts in place |
| Left column | Export brain ONNX file · 1.2 MB | Button or link | → `MOD-EXPORT-BRAIN` Export brain |
| Left column | Run on real hardware Parts list · about $189 | Button or link | → `STA-BUILD-HARDWARE` Build · real hardware |
| Left column | Use in a game Unity · Godot · Roblox | Button or link | → `MOD-EXPORT-BRAIN` Export brain |
| Left column | Export animation glTF · FBX (for dancers) | Button or link | → `MOD-EXPORT-ANIMATION` Export animation |
| Center column | Save draft | Button or link | Acts in place |
| Center column | Publish to community | Button or link | → `MOD-PUBLISH` Publish to the community |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Write a better description | Chat suggestion | Acts in place |
| Chat column | Export for Unity | Chat suggestion | → `MOD-EXPORT-BRAIN` Export brain |
| Chat column | Order the parts | Chat suggestion | → `STA-BUILD-HARDWARE` Build · real hardware |

#### `MOD-PUBLISH` Publish to the community

- **Kind:** Modal dialog of `SCR-BUILD` Build workspace
- **Mockup:** *Publish* (`Publish`)
- **Reached from:** `MOD-EXPORT-BRAIN`, `MOD-PUBLISHED`, `SCR-BUILD`, `STA-RESULTS-REFERENCE` · also from every workspace header
- **Purpose:** Last check before something becomes public.
- **Content:**
  - Who it will appear as (avatar, handle, signature), automatic checks (no personal data, data only, description written), guideline agreement switch.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **Build**) · Play → `SCR-PLAY` · primary *Publish* → `MOD-PUBLISH`
- **Left column:** `PNL-BUILD-TARGETS` (**Build**)
- **Center column:** `PNL-BUILD-TARGET-VIEW` (**Share to community**)
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Dialog · Publish to the community:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | Share to community Publish so others can remix it | Button or link | → `SCR-BUILD` Build workspace |
| Left column | Export brain ONNX file · 1.2 MB | Button or link | → `MOD-EXPORT-BRAIN` Export brain |
| Left column | Run on real hardware Parts list · about $189 | Button or link | → `STA-BUILD-HARDWARE` Build · real hardware |
| Left column | Use in a game Unity · Godot · Roblox | Button or link | → `MOD-EXPORT-BRAIN` Export brain |
| Left column | Export animation glTF · FBX (for dancers) | Button or link | → `MOD-EXPORT-ANIMATION` Export animation |
| Center column | Save draft | Button or link | → `SCR-BUILD` Build workspace |
| Center column | Publish to community | Button or link | Acts in place |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Write a better description | Chat suggestion | → `SCR-BUILD` Build workspace |
| Chat column | Export for Unity | Chat suggestion | → `MOD-EXPORT-BRAIN` Export brain |
| Chat column | Order the parts | Chat suggestion | → `STA-BUILD-HARDWARE` Build · real hardware |
| Dialog · Publish to the community | Close | Button or link | → `SCR-BUILD` Build workspace |
| Dialog · Publish to the community | Back | Button or link | → `SCR-BUILD` Build workspace |
| Dialog · Publish to the community | Publish | Button or link | → `MOD-PUBLISHED` Sent for review |

#### `MOD-PUBLISHED` Sent for review

- **Kind:** Modal dialog of `SCR-BUILD` Build workspace
- **Mockup:** *Sent for review* (`Published`)
- **Reached from:** `MOD-PUBLISH`
- **Purpose:** Confirm the creation was sent for review and say what happens next.
- **Content:**
  - Green check, *Sent for review*, timing, links to its page and back to Build.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **Build**) · Play → `SCR-PLAY` · primary *Publish* → `MOD-PUBLISH`
- **Left column:** `PNL-BUILD-TARGETS` (**Build**)
- **Center column:** `PNL-BUILD-TARGET-VIEW` (**Share to community**)
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Overlay:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | Share to community Publish so others can remix it | Button or link | → `SCR-BUILD` Build workspace |
| Left column | Export brain ONNX file · 1.2 MB | Button or link | → `MOD-EXPORT-BRAIN` Export brain |
| Left column | Run on real hardware Parts list · about $189 | Button or link | → `STA-BUILD-HARDWARE` Build · real hardware |
| Left column | Use in a game Unity · Godot · Roblox | Button or link | → `MOD-EXPORT-BRAIN` Export brain |
| Left column | Export animation glTF · FBX (for dancers) | Button or link | → `MOD-EXPORT-ANIMATION` Export animation |
| Center column | Save draft | Button or link | → `SCR-BUILD` Build workspace |
| Center column | Publish to community | Button or link | → `MOD-PUBLISH` Publish to the community |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Write a better description | Chat suggestion | → `SCR-BUILD` Build workspace |
| Chat column | Export for Unity | Chat suggestion | → `MOD-EXPORT-BRAIN` Export brain |
| Chat column | Order the parts | Chat suggestion | → `STA-BUILD-HARDWARE` Build · real hardware |
| Overlay | Close | Button or link | → `SCR-BUILD` Build workspace |
| Overlay | View its page | Button or link | → `SCR-CREATION` Creation page |
| Overlay | Back to Build | Button or link | → `SCR-BUILD` Build workspace |

### Copy a dance from a video

#### `MOD-MOTION-VIDEO` Copy motion from a video

- **Kind:** Modal dialog of `STA-WORLD-EMPTY-NOGUIDE` World · new project, guide hidden
- **Mockup:** *Upload the dance video* (`UploadVideo`)
- **Reached from:** `MOD-AUTO-RIG`, `MOD-EXPORT-ANIMATION`, `MOD-MOTION-TRACKING`, `MOD-MOTION-TRAIN`, `MOD-SIGN-IN`, `POP-NOTIFICATIONS`, `SCR-BODY`, `SCR-HOME`, `SCR-MOTION`, `STA-BODY-CHECK-FAILED`, `STA-HOME-EMPTY`, `STA-MOTION-TRAINING`, `STA-WORLD-EMPTY`, `STA-WORLD-EMPTY-NOGUIDE`
- **Purpose:** Bring a reference video for a character to copy.
- **Content:**
  - Source switch: upload a file, paste a link, record with webcam.
  - File card with the first frame, duration, resolution, people found and a trim range.
  - *Who to copy* (people found in the video) and *Copy onto* (default humanoid or an imported character).
  - Privacy note: the video stays on this computer; only the pose is used.
- **Header:** `HDR-WORKSPACE` · project **Dance Copy** · workspaces World · Body · Brain · Train · Results · Build (active: **World**) · Play → disabled · primary *Train* → disabled
- **Left column:** `PNL-EXPLORER` (**Explorer**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Preset, Clouds, Horizon, Time of day, Sun intensity, Shadows
- **Center column:** `PNL-VIEWPORT` (**Scene**, Game view); `PNL-LIBRARY` (**Library**, Community, My files) · toolbar: Terrain, Sky, Light, Part, Agent, Goal, Import
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Dialog · Copy motion from a video:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | + Add component | Button or link | → `POP-ADD-COMPONENT` Components and Add component |
| Center column | Agent | Tool | → `SCR-IDEAS` Ideas |
| Center column | Goal | Tool | → `SCR-BRAIN` Brain workspace |
| Center column | Import | Tool | → `MOD-IMPORT` Import |
| Center column | Show guide · 0 of 5 | Button or link | → `STA-WORLD-EMPTY` World · new project with guide |
| Center column | Import a model or environment | Button or link | → `MOD-IMPORT` Import |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | A car that learns to park | Chat suggestion | → `SCR-IDEAS` Ideas |
| Chat column | Import my robot | Chat suggestion | → `MOD-IMPORT` Import |
| Chat column | A dancer from a video | Chat suggestion | Acts in place |
| Dialog · Copy motion from a video | Close | Button or link | → `SCR-HOME` Home |
| Dialog · Copy motion from a video | My character · dancer.glb Imported and rigged | Button or link | → `MOD-IMPORT` Import |
| Dialog · Copy motion from a video | Cancel | Button or link | → `SCR-HOME` Home |
| Dialog · Copy motion from a video | Track the motion | Button or link | → `MOD-MOTION-TRACKING` Tracking the motion |

#### `MOD-MOTION-TRACKING` Tracking the motion

- **Kind:** Modal dialog of `SCR-MOTION` Motion workspace
- **Mockup:** *Tracking the pose* (`PoseProgress`)
- **Reached from:** `MOD-EXPORT-ANIMATION`, `MOD-MOTION-TRAIN`, `MOD-MOTION-VIDEO`, `SCR-MOTION`, `STA-MOTION-TRAINING`
- **Purpose:** Show pose tracking progress honestly.
- **Content:**
  - Current frame with the tracked skeleton, progress bar, steps (find person, track frames, map onto character, physics check), run in background or see result.
- **Header:** `HDR-WORKSPACE` · project **Dance Copy** · workspaces World · Body · Motion · Brain · Train · Results · Build (active: **Motion**) · Play → `SCR-MOTION` · primary *Train copy* → `MOD-MOTION-TRAIN`
- **Left column:** `PNL-EXPLORER` (**Clip**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Body height, Arms, Feet on floor, Balance help, Max joint force
- **Center column:** `PNL-MOTION-COMPARE` (**Side by side**, Overlay, Reference only); `PNL-CLIP-TIMELINE` (**Clip · 12 s · 360 frames**, Match score) · toolbar: Video, Detect pose, Retarget, Trim, Export
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Dialog · Tracking salsa.mp4:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Center column | Video | Tool | → `MOD-MOTION-VIDEO` Copy motion from a video |
| Center column | Detect pose | Tool | Acts in place |
| Center column | Trim | Tool | → `MOD-MOTION-VIDEO` Copy motion from a video |
| Center column | Export | Tool | → `MOD-EXPORT-ANIMATION` Export animation |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Train the spin | Button or link | → `SCR-MOTION` Motion workspace |
| Chat column | Slow it down | Chat suggestion | → `SCR-MOTION` Motion workspace |
| Chat column | Loop it | Chat suggestion | → `MOD-EXPORT-ANIMATION` Export animation |
| Chat column | Export for Roblox | Chat suggestion | → `MOD-EXPORT-ANIMATION` Export animation |
| Dialog · Tracking salsa.mp4 | Close | Button or link | → `SCR-MOTION` Motion workspace |
| Dialog · Tracking salsa.mp4 | Run in background | Button or link | → `SCR-MOTION` Motion workspace |
| Dialog · Tracking salsa.mp4 | See result | Button or link | → `SCR-MOTION` Motion workspace |

#### `SCR-MOTION` Motion workspace

- **Kind:** Screen
- **Mockup:** *Motion · side by side* (`Motion`)
- **Reached from:** `MOD-EXPORT-ANIMATION`, `MOD-MOTION-TRACKING`, `MOD-MOTION-TRAIN`, `POP-NOTIFICATIONS`, `SCR-PROJECTS`, `STA-MOTION-TRAINING` · also from every workspace header
- **Purpose:** Compare the reference with the physics character and decide what to improve.
- **Content:**
  - Explorer: clip, pose track, retarget map, character, exports.
  - Inspector: retarget and physics settings (match, arms, feet on floor, balance help, max joint force).
  - Center: reference vs physics character, with view modes. Bottom: clip frames and match curve, with the weakest moment called out.
  - Chat: match percentage and what fails, with an inline action to train that part.
- **Header:** `HDR-WORKSPACE` · project **Dance Copy** · workspaces World · Body · Motion · Brain · Train · Results · Build (active: **Motion**) · Play → `SCR-MOTION` · primary *Train copy* → `MOD-MOTION-TRAIN`
- **Left column:** `PNL-EXPLORER` (**Clip**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Body height, Arms, Feet on floor, Balance help, Max joint force
- **Center column:** `PNL-MOTION-COMPARE` (**Side by side**, Overlay, Reference only); `PNL-CLIP-TIMELINE` (**Clip · 12 s · 360 frames**, Match score) · toolbar: Video, Detect pose, Retarget, Trim, Export
- **Chat column:** `PNL-CHAT` (**Chat**, History)

| Region | Control | Type | Result |
|---|---|---|---|
| Center column | Video | Tool | → `MOD-MOTION-VIDEO` Copy motion from a video |
| Center column | Detect pose | Tool | → `MOD-MOTION-TRACKING` Tracking the motion |
| Center column | Trim | Tool | → `MOD-MOTION-VIDEO` Copy motion from a video |
| Center column | Export | Tool | → `MOD-EXPORT-ANIMATION` Export animation |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Train the spin | Button or link | Acts in place |
| Chat column | Slow it down | Chat suggestion | Acts in place |
| Chat column | Loop it | Chat suggestion | → `MOD-EXPORT-ANIMATION` Export animation |
| Chat column | Export for Roblox | Chat suggestion | → `MOD-EXPORT-ANIMATION` Export animation |

#### `MOD-MOTION-TRAIN` Train the copy

- **Kind:** Modal dialog of `SCR-MOTION` Motion workspace
- **Mockup:** *Train the copy* (`TrainMotion`)
- **Reached from:** the workspace header
- **Purpose:** Start training the copy with a clear focus.
- **Content:**
  - Steps, parallel copies, focus on the weakest moment or the whole clip evenly, time estimate.
- **Header:** `HDR-WORKSPACE` · project **Dance Copy** · workspaces World · Body · Motion · Brain · Train · Results · Build (active: **Motion**) · Play → `SCR-MOTION` · primary *Train copy* → `MOD-MOTION-TRAIN`
- **Left column:** `PNL-EXPLORER` (**Clip**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Body height, Arms, Feet on floor, Balance help, Max joint force
- **Center column:** `PNL-MOTION-COMPARE` (**Side by side**, Overlay, Reference only); `PNL-CLIP-TIMELINE` (**Clip · 12 s · 360 frames**, Match score) · toolbar: Video, Detect pose, Retarget, Trim, Export
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Dialog · Train Dance Copy:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Center column | Video | Tool | → `MOD-MOTION-VIDEO` Copy motion from a video |
| Center column | Detect pose | Tool | → `MOD-MOTION-TRACKING` Tracking the motion |
| Center column | Trim | Tool | → `MOD-MOTION-VIDEO` Copy motion from a video |
| Center column | Export | Tool | → `MOD-EXPORT-ANIMATION` Export animation |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Train the spin | Button or link | → `SCR-MOTION` Motion workspace |
| Chat column | Slow it down | Chat suggestion | → `SCR-MOTION` Motion workspace |
| Chat column | Loop it | Chat suggestion | → `MOD-EXPORT-ANIMATION` Export animation |
| Chat column | Export for Roblox | Chat suggestion | → `MOD-EXPORT-ANIMATION` Export animation |
| Dialog · Train Dance Copy | Close | Button or link | → `SCR-MOTION` Motion workspace |
| Dialog · Train Dance Copy | Cancel | Button or link | → `SCR-MOTION` Motion workspace |
| Dialog · Train Dance Copy | Start training | Button or link | → `STA-MOTION-TRAINING` Motion · training the copy |

#### `STA-MOTION-TRAINING` Motion · training the copy

- **Kind:** State of a screen of `SCR-MOTION` Motion workspace
- **Mockup:** *Training the copy* (`MotionTraining`)
- **Reached from:** `MOD-MOTION-TRAIN`
- **Purpose:** Follow the copy while it trains without leaving the comparison.
- **Content:**
  - Floating status card: progress, time left, match before → now, balance on the hard moment, Watch and Export now. Header primary becomes Stop.
- **Header:** `HDR-WORKSPACE` · project **Dance Copy** · workspaces World · Body · Motion · Brain · Train · Results · Build (active: **Motion**) · Play → `SCR-MOTION` · primary *Stop* → `MOD-STOP-RUN`
- **Left column:** `PNL-EXPLORER` (**Clip**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Body height, Arms, Feet on floor, Balance help, Max joint force
- **Center column:** `PNL-MOTION-COMPARE` (**Side by side**, Overlay, Reference only); `PNL-CLIP-TIMELINE` (**Clip · 12 s · 360 frames**, Match score) · toolbar: Video, Detect pose, Retarget, Trim, Export
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Overlay:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Center column | Video | Tool | → `MOD-MOTION-VIDEO` Copy motion from a video |
| Center column | Detect pose | Tool | → `MOD-MOTION-TRACKING` Tracking the motion |
| Center column | Trim | Tool | → `MOD-MOTION-VIDEO` Copy motion from a video |
| Center column | Export | Tool | → `MOD-EXPORT-ANIMATION` Export animation |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Train the spin | Button or link | → `SCR-MOTION` Motion workspace |
| Chat column | Slow it down | Chat suggestion | → `SCR-MOTION` Motion workspace |
| Chat column | Loop it | Chat suggestion | → `MOD-EXPORT-ANIMATION` Export animation |
| Chat column | Export for Roblox | Chat suggestion | → `MOD-EXPORT-ANIMATION` Export animation |
| Overlay | Watch | Button or link | → `SCR-MOTION` Motion workspace |
| Overlay | Export now | Button or link | → `MOD-EXPORT-ANIMATION` Export animation |

#### `MOD-EXPORT-ANIMATION` Export animation

- **Kind:** Modal dialog of `SCR-MOTION` Motion workspace
- **Mockup:** *Export animation* (`ExportAnim`)
- **Reached from:** `MOD-EXPORT-BRAIN`, `MOD-MOTION-TRACKING`, `MOD-MOTION-TRAIN`, `MOD-PUBLISH`, `MOD-PUBLISHED`, `SCR-BUILD`, `SCR-MOTION`, `STA-MOTION-TRAINING`
- **Purpose:** Export the motion as an animation file.
- **Content:**
  - Format (glTF, FBX, BVH), use physics result, root motion, loop, target rig, file summary with match.
- **Header:** `HDR-WORKSPACE` · project **Dance Copy** · workspaces World · Body · Motion · Brain · Train · Results · Build (active: **Motion**) · Play → `SCR-MOTION` · primary *Train copy* → `MOD-MOTION-TRAIN`
- **Left column:** `PNL-EXPLORER` (**Clip**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Body height, Arms, Feet on floor, Balance help, Max joint force
- **Center column:** `PNL-MOTION-COMPARE` (**Side by side**, Overlay, Reference only); `PNL-CLIP-TIMELINE` (**Clip · 12 s · 360 frames**, Match score) · toolbar: Video, Detect pose, Retarget, Trim, Export
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Dialog · Export animation:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Center column | Video | Tool | → `MOD-MOTION-VIDEO` Copy motion from a video |
| Center column | Detect pose | Tool | → `MOD-MOTION-TRACKING` Tracking the motion |
| Center column | Trim | Tool | → `MOD-MOTION-VIDEO` Copy motion from a video |
| Center column | Export | Tool | Acts in place |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Train the spin | Button or link | → `SCR-MOTION` Motion workspace |
| Chat column | Slow it down | Chat suggestion | → `SCR-MOTION` Motion workspace |
| Chat column | Loop it | Chat suggestion | Acts in place |
| Chat column | Export for Roblox | Chat suggestion | Acts in place |
| Dialog · Export animation | Close | Button or link | → `SCR-MOTION` Motion workspace |
| Dialog · Export animation | Cancel | Button or link | → `SCR-MOTION` Motion workspace |
| Dialog · Export animation | Download | Button or link | → `SCR-MOTION` Motion workspace |

### Bring your own model

#### `MOD-IMPORT` Import

- **Kind:** Modal dialog of `SCR-BODY` Body workspace
- **Mockup:** *Import* (`Import`)
- **Reached from:** `MOD-AUTO-RIG`, `MOD-DELETE-PROJECT`, `MOD-DUPLICATE`, `MOD-HISTORY`, `MOD-MOTION-VIDEO`, `MOD-RENAME`, `MOD-SHARE`, `MOD-SIGN-IN`, `POP-NOTIFICATIONS`, `POP-PROJECT-MENU`, `POP-TRAINING-COPIES`, `SCR-BODY`, `SCR-HOME`, `SCR-PROJECTS`, `SCR-WORLD`, `STA-BODY-CHECK-FAILED`, `STA-HOME-EMPTY`, `STA-WORLD-EMPTY`, `STA-WORLD-EMPTY-NOGUIDE`, `STA-WORLD-PROPOSAL`
- **Purpose:** Bring an external model, environment or robot description in.
- **Content:**
  - Type switch: model or character, environment, robot description.
  - Preview with size and detected kind, the steps auto-rig will run, *Import as static mesh* or *Import and auto-rig*, supported formats.
- **Header:** `HDR-WORKSPACE` · project **Dance Copy** · workspaces World · Body · Motion · Brain · Train · Results · Build (active: **Body**) · Play → `SCR-MOTION` · primary *Train* → `MOD-START-TRAINING`
- **Left column:** `PNL-EXPLORER` (**Explorer**); `PNL-INSPECTOR` (**Properties**)
- **Center column:** `PNL-VIEWPORT` (**Scene**, Game view) · toolbar: Import, Auto-rig, Bone, Joint
- **Chat column:** `PNL-CHAT` (**Chat**, History)

| Region | Control | Type | Result |
|---|---|---|---|
| Center column | Import | Tool | Acts in place |
| Center column | Auto-rig | Tool | → `MOD-AUTO-RIG` Auto-rig progress |
| Center column | Import as static mesh | Button or link | → `SCR-WORLD` World workspace |
| Center column | Import and auto-rig | Button or link | → `MOD-AUTO-RIG` Auto-rig progress |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Import a robot | Chat suggestion | Acts in place |
| Chat column | Use a template | Chat suggestion | → `SCR-HOME` Home |

#### `MOD-AUTO-RIG` Auto-rig progress

- **Kind:** Modal dialog of `SCR-BODY` Body workspace
- **Mockup:** *Auto-rig progress* (`AutoRig`)
- **Reached from:** `MOD-IMPORT`, `SCR-BODY`, `STA-BODY-CHECK-FAILED`
- **Purpose:** Make an imported model physical, step by step.
- **Content:**
  - Progress bar and steps: read file, detect shape, place bones and joints, estimate masses and motors, stand-up test. Run in background, cancel, see result.
- **Header:** `HDR-WORKSPACE` · project **Dance Copy** · workspaces World · Body · Motion · Brain · Train · Results · Build (active: **Body**) · Play → `SCR-MOTION` · primary *Train* → `MOD-START-TRAINING`
- **Left column:** `PNL-EXPLORER` (**Rig**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Type, Range, Damping, Strength, Speed, Mass, Collider
- **Center column:** `PNL-VIEWPORT` (**Rig**, Mesh); `PNL-RIG-CHECK` (**Rig check**, Pose test, Weights) · toolbar: Import, Auto-rig, Bone, Joint, Motor, Sensor, Mirror, Collider, Weights, Test pose
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Dialog · Auto-rigging dancer.glb:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | + Add component | Button or link | → `POP-ADD-COMPONENT` Components and Add component |
| Center column | Import | Tool | → `MOD-IMPORT` Import |
| Center column | Auto-rig | Tool | Acts in place |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Add hand colliders | Button or link | Acts in place |
| Chat column | Show me | Button or link | → `SCR-BODY` Body workspace |
| Chat column | Make it lighter | Chat suggestion | → `SCR-BODY` Body workspace |
| Chat column | Stiffer knees | Chat suggestion | → `SCR-BODY` Body workspace |
| Chat column | Copy this video | Chat suggestion | → `MOD-MOTION-VIDEO` Copy motion from a video |
| Dialog · Auto-rigging dancer.glb | Close | Button or link | → `SCR-BODY` Body workspace |
| Dialog · Auto-rigging dancer.glb | Run in background | Button or link | → `SCR-BODY` Body workspace |
| Dialog · Auto-rigging dancer.glb | Cancel | Button or link | → `SCR-BODY` Body workspace |
| Dialog · Auto-rigging dancer.glb | See result | Button or link | → `STA-BODY-CHECK-FAILED` Body · physics check failed |

#### `SCR-BODY` Body workspace

- **Kind:** Screen
- **Mockup:** *Body · rig* (`Body`)
- **Reached from:** `MOD-AUTO-RIG`, `STA-BODY-CHECK-FAILED` · also from every workspace header
- **Purpose:** Edit the body: bones, joints, motors, sensors and colliders.
- **Content:**
  - Rig tree; inspector of the selected bone with joint, motor and body sections; viewport in Rig view; rig check below.
  - Chat summarises what auto-rig did and offers the remaining fix.
- **Header:** `HDR-WORKSPACE` · project **Dance Copy** · workspaces World · Body · Motion · Brain · Train · Results · Build (active: **Body**) · Play → `SCR-MOTION` · primary *Train* → `MOD-START-TRAINING`
- **Left column:** `PNL-EXPLORER` (**Rig**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Type, Range, Damping, Strength, Speed, Mass, Collider
- **Center column:** `PNL-VIEWPORT` (**Rig**, Mesh); `PNL-RIG-CHECK` (**Rig check**, Pose test, Weights) · toolbar: Import, Auto-rig, Bone, Joint, Motor, Sensor, Mirror, Collider, Weights, Test pose
- **Chat column:** `PNL-CHAT` (**Chat**, History)

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | + Add component | Button or link | → `POP-ADD-COMPONENT` Components and Add component |
| Center column | Import | Tool | → `MOD-IMPORT` Import |
| Center column | Auto-rig | Tool | → `MOD-AUTO-RIG` Auto-rig progress |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Add hand colliders | Button or link | → `MOD-AUTO-RIG` Auto-rig progress |
| Chat column | Show me | Button or link | Acts in place |
| Chat column | Make it lighter | Chat suggestion | Acts in place |
| Chat column | Stiffer knees | Chat suggestion | Acts in place |
| Chat column | Copy this video | Chat suggestion | → `MOD-MOTION-VIDEO` Copy motion from a video |

#### `STA-BODY-CHECK-FAILED` Body · physics check failed

- **Kind:** State of a screen of `SCR-BODY` Body workspace
- **Mockup:** *Physics check failed* (`DesignFailed`)
- **Reached from:** `MOD-AUTO-RIG`
- **Purpose:** Block training until the body is physically valid, and offer the fix.
- **Content:**
  - Amber banner: *Can’t train yet, ‹n› problems in the body*, with *Fix both for me* and *Show me*. Rig check lists the failing tests.
- **Header:** `HDR-WORKSPACE` · project **Dance Copy** · workspaces World · Body · Motion · Brain · Train · Results · Build (active: **Body**) · Play → `SCR-MOTION` · primary *Train* → `MOD-START-TRAINING`
- **Left column:** `PNL-EXPLORER` (**Rig**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Type, Range, Damping, Strength, Speed, Mass, Collider
- **Center column:** `PNL-VIEWPORT` (**Rig**, Mesh); `PNL-RIG-CHECK` (**Rig check**, Pose test, Weights) · toolbar: Import, Auto-rig, Bone, Joint, Motor, Sensor, Mirror, Collider, Weights, Test pose
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Overlay:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | + Add component | Button or link | → `POP-ADD-COMPONENT` Components and Add component |
| Center column | Import | Tool | → `MOD-IMPORT` Import |
| Center column | Auto-rig | Tool | → `MOD-AUTO-RIG` Auto-rig progress |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Add hand colliders | Button or link | → `MOD-AUTO-RIG` Auto-rig progress |
| Chat column | Show me | Button or link | → `SCR-BODY` Body workspace |
| Chat column | Make it lighter | Chat suggestion | → `SCR-BODY` Body workspace |
| Chat column | Stiffer knees | Chat suggestion | → `SCR-BODY` Body workspace |
| Chat column | Copy this video | Chat suggestion | → `MOD-MOTION-VIDEO` Copy motion from a video |
| Overlay | Fix both for me | Button or link | → `SCR-BODY` Body workspace |
| Overlay | Show me | Button or link | → `SCR-BODY` Body workspace |

### A real fly brain in a fly body · no training

#### `MOD-BRAIN-SOURCE` Choose the brain source

- **Kind:** Modal dialog of `STA-BRAIN-CONNECTOME` Brain · connectome
- **Mockup:** *Choose the fly brain* (`ConnectomeImport`)
- **Reached from:** `MOD-SIGN-IN`, `POP-NOTIFICATIONS`, `SCR-HOME`, `STA-HOME-EMPTY`
- **Purpose:** Choose what drives the body.
- **Content:**
  - Options: learn a new brain, load a connectome (with dataset card: neurons, synapses, fit), start from a community brain.
  - *How it connects*: which sensory and motor neurons map to the body, and what stays silent.
- **Header:** `HDR-WORKSPACE` · project **Fruit Fly** · workspaces World · Body · Brain · Train · Results · Build (active: **Brain**) · Play → `SCR-PLAY` · primary *Run test* → `STA-RESULTS-REFERENCE`
- **Left column:** `PNL-EXPLORER` (**Explorer**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Neurons, Synapses, Model, Time step, Training
- **Center column:** `PNL-VIEWPORT` (**Scene**, Game view); `PNL-BRAIN-ACTIVITY` (**Brain activity**, Behaviors, Wiring) · toolbar: Neurons, Connections, Regions, Senses map, Motor map
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Dialog · Choose the fly’s brain:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Play with it | Button or link | → `SCR-PLAY` Play |
| Chat column | Compare with real flies | Button or link | → `STA-RESULTS-REFERENCE` Results · compare with recordings |
| Dialog · Choose the fly’s brain | Close | Button or link | → `SCR-HOME` Home |
| Dialog · Choose the fly’s brain | Cancel | Button or link | → `SCR-HOME` Home |
| Dialog · Choose the fly’s brain | Load into the fly | Button or link | → `STA-BRAIN-CONNECTOME` Brain · connectome |

#### `STA-BRAIN-CONNECTOME` Brain · connectome

- **Kind:** State of a screen of `SCR-BRAIN` Brain workspace
- **Mockup:** *Fly brain · live* (`FlyBrain`)
- **Reached from:** `MOD-BRAIN-SOURCE`, `SCR-COMMUNITY`, `SCR-PROJECTS`, `STA-RESULTS-REFERENCE` · also from every workspace header
- **Purpose:** Inspect a connectome brain wired into its body. No training.
- **Content:**
  - Explorer: body parts and brain regions. Inspector: wiring facts and simulation settings, with *Training: None · real wiring*.
  - Viewport with the body and a *Firing right now* card; toolbar for neurons, connections, regions, senses map and motor map.
  - Bottom: brain activity, behaviors and wiring.
- **Header:** `HDR-WORKSPACE` · project **Fruit Fly** · workspaces World · Body · Brain · Train · Results · Build (active: **Brain**) · Play → `SCR-PLAY` · primary *Run test* → `STA-RESULTS-REFERENCE`
- **Left column:** `PNL-EXPLORER` (**Explorer**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Neurons, Synapses, Model, Time step, Training
- **Center column:** `PNL-VIEWPORT` (**Scene**, Game view); `PNL-BRAIN-ACTIVITY` (**Brain activity**, Behaviors, Wiring) · toolbar: Neurons, Connections, Regions, Senses map, Motor map
- **Chat column:** `PNL-CHAT` (**Chat**, History)

| Region | Control | Type | Result |
|---|---|---|---|
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Play with it | Button or link | → `SCR-PLAY` Play |
| Chat column | Compare with real flies | Button or link | → `STA-RESULTS-REFERENCE` Results · compare with recordings |

#### `SCR-PLAY` Play · second example (artboard *PlayFly*)

- **Header:** `HDR-PLAY` · Stop returns to the workspace · Record → `SCR-TIMELAPSE`
- **Left column:** `PNL-PLAY-SENSES` (**What it senses**); `PNL-PLAY-VISION` (**Vision**)
- **Center column:** `PNL-VIEWPORT` (**Play**, Game view); `PNL-BRAIN-ACTIVITY` (**Brain activity**); `PNL-PLAY-EVENTS` (**What happened**) · toolbar: Move, Push, Add object, Light, Wind, Shadow, Scent, Slow, Reset
- **Chat column:** `PNL-CHAT` (**Chat**, History)

| Region | Control | Type | Result |
|---|---|---|---|
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Cast a shadow | Chat suggestion | Acts in place |
| Chat column | Place sugar far away | Chat suggestion | Acts in place |
| Chat column | Record this | Chat suggestion | → `SCR-TIMELAPSE` Timelapse presentation |

#### `STA-RESULTS-REFERENCE` Results · compare with recordings

- **Kind:** State of a screen of `SCR-RESULTS` Results workspace
- **Mockup:** *Fly vs real flies* (`FlyCompare`)
- **Reached from:** `MOD-BRAIN-SOURCE`, `STA-BRAIN-CONNECTOME` · also from every workspace header
- **Purpose:** Measure how close simulated behavior is to recorded real behavior.
- **Content:**
  - Left: behavior tests with pass, warning or not run; overall match.
  - Center: one tab per test showing recorded and simulated behavior side by side; table of behavior, recorded, simulated, close or off.
  - Chat: what matches, what does not, and the likely cause.
- **Header:** `HDR-WORKSPACE` · project **Fruit Fly** · workspaces World · Body · Brain · Train · Results · Build (active: **Results**) · Play → `SCR-PLAY` · primary *Run test* → `STA-RESULTS-REFERENCE`
- **Left column:** `PNL-REFERENCE-TESTS` (**Behavior tests**, Recordings); `PNL-SUMMARY` (**Summary**, Notes)
- **Center column:** `PNL-REFERENCE-VIEW` (**Open arena walk**, Looming shadow, Grooming); `PNL-REFERENCE-MATCH` (**Behavior match**, Neurons)
- **Chat column:** `PNL-CHAT` (**Chat**, History)

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | Run flying test | Button or link | → `STA-BRAIN-CONNECTOME` Brain · connectome |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Wire the antennas | Button or link | → `STA-BRAIN-CONNECTOME` Brain · connectome |
| Chat column | Share it | Button or link | → `MOD-PUBLISH` Publish to the community |
| Chat column | Why is grooming late? | Chat suggestion | → `STA-BRAIN-CONNECTOME` Brain · connectome |
| Chat column | Record a video | Chat suggestion | → `SCR-TIMELAPSE` Timelapse presentation |

### Inspector · works for any object

#### `REF-PROPERTY-TYPES` Property types

- **Kind:** Design reference
- **Mockup:** *Property types* (`PropertyTypes`)
- **Reached from:** `POP-ADD-COMPONENT`
- **Purpose:** Design reference for the inspector: the 12 property types, their 6 states and what each interaction does. Not a screen in the app.
- **Content:**
  - Number, Slider, Range, Choice, List, Switch, Color, Vector, Count, Asset, Opens a panel, Read only; each with an example and when to use it.
  - States: default, changed by you, proposed by copilot, out of range, mixed, locked.
  - Interactions: click, drag the name, right-click, hover.
- **Header:** Window title bar · Inspector · property types
- **Page:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Page | See components | Button or link | → `POP-ADD-COMPONENT` Components and Add component |
| Page | 2 × 256 | Button or link | → `MOD-BRAIN-SIZES` Brain sizes |

#### `POP-ADD-COMPONENT` Components and Add component

- **Kind:** Popover or menu of `PNL-INSPECTOR` Inspector
- **Mockup:** *Components* (`Components`)
- **Reached from:** `MOD-AUTO-RIG`, `MOD-DELETE-PROJECT`, `MOD-DUPLICATE`, `MOD-HISTORY`, `MOD-MOTION-VIDEO`, `MOD-RENAME`, `MOD-SHARE`, `POP-PROJECT-MENU`, `POP-TRAINING-COPIES`, `REF-PROPERTY-TYPES`, `SCR-BODY`, `SCR-WORLD`, `STA-BODY-CHECK-FAILED`, `STA-WORLD-EMPTY`, `STA-WORLD-EMPTY-NOGUIDE`, `STA-WORLD-PROPOSAL`
- **Purpose:** Add a component to any object. Shown on the reference board with a generic imported object.
- **Content:**
  - Inspector of an imported robot joint with Transform, Physics body, Joint, Motor and Randomize per copy.
  - Add component popover: search or describe, then groups Shape and look, Physics, Senses, Brain, Learning, World.
  - Rules and an example of the copilot proposing two components for approval.
- **Header:** Window title bar · Inspector · components
- **Page:** no tabbed panels · inspector rows: Position, Rotation, Scale, Body, Mass, Friction, Type, Range, Damping, Strength, Max speed

| Region | Control | Type | Result |
|---|---|---|---|
| Page | Property types | Button or link | → `REF-PROPERTY-TYPES` Property types |
| Page | Back to the editor | Button or link | → `SCR-WORLD` World workspace |
| Page | Apply | Button or link | Acts in place |
| Page | Discard | Button or link | Acts in place |

### Project and editor

#### `STA-WORLD-EMPTY` World · new project with guide

- **Kind:** State of a screen of `SCR-WORLD` World workspace
- **Mockup:** *New project · guide* (`NewProject`)
- **Reached from:** `MOD-MOTION-VIDEO`, `MOD-REPORT`, `SCR-CREATION`, `SCR-PROFILE`, `SCR-PROJECTS`, `STA-HOME-EMPTY`, `STA-WORLD-EMPTY-NOGUIDE` · also from every workspace header
- **Purpose:** First minutes of a new project: a working default world and a guide that never forces an order.
- **Content:**
  - Default workspace: camera, terrain, sky, lighting, spawn point; *Add an agent*.
  - Guide card: five steps with the workspace each one lives in, *Hide guide* and *I will explore on my own*.
  - Library strip with ready pieces. Chat greets and offers three starting points. Train is disabled.
- **Header:** `HDR-WORKSPACE` · project **Untitled project** · workspaces World · Body · Brain · Train · Results · Build (active: **World**) · Play → `SCR-PLAY` · primary *Train* → disabled
- **Left column:** `PNL-EXPLORER` (**Explorer**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Preset, Clouds, Horizon, Time of day, Sun intensity, Shadows
- **Center column:** `PNL-VIEWPORT` (**Scene**, Game view); `PNL-LIBRARY` (**Library**, Community, My files) · toolbar: Terrain, Sky, Light, Part, Agent, Goal, Import
- **Chat column:** `PNL-CHAT` (**Chat**, History)

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | + Add component | Button or link | → `POP-ADD-COMPONENT` Components and Add component |
| Center column | Agent | Tool | → `SCR-IDEAS` Ideas |
| Center column | Goal | Tool | → `SCR-BRAIN` Brain workspace |
| Center column | Import | Tool | → `MOD-IMPORT` Import |
| Center column | Hide guide | Button or link | → `STA-WORLD-EMPTY-NOGUIDE` World · new project, guide hidden |
| Center column | I will explore on my own | Button or link | → `STA-WORLD-EMPTY-NOGUIDE` World · new project, guide hidden |
| Center column | Import a model or environment | Button or link | → `MOD-IMPORT` Import |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | A car that learns to park | Chat suggestion | → `SCR-IDEAS` Ideas |
| Chat column | Import my robot | Chat suggestion | → `MOD-IMPORT` Import |
| Chat column | A dancer from a video | Chat suggestion | → `MOD-MOTION-VIDEO` Copy motion from a video |

#### `STA-WORLD-EMPTY-NOGUIDE` World · new project, guide hidden

- **Kind:** State of a screen of `SCR-WORLD` World workspace
- **Mockup:** *New project · guide hidden* (`NewProjectNoGuide`)
- **Reached from:** `MOD-SIGN-IN`, `POP-NOTIFICATIONS`, `SCR-HOME`, `SCR-PROJECTS`, `STA-HOME-EMPTY`, `STA-WORLD-EMPTY`
- **Purpose:** Same as the new project, with the guide collapsed into a *Show guide* pill.
- **Header:** `HDR-WORKSPACE` · project **Untitled project** · workspaces World · Body · Brain · Train · Results · Build (active: **World**) · Play → `SCR-PLAY` · primary *Train* → disabled
- **Left column:** `PNL-EXPLORER` (**Explorer**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Preset, Clouds, Horizon, Time of day, Sun intensity, Shadows
- **Center column:** `PNL-VIEWPORT` (**Scene**, Game view); `PNL-LIBRARY` (**Library**, Community, My files) · toolbar: Terrain, Sky, Light, Part, Agent, Goal, Import
- **Chat column:** `PNL-CHAT` (**Chat**, History)

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | + Add component | Button or link | → `POP-ADD-COMPONENT` Components and Add component |
| Center column | Agent | Tool | → `SCR-IDEAS` Ideas |
| Center column | Goal | Tool | → `SCR-BRAIN` Brain workspace |
| Center column | Import | Tool | → `MOD-IMPORT` Import |
| Center column | Show guide · 0 of 5 | Button or link | → `STA-WORLD-EMPTY` World · new project with guide |
| Center column | Import a model or environment | Button or link | → `MOD-IMPORT` Import |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | A car that learns to park | Chat suggestion | → `SCR-IDEAS` Ideas |
| Chat column | Import my robot | Chat suggestion | → `MOD-IMPORT` Import |
| Chat column | A dancer from a video | Chat suggestion | → `MOD-MOTION-VIDEO` Copy motion from a video |

#### `STA-WORLD-PROPOSAL` World · copilot proposal preview

- **Kind:** State of a screen of `SCR-WORLD` World workspace
- **Mockup:** *Copilot proposes a change* (`ProposedChange`)
- **Reached from:** `MOD-DELETE-PROJECT`, `MOD-DUPLICATE`, `MOD-HISTORY`, `MOD-RENAME`, `MOD-SHARE`, `POP-PROJECT-MENU`, `POP-TRAINING-COPIES`, `SCR-IDEAS`, `SCR-WORLD`, `STA-WORLD-BUILDING`
- **Purpose:** Preview a copilot change before it exists.
- **Content:**
  - Viewport tinted to preview the change, with a blue pill *Preview of revision ‹n› · not applied yet*.
  - Chat card listing every difference (old → new in blue), side effects as warnings, and Apply, Discard, Edit by hand.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **World**) · Play → `SCR-PLAY` · primary *Train* → `MOD-START-TRAINING`
- **Left column:** `PNL-EXPLORER` (**Explorer**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Copies, Layout, Randomize, Material, Friction
- **Center column:** `PNL-VIEWPORT` (**Scene**, Game view); `PNL-LIBRARY` (**Library**, Community, My files) · toolbar: Terrain, Paint, Props, Sky, Light, Camera, Copies, Randomize, Import world
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Overlay:** no tabbed panels
- **Overlay:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | Positions, colors | Button or link | → `POP-TRAINING-COPIES` Training copies |
| Left column | + Add component | Button or link | → `POP-ADD-COMPONENT` Components and Add component |
| Center column | Copies | Tool | → `POP-TRAINING-COPIES` Training copies |
| Center column | Randomize | Tool | → `POP-TRAINING-COPIES` Training copies |
| Center column | Import world | Tool | → `MOD-IMPORT` Import |
| Center column | Import environment .glb .fbx .usd | Button or link | → `MOD-IMPORT` Import |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Apply | Button or link | → `SCR-WORLD` World workspace |
| Chat column | Discard | Button or link | → `SCR-WORLD` World workspace |
| Chat column | Edit by hand | Button or link | → `SCR-WORLD` World workspace |
| Chat column | Add rain | Chat suggestion | Acts in place |
| Chat column | Make the spots tighter | Chat suggestion | Acts in place |
| Chat column | Night time | Chat suggestion | Acts in place |

#### `POP-PROJECT-MENU` Project menu

- **Kind:** Popover or menu
- **Mockup:** *Project menu* (`ProjectMenu`)
- **Reached from:** the workspace header
- **Purpose:** Project-level actions from the project name.
- **Content:**
  - Rename, Duplicate, History (with current revision), Open project…, Project settings, Delete project…, Back to Home.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **World**) · Play → `SCR-PLAY` · primary *Train* → `MOD-START-TRAINING`
- **Left column:** `PNL-EXPLORER` (**Explorer**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Copies, Layout, Randomize, Material, Friction
- **Center column:** `PNL-VIEWPORT` (**Scene**, Game view); `PNL-LIBRARY` (**Library**, Community, My files) · toolbar: Terrain, Paint, Props, Sky, Light, Camera, Copies, Randomize, Import world
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Overlay:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | Positions, colors | Button or link | → `POP-TRAINING-COPIES` Training copies |
| Left column | + Add component | Button or link | → `POP-ADD-COMPONENT` Components and Add component |
| Center column | Copies | Tool | → `POP-TRAINING-COPIES` Training copies |
| Center column | Randomize | Tool | → `POP-TRAINING-COPIES` Training copies |
| Center column | Import world | Tool | → `MOD-IMPORT` Import |
| Center column | Import environment .glb .fbx .usd | Button or link | → `MOD-IMPORT` Import |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Add rain | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Chat column | Make the spots tighter | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Chat column | Night time | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Overlay | Rename | Button or link | → `MOD-RENAME` Rename project |
| Overlay | Duplicate | Button or link | → `MOD-DUPLICATE` Duplicate project |
| Overlay | History r14 | Button or link | → `MOD-HISTORY` History |
| Overlay | Open project… Ctrl O | Button or link | → `SCR-PROJECTS` Projects |
| Overlay | Project settings | Button or link | → `SCR-SETTINGS-TRAINING` Settings · training and hardware |
| Overlay | Delete project… | Button or link | → `MOD-DELETE-PROJECT` Delete project |
| Overlay | Back to Home | Button or link | → `SCR-HOME` Home |

#### `MOD-RENAME` Rename project

- **Kind:** Modal dialog of `POP-PROJECT-MENU` Project menu
- **Mockup:** *Rename* (`Rename`)
- **Reached from:** `POP-PROJECT-MENU`
- **Purpose:** Rename the project and its short description.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **World**) · Play → `SCR-PLAY` · primary *Train* → `MOD-START-TRAINING`
- **Left column:** `PNL-EXPLORER` (**Explorer**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Copies, Layout, Randomize, Material, Friction
- **Center column:** `PNL-VIEWPORT` (**Scene**, Game view); `PNL-LIBRARY` (**Library**, Community, My files) · toolbar: Terrain, Paint, Props, Sky, Light, Camera, Copies, Randomize, Import world
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Dialog · Rename project:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | Positions, colors | Button or link | → `POP-TRAINING-COPIES` Training copies |
| Left column | + Add component | Button or link | → `POP-ADD-COMPONENT` Components and Add component |
| Center column | Copies | Tool | → `POP-TRAINING-COPIES` Training copies |
| Center column | Randomize | Tool | → `POP-TRAINING-COPIES` Training copies |
| Center column | Import world | Tool | → `MOD-IMPORT` Import |
| Center column | Import environment .glb .fbx .usd | Button or link | → `MOD-IMPORT` Import |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Add rain | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Chat column | Make the spots tighter | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Chat column | Night time | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Dialog · Rename project | Close | Button or link | → `SCR-WORLD` World workspace |
| Dialog · Rename project | Cancel | Button or link | → `SCR-WORLD` World workspace |
| Dialog · Rename project | Save | Button or link | → `SCR-WORLD` World workspace |

#### `MOD-DUPLICATE` Duplicate project

- **Kind:** Modal dialog of `POP-PROJECT-MENU` Project menu
- **Mockup:** *Duplicate* (`Duplicate`)
- **Reached from:** `POP-PROJECT-MENU`
- **Purpose:** Copy the project, choosing what heavy data comes along.
- **Content:**
  - New name and switches for world and body, trained brains, and training runs with their size.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **World**) · Play → `SCR-PLAY` · primary *Train* → `MOD-START-TRAINING`
- **Left column:** `PNL-EXPLORER` (**Explorer**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Copies, Layout, Randomize, Material, Friction
- **Center column:** `PNL-VIEWPORT` (**Scene**, Game view); `PNL-LIBRARY` (**Library**, Community, My files) · toolbar: Terrain, Paint, Props, Sky, Light, Camera, Copies, Randomize, Import world
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Dialog · Duplicate Park Pilot:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | Positions, colors | Button or link | → `POP-TRAINING-COPIES` Training copies |
| Left column | + Add component | Button or link | → `POP-ADD-COMPONENT` Components and Add component |
| Center column | Copies | Tool | → `POP-TRAINING-COPIES` Training copies |
| Center column | Randomize | Tool | → `POP-TRAINING-COPIES` Training copies |
| Center column | Import world | Tool | → `MOD-IMPORT` Import |
| Center column | Import environment .glb .fbx .usd | Button or link | → `MOD-IMPORT` Import |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Add rain | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Chat column | Make the spots tighter | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Chat column | Night time | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Dialog · Duplicate Park Pilot | Close | Button or link | → `SCR-WORLD` World workspace |
| Dialog · Duplicate Park Pilot | Cancel | Button or link | → `SCR-WORLD` World workspace |
| Dialog · Duplicate Park Pilot | Duplicate | Button or link | → `SCR-WORLD` World workspace |

#### `MOD-HISTORY` History

- **Kind:** Modal dialog
- **Mockup:** *History* (`Versions`)
- **Reached from:** `MOD-AUTO-RIG`, `MOD-AUTOPILOT`, `MOD-BRAIN-SIZES`, `MOD-BRAIN-SOURCE`, `MOD-DELETE-PROJECT`, `MOD-DUPLICATE`, `MOD-EXPORT-ANIMATION`, `MOD-EXPORT-BRAIN`, `MOD-IMPORT`, `MOD-MOTION-TRACKING`, `MOD-MOTION-TRAIN`, `MOD-MOTION-VIDEO`, `MOD-PUBLISH`, `MOD-PUBLISHED`, `MOD-RENAME`, `MOD-SHARE`, `MOD-START-TRAINING`, `MOD-STOP-RUN`, `POP-PROJECT-MENU`, `POP-TRAINING-COPIES`, `SCR-BODY`, `SCR-BRAIN`, `SCR-BUILD`, `SCR-IDEAS`, `SCR-MOTION`, `SCR-PLAY`, `SCR-RESULTS`, `SCR-TRAIN`, `SCR-WORLD`, `STA-BODY-CHECK-FAILED`, `STA-BRAIN-CONNECTOME`, `STA-BRAIN-NETWORK`, `STA-BUILD-HARDWARE`, `STA-MOTION-TRAINING`, `STA-RESULTS-FAILURES`, `STA-RESULTS-REFERENCE`, `STA-TRAIN-FAILED`, `STA-WORLD-BUILDING`, `STA-WORLD-EMPTY`, `STA-WORLD-EMPTY-NOGUIDE`, `STA-WORLD-PROPOSAL`
- **Purpose:** Every revision, by the user or the copilot, and restore.
- **Content:**
  - Revision id, what changed, author and time; current one marked; Restore creates a new revision.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **World**) · Play → `SCR-PLAY` · primary *Train* → `MOD-START-TRAINING`
- **Left column:** `PNL-EXPLORER` (**Explorer**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Copies, Layout, Randomize, Material, Friction
- **Center column:** `PNL-VIEWPORT` (**Scene**, Game view); `PNL-LIBRARY` (**Library**, Community, My files) · toolbar: Terrain, Paint, Props, Sky, Light, Camera, Copies, Randomize, Import world
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Dialog · History of Park Pilot:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | Positions, colors | Button or link | → `POP-TRAINING-COPIES` Training copies |
| Left column | + Add component | Button or link | → `POP-ADD-COMPONENT` Components and Add component |
| Center column | Copies | Tool | → `POP-TRAINING-COPIES` Training copies |
| Center column | Randomize | Tool | → `POP-TRAINING-COPIES` Training copies |
| Center column | Import world | Tool | → `MOD-IMPORT` Import |
| Center column | Import environment .glb .fbx .usd | Button or link | → `MOD-IMPORT` Import |
| Chat column | Add rain | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Chat column | Make the spots tighter | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Chat column | Night time | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Dialog · History of Park Pilot | Close | Button or link | → `SCR-WORLD` World workspace |
| Dialog · History of Park Pilot | Restore | Button or link | → `SCR-WORLD` World workspace |

#### `MOD-SHARE` Share

- **Kind:** Modal dialog
- **Mockup:** *Share* (`Share`)
- **Reached from:** `SCR-RESULTS` · also from every workspace header
- **Purpose:** Private sharing and collaboration. Publishing to the community is in Build.
- **Content:**
  - Visibility (only me, people I invite, anyone with the link), link, invite field, people with roles, Copy link, Done.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **World**) · Play → `SCR-PLAY` · primary *Train* → `MOD-START-TRAINING`
- **Left column:** `PNL-EXPLORER` (**Explorer**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Copies, Layout, Randomize, Material, Friction
- **Center column:** `PNL-VIEWPORT` (**Scene**, Game view); `PNL-LIBRARY` (**Library**, Community, My files) · toolbar: Terrain, Paint, Props, Sky, Light, Camera, Copies, Randomize, Import world
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Dialog · Share Park Pilot:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | Positions, colors | Button or link | → `POP-TRAINING-COPIES` Training copies |
| Left column | + Add component | Button or link | → `POP-ADD-COMPONENT` Components and Add component |
| Center column | Copies | Tool | → `POP-TRAINING-COPIES` Training copies |
| Center column | Randomize | Tool | → `POP-TRAINING-COPIES` Training copies |
| Center column | Import world | Tool | → `MOD-IMPORT` Import |
| Center column | Import environment .glb .fbx .usd | Button or link | → `MOD-IMPORT` Import |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Add rain | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Chat column | Make the spots tighter | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Chat column | Night time | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Dialog · Share Park Pilot | Close | Button or link | → `SCR-WORLD` World workspace |
| Dialog · Share Park Pilot | Invite | Button or link | → `SCR-WORLD` World workspace |
| Dialog · Share Park Pilot | Copy link | Button or link | → `SCR-WORLD` World workspace |
| Dialog · Share Park Pilot | Done | Button or link | → `SCR-WORLD` World workspace |

#### `POP-TRAINING-COPIES` Training copies

- **Kind:** Popover or menu of `SCR-WORLD` World workspace
- **Mockup:** *Training copies* (`Randomize`)
- **Reached from:** `MOD-DELETE-PROJECT`, `MOD-DUPLICATE`, `MOD-HISTORY`, `MOD-RENAME`, `MOD-SHARE`, `POP-PROJECT-MENU`, `SCR-PLAY`, `SCR-WORLD`, `STA-WORLD-PROPOSAL`
- **Purpose:** Set how many copies train in parallel and what changes between them.
- **Content:**
  - Copies and layout, explanation, *Change on every try* switches with ranges, Preview copies, Done.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **World**) · Play → `SCR-PLAY` · primary *Train* → `MOD-START-TRAINING`
- **Left column:** `PNL-EXPLORER` (**Explorer**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Copies, Layout, Randomize, Material, Friction
- **Center column:** `PNL-VIEWPORT` (**Scene**, Game view); `PNL-LIBRARY` (**Library**, Community, My files) · toolbar: Terrain, Paint, Props, Sky, Light, Camera, Copies, Randomize, Import world
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Overlay:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | Positions, colors | Button or link | Acts in place |
| Left column | + Add component | Button or link | → `POP-ADD-COMPONENT` Components and Add component |
| Center column | Copies | Tool | Acts in place |
| Center column | Randomize | Tool | Acts in place |
| Center column | Import world | Tool | → `MOD-IMPORT` Import |
| Center column | Import environment .glb .fbx .usd | Button or link | → `MOD-IMPORT` Import |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Add rain | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Chat column | Make the spots tighter | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Chat column | Night time | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Overlay | (icon) | Button or link | → `SCR-WORLD` World workspace |
| Overlay | Preview copies | Button or link | → `SCR-TIMELAPSE` Timelapse presentation |
| Overlay | Done | Button or link | → `SCR-WORLD` World workspace |

#### `MOD-AUTOPILOT` Autopilot

- **Kind:** Modal dialog of `SCR-TRAIN` Train workspace
- **Mockup:** *Autopilot* (`Autopilot`)
- **Reached from:** `MOD-STOP-RUN`, `SCR-TRAIN`, `STA-TRAIN-FAILED`
- **Purpose:** Decide how much the copilot may change on its own during training.
- **Content:**
  - Off, Ask first, Fix on its own (with a limit and each change saved as a revision).
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **Train**) · Play → `SCR-PLAY` · primary *Stop* → `MOD-STOP-RUN`
- **Left column:** `PNL-RUNS` (**Runs**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Steps, Parallel copies, Mode, Tries left
- **Center column:** `PNL-VIEWPORT` (**Live training**, Replay); `PNL-METRICS` (**Metrics**, Console) · toolbar: Train, Pause, Stop, Timelapse, Autopilot
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Dialog · Autopilot:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | Ask first | Button or link | Acts in place |
| Center column | Train | Tool | → `MOD-START-TRAINING` Start training |
| Center column | Pause | Tool | → `MOD-STOP-RUN` Stop run |
| Center column | Stop | Tool | → `MOD-STOP-RUN` Stop run |
| Center column | Timelapse | Tool | → `SCR-TIMELAPSE` Timelapse presentation |
| Center column | Autopilot | Tool | Acts in place |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Try it as run 4 | Button or link | → `MOD-START-TRAINING` Start training |
| Chat column | Explain more | Button or link | → `STA-BRAIN-NETWORK` Brain · network view |
| Chat column | Why does it scrape? | Chat suggestion | → `STA-RESULTS-FAILURES` Results · where it fails |
| Chat column | Compare with run 2 | Chat suggestion | → `SCR-RESULTS` Results workspace |
| Chat column | Stop at 500k | Chat suggestion | → `MOD-STOP-RUN` Stop run |
| Dialog · Autopilot | Close | Button or link | → `SCR-TRAIN` Train workspace |
| Dialog · Autopilot | Done | Button or link | → `SCR-TRAIN` Train workspace |

#### `MOD-STOP-RUN` Stop run

- **Kind:** Modal dialog of `SCR-TRAIN` Train workspace
- **Mockup:** *Stop run* (`StopRun`)
- **Reached from:** `MOD-AUTOPILOT`, `SCR-TRAIN`, `STA-TRAIN-FAILED` · also from every workspace header
- **Purpose:** Stop or pause a run without losing anything.
- **Content:**
  - Where the run is, best result so far, what is kept, Keep training, Pause, Stop.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **Train**) · Play → `SCR-PLAY` · primary *Stop* → `MOD-STOP-RUN`
- **Left column:** `PNL-RUNS` (**Runs**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Steps, Parallel copies, Mode, Tries left
- **Center column:** `PNL-VIEWPORT` (**Live training**, Replay); `PNL-METRICS` (**Metrics**, Console) · toolbar: Train, Pause, Stop, Timelapse, Autopilot
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Dialog · Stop run 3?:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | Ask first | Button or link | → `MOD-AUTOPILOT` Autopilot |
| Center column | Train | Tool | → `MOD-START-TRAINING` Start training |
| Center column | Pause | Tool | Acts in place |
| Center column | Stop | Tool | Acts in place |
| Center column | Timelapse | Tool | → `SCR-TIMELAPSE` Timelapse presentation |
| Center column | Autopilot | Tool | → `MOD-AUTOPILOT` Autopilot |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Try it as run 4 | Button or link | → `MOD-START-TRAINING` Start training |
| Chat column | Explain more | Button or link | → `STA-BRAIN-NETWORK` Brain · network view |
| Chat column | Why does it scrape? | Chat suggestion | → `STA-RESULTS-FAILURES` Results · where it fails |
| Chat column | Compare with run 2 | Chat suggestion | → `SCR-RESULTS` Results workspace |
| Chat column | Stop at 500k | Chat suggestion | Acts in place |
| Dialog · Stop run 3? | Close | Button or link | → `SCR-TRAIN` Train workspace |
| Dialog · Stop run 3? | Keep training | Button or link | → `SCR-TRAIN` Train workspace |
| Dialog · Stop run 3? | Pause | Button or link | → `SCR-TRAIN` Train workspace |
| Dialog · Stop run 3? | Stop run 3 | Button or link | → `SCR-RESULTS` Results workspace |

#### `STA-TRAIN-FAILED` Train · run failed

- **Kind:** State of a screen of `SCR-TRAIN` Train workspace
- **Mockup:** *Training failed* (`TrainFailed`)
- **Reached from:** `POP-NOTIFICATIONS`
- **Purpose:** A run stopped by itself. Explain why and what is safe.
- **Content:**
  - Card with the reason in plain words, technical details, Fix and restart, View log, Back to the last good run.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **Train**) · Play → `SCR-PLAY` · primary *Stop* → `MOD-STOP-RUN`
- **Left column:** `PNL-RUNS` (**Runs**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Steps, Parallel copies, Mode, Tries left
- **Center column:** `PNL-VIEWPORT` (**Live training**, Replay); `PNL-METRICS` (**Metrics**, Console) · toolbar: Train, Pause, Stop, Timelapse, Autopilot
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Overlay:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | Ask first | Button or link | → `MOD-AUTOPILOT` Autopilot |
| Center column | Train | Tool | → `MOD-START-TRAINING` Start training |
| Center column | Pause | Tool | → `MOD-STOP-RUN` Stop run |
| Center column | Stop | Tool | → `MOD-STOP-RUN` Stop run |
| Center column | Timelapse | Tool | → `SCR-TIMELAPSE` Timelapse presentation |
| Center column | Autopilot | Tool | → `MOD-AUTOPILOT` Autopilot |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Try it as run 4 | Button or link | → `MOD-START-TRAINING` Start training |
| Chat column | Explain more | Button or link | → `STA-BRAIN-NETWORK` Brain · network view |
| Chat column | Why does it scrape? | Chat suggestion | → `STA-RESULTS-FAILURES` Results · where it fails |
| Chat column | Compare with run 2 | Chat suggestion | → `SCR-RESULTS` Results workspace |
| Chat column | Stop at 500k | Chat suggestion | → `MOD-STOP-RUN` Stop run |
| Overlay | Fix and restart | Button or link | → `MOD-START-TRAINING` Start training |
| Overlay | View log | Button or link | → `SCR-TRAIN` Train workspace |
| Overlay | Back to run 3 | Button or link | → `SCR-RESULTS` Results workspace |

#### `SCR-TIMELAPSE` Timelapse presentation

- **Kind:** Screen
- **Mockup:** *Timelapse · presentation* (`Timelapse`)
- **Reached from:** `MOD-AUTOPILOT`, `MOD-REPORT`, `MOD-STOP-RUN`, `POP-TRAINING-COPIES`, `SCR-CREATION`, `SCR-PLAY`, `SCR-RESULTS`, `SCR-TRAIN`, `STA-RESULTS-FAILURES`, `STA-RESULTS-REFERENCE`, `STA-TRAIN-FAILED` · also from every workspace header
- **Purpose:** Presentation mode: show how it learned, full screen, with real metrics.
- **Content:**
  - Full-screen replay, title with checkpoint and score, checkpoint strip, play bar, Export video, Exit presentation.
- **Header:** none, full-screen presentation
- **Overlay:** no tabbed panels
- **Overlay:** no tabbed panels
- **Overlay:** no tabbed panels
- **Overlay:** no tabbed panels
- **Overlay:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Overlay | Exit presentation | Button or link | → `SCR-TRAIN` Train workspace |
| Overlay | Export video | Button or link | → `SCR-BUILD` Build workspace |

#### `MOD-EXPORT-BRAIN` Export brain

- **Kind:** Modal dialog of `SCR-BUILD` Build workspace
- **Mockup:** *Export brain* (`ExportBrain`)
- **Reached from:** `MOD-PUBLISH`, `MOD-PUBLISHED`, `SCR-BUILD`
- **Purpose:** Export the trained brain as a file.
- **Content:**
  - Format switch, options (sensor layout, runnable example, training history), file summary with inputs, outputs and rate.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **Build**) · Play → `SCR-PLAY` · primary *Publish* → `MOD-PUBLISH`
- **Left column:** `PNL-BUILD-TARGETS` (**Build**)
- **Center column:** `PNL-BUILD-TARGET-VIEW` (**Share to community**)
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Dialog · Export brain:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | Share to community Publish so others can remix it | Button or link | → `SCR-BUILD` Build workspace |
| Left column | Export brain ONNX file · 1.2 MB | Button or link | Acts in place |
| Left column | Run on real hardware Parts list · about $189 | Button or link | → `STA-BUILD-HARDWARE` Build · real hardware |
| Left column | Use in a game Unity · Godot · Roblox | Button or link | Acts in place |
| Left column | Export animation glTF · FBX (for dancers) | Button or link | → `MOD-EXPORT-ANIMATION` Export animation |
| Center column | Save draft | Button or link | → `SCR-BUILD` Build workspace |
| Center column | Publish to community | Button or link | → `MOD-PUBLISH` Publish to the community |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Write a better description | Chat suggestion | → `SCR-BUILD` Build workspace |
| Chat column | Export for Unity | Chat suggestion | Acts in place |
| Chat column | Order the parts | Chat suggestion | → `STA-BUILD-HARDWARE` Build · real hardware |
| Dialog · Export brain | Close | Button or link | → `SCR-BUILD` Build workspace |
| Dialog · Export brain | Cancel | Button or link | → `SCR-BUILD` Build workspace |
| Dialog · Export brain | Download | Button or link | → `SCR-BUILD` Build workspace |

#### `STA-BUILD-HARDWARE` Build · real hardware

- **Kind:** State of a screen of `SCR-BUILD` Build workspace
- **Mockup:** *Run on real hardware* (`Hardware`)
- **Reached from:** `MOD-EXPORT-BRAIN`, `MOD-PUBLISH`, `MOD-PUBLISHED`, `SCR-BUILD`
- **Purpose:** Run the brain on a real device, step by step and safely.
- **Content:**
  - Steps: get the parts, connect, calibrate sensors, test drive, load the brain.
  - Live sensor readings from the device with ok or check, a problem card with the fix, Recheck and Skip.
  - Preview, safety rules and parts list with total. Chat helps with the hardware.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **Build**) · Play → `SCR-PLAY` · primary *Publish* → `MOD-PUBLISH`
- **Side navigation:** no tabbed panels
- **Page:** no tabbed panels
- **Chat column:** `PNL-CHAT` (**Chat**, History)

| Region | Control | Type | Result |
|---|---|---|---|
| Page | Recheck | Button or link | Acts in place |
| Page | Skip this sensor | Button or link | Acts in place |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Explain calibration | Chat suggestion | Acts in place |
| Chat column | Order the parts | Chat suggestion | Acts in place |

#### `MOD-DELETE-PROJECT` Delete project

- **Kind:** Modal dialog of `POP-PROJECT-MENU` Project menu
- **Mockup:** *Delete project* (`DeleteProject`)
- **Reached from:** `POP-PROJECT-MENU`
- **Purpose:** Destructive confirmation with exact consequences.
- **Content:**
  - What gets deleted from this computer and its size, and what stays in the community. Red *Delete project*.
- **Header:** `HDR-WORKSPACE` · project **Park Pilot** · workspaces World · Body · Brain · Train · Results · Build (active: **World**) · Play → `SCR-PLAY` · primary *Train* → `MOD-START-TRAINING`
- **Left column:** `PNL-EXPLORER` (**Explorer**); `PNL-INSPECTOR` (**Properties**) · inspector rows: Copies, Layout, Randomize, Material, Friction
- **Center column:** `PNL-VIEWPORT` (**Scene**, Game view); `PNL-LIBRARY` (**Library**, Community, My files) · toolbar: Terrain, Paint, Props, Sky, Light, Camera, Copies, Randomize, Import world
- **Chat column:** `PNL-CHAT` (**Chat**, History)
- **Dialog · Delete Park Pilot?:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Left column | Positions, colors | Button or link | → `POP-TRAINING-COPIES` Training copies |
| Left column | + Add component | Button or link | → `POP-ADD-COMPONENT` Components and Add component |
| Center column | Copies | Tool | → `POP-TRAINING-COPIES` Training copies |
| Center column | Randomize | Tool | → `POP-TRAINING-COPIES` Training copies |
| Center column | Import world | Tool | → `MOD-IMPORT` Import |
| Center column | Import environment .glb .fbx .usd | Button or link | → `MOD-IMPORT` Import |
| Chat column | History | Tab | → `MOD-HISTORY` History |
| Chat column | Add rain | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Chat column | Make the spots tighter | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Chat column | Night time | Chat suggestion | → `STA-WORLD-PROPOSAL` World · copilot proposal preview |
| Dialog · Delete Park Pilot? | Close | Button or link | → `SCR-WORLD` World workspace |
| Dialog · Delete Park Pilot? | Cancel | Button or link | → `SCR-WORLD` World workspace |
| Dialog · Delete Park Pilot? | Delete project | Button or link | → `SCR-PROJECTS` Projects |

### Community and account

#### `SCR-PROJECTS` Projects

- **Kind:** Screen
- **Mockup:** *Projects* (`Projects`)
- **Reached from:** `MOD-DELETE-PROJECT`, `POP-PROJECT-MENU` · also from every workspace header
- **Purpose:** All local projects in one place.
- **Content:**
  - Filter (all, training, drafts, published), Open a file, New project, project cards with status pills.
- **Header:** `HDR-LAUNCHER` · active: **Projects**
- **Page:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Page | Open a file | Button or link | → `MOD-IMPORT` Import |
| Page | New project | Button or link | → `STA-WORLD-EMPTY` World · new project with guide |
| Page | Park Pilot Training · run 3 at 31% | Button or link | → `SCR-WORLD` World workspace |
| Page | Fruit Fly Connectome · tested | Button or link | → `STA-BRAIN-CONNECTOME` Brain · connectome |
| Page | Dance Copy Needs attention | Button or link | → `SCR-MOTION` Motion workspace |
| Page | Tripod Jumper Published · 128 | Button or link | → `SCR-WORLD` World workspace |
| Page | Parallel Lots Published · 46 | Button or link | → `SCR-TRAIN` Train workspace |
| Page | Untitled project Draft · yesterday | Button or link | → `STA-WORLD-EMPTY-NOGUIDE` World · new project, guide hidden |

#### `MOD-SIGN-IN` Sign in

- **Kind:** Modal dialog of `SCR-HOME` Home
- **Mockup:** *Sign in* (`SignIn`)
- **Reached from:** the workspace header
- **Purpose:** Sign in only when needed (sharing, remixing).
- **Content:**
  - Why an account is needed, Continue with Google, GitHub or email, terms.
- **Header:** `HDR-LAUNCHER` · active: **Home**
- **Page:** no tabbed panels
- **Dialog · Sign in to Icarus:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Page | Empty world Terrain, sky and camera ready | Button or link | → `STA-WORLD-EMPTY-NOGUIDE` World · new project, guide hidden |
| Page | Parking car Learns to park with sensors | Button or link | → `SCR-WORLD` World workspace |
| Page | Walker robot Learns to walk and jump | Button or link | → `SCR-WORLD` World workspace |
| Page | Dancer Copies a video | Button or link | → `MOD-MOTION-VIDEO` Copy motion from a video |
| Page | Fruit fly A real fly brain in a fly body | Button or link | → `MOD-BRAIN-SOURCE` Choose the brain source |
| Page | Import your own Model, robot or environment | Button or link | → `MOD-IMPORT` Import |
| Page | Featured | Button or link | → `SCR-COMMUNITY` Community |
| Page | Recent | Button or link | → `SCR-COMMUNITY` Community |
| Page | Most voted | Button or link | → `SCR-COMMUNITY` Community |
| Page | 2.3k Valet Bot by mara · 2.3k votes Remix | Button or link | → `SCR-CREATION` Creation page |
| Page | 1.8k Stair Tripod by kenji · 1.8k votes Remix | Button or link | → `SCR-CREATION` Creation page |
| Page | 1.4k Salsa Dancer by lu · 1.4k votes Remix | Button or link | → `SCR-CREATION` Creation page |
| Page | 960 Lot Swarm by dev_ana · 960 votes Remix | Button or link | → `SCR-CREATION` Creation page |
| Dialog · Sign in to Icarus | Close | Button or link | → `SCR-HOME` Home |
| Dialog · Sign in to Icarus | Continue with Google | Button or link | → `SCR-PROFILE` Profile |
| Dialog · Sign in to Icarus | Continue with GitHub | Button or link | → `SCR-PROFILE` Profile |
| Dialog · Sign in to Icarus | Continue with email | Button or link | → `SCR-PROFILE` Profile |

#### `SCR-COMMUNITY` Community

- **Kind:** Screen
- **Mockup:** *Community* (`Community`)
- **Reached from:** `MOD-BRAIN-SIZES`, `MOD-SIGN-IN`, `POP-NOTIFICATIONS`, `SCR-HOME` · also from every workspace header
- **Purpose:** Browse what others made.
- **Content:**
  - Featured / Recent / Most voted, category filters, review note, creation cards with votes, author and remix count.
- **Header:** `HDR-LAUNCHER` · active: **Community**
- **Page:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Page | Featured | Button or link | Acts in place |
| Page | Recent | Button or link | Acts in place |
| Page | Most voted | Button or link | Acts in place |
| Page | 2.3k MA Valet Bot @mara · 412 remixes | Button or link | → `SCR-CREATION` Creation page |
| Page | 1.8k KE Stair Tripod @kenji · 201 remixes | Button or link | → `SCR-CREATION` Creation page |
| Page | 1.4k LU Salsa Dancer @lu · 330 remixes | Button or link | → `SCR-CREATION` Creation page |
| Page | 960 DA Lot Swarm @dev_ana · 88 remixes | Button or link | → `SCR-CREATION` Creation page |
| Page | 720 RO Reverse Parker @rob · 64 remixes | Button or link | → `SCR-CREATION` Creation page |
| Page | 610 SA Desk Walker @sam · 52 remixes | Button or link | → `SCR-CREATION` Creation page |
| Page | 540 JI Ballet Bot @jin · 97 remixes | Button or link | → `SCR-CREATION` Creation page |
| Page | 480 PA Tight Spot @pau · 31 remixes | Button or link | → `SCR-CREATION` Creation page |
| Page | 3.1k NA Fruit Fly @neuro_ana · 520 remixes | Button or link | → `STA-BRAIN-CONNECTOME` Brain · connectome |
| Page | 390 TO Night Valet @tomas · 22 remixes | Button or link | → `SCR-CREATION` Creation page |
| Page | 350 RI Hip Hop Copy @rina · 41 remixes | Button or link | → `SCR-CREATION` Creation page |
| Page | 300 GE Ice Hopper @geo · 18 remixes | Button or link | → `SCR-CREATION` Creation page |

#### `SCR-CREATION` Creation page

- **Kind:** Screen
- **Mockup:** *Creation page* (`Creation`)
- **Reached from:** `MOD-PUBLISHED`, `MOD-REPORT`, `MOD-SIGN-IN`, `POP-NOTIFICATIONS`, `SCR-COMMUNITY`, `SCR-HOME`, `SCR-PROFILE`
- **Purpose:** One creation's public page.
- **Content:**
  - Hero replay with *Watch how it learned*, tabs, description, checkpoint strip, comments; author card with Follow, stats, Remix, Vote, what is included, license, Report.
- **Header:** `HDR-LAUNCHER` · active: **Community**
- **Page:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Page | Watch how it learned · 1:00 | Button or link | → `SCR-TIMELAPSE` Timelapse presentation |
| Page | How it learned | Button or link | → `SCR-TIMELAPSE` Timelapse presentation |
| Page | Start | Button or link | → `SCR-TIMELAPSE` Timelapse presentation |
| Page | 100k | Button or link | → `SCR-TIMELAPSE` Timelapse presentation |
| Page | 500k | Button or link | → `SCR-TIMELAPSE` Timelapse presentation |
| Page | 1M | Button or link | → `SCR-TIMELAPSE` Timelapse presentation |
| Page | 4M · 93% | Button or link | → `SCR-TIMELAPSE` Timelapse presentation |
| Page | MA Mara Ortiz @mara · 12 creations Follow | Button or link | → `SCR-PROFILE` Profile |
| Page | Remix into my projects | Button or link | → `STA-WORLD-EMPTY` World · new project with guide |
| Page | Vote | Button or link | Acts in place |
| Page | Report this creation | Button or link | → `MOD-REPORT` Report a creation |

#### `MOD-REPORT` Report a creation

- **Kind:** Modal dialog of `SCR-CREATION` Creation page
- **Mockup:** *Report* (`Report`)
- **Reached from:** `SCR-CREATION`
- **Purpose:** Report a creation and optionally block its author.
- **Content:**
  - Reasons as radio cards, details, block switch, Send report.
- **Header:** `HDR-LAUNCHER` · active: **Community**
- **Page:** no tabbed panels
- **Dialog · Report Valet Bot:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Page | Watch how it learned · 1:00 | Button or link | → `SCR-TIMELAPSE` Timelapse presentation |
| Page | How it learned | Button or link | → `SCR-TIMELAPSE` Timelapse presentation |
| Page | Start | Button or link | → `SCR-TIMELAPSE` Timelapse presentation |
| Page | 100k | Button or link | → `SCR-TIMELAPSE` Timelapse presentation |
| Page | 500k | Button or link | → `SCR-TIMELAPSE` Timelapse presentation |
| Page | 1M | Button or link | → `SCR-TIMELAPSE` Timelapse presentation |
| Page | 4M · 93% | Button or link | → `SCR-TIMELAPSE` Timelapse presentation |
| Page | MA Mara Ortiz @mara · 12 creations Follow | Button or link | → `SCR-PROFILE` Profile |
| Page | Remix into my projects | Button or link | → `STA-WORLD-EMPTY` World · new project with guide |
| Page | Vote | Button or link | → `SCR-CREATION` Creation page |
| Page | Report this creation | Button or link | Acts in place |
| Dialog · Report Valet Bot | Close | Button or link | → `SCR-CREATION` Creation page |
| Dialog · Report Valet Bot | Cancel | Button or link | → `SCR-CREATION` Creation page |
| Dialog · Report Valet Bot | Send report | Button or link | → `SCR-CREATION` Creation page |

#### `SCR-PROFILE` Profile

- **Kind:** Screen
- **Mockup:** *Profile* (`Profile`)
- **Reached from:** `MOD-REPORT`, `MOD-SIGN-IN`, `POP-NOTIFICATIONS`, `SCR-CREATION`, `SCR-SETTINGS-PROFILE` · also from every workspace header
- **Purpose:** Public identity in the community.
- **Content:**
  - Avatar, name, handle, bio, handwritten signature, stats, tabs (my creations, remixes, liked, drafts), creation cards with status.
- **Header:** `HDR-LAUNCHER` · active: **Home**
- **Page:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Page | Edit profile | Button or link | → `SCR-SETTINGS-MODELS` Settings · AI models |
| Page | New creation | Button or link | → `STA-WORLD-EMPTY` World · new project with guide |
| Page | Park Pilot In review | Button or link | → `SCR-CREATION` Creation page |
| Page | Tripod Jumper Public · 128 | Button or link | → `SCR-CREATION` Creation page |
| Page | Dance Copy Private | Button or link | → `SCR-CREATION` Creation page |
| Page | Parallel Lots Public · 46 | Button or link | → `SCR-CREATION` Creation page |

#### `POP-NOTIFICATIONS` Notifications

- **Kind:** Popover or menu
- **Mockup:** *Notifications* (`Notifications`)
- **Reached from:** the workspace header
- **Purpose:** What happened while the user was away.
- **Content:**
  - Runs finished or failed, publication approved, remixes, attention needed; Mark all read.
- **Header:** `HDR-LAUNCHER` · active: **Home**
- **Page:** no tabbed panels
- **Overlay:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Page | Empty world Terrain, sky and camera ready | Button or link | → `STA-WORLD-EMPTY-NOGUIDE` World · new project, guide hidden |
| Page | Parking car Learns to park with sensors | Button or link | → `SCR-WORLD` World workspace |
| Page | Walker robot Learns to walk and jump | Button or link | → `SCR-WORLD` World workspace |
| Page | Dancer Copies a video | Button or link | → `MOD-MOTION-VIDEO` Copy motion from a video |
| Page | Fruit fly A real fly brain in a fly body | Button or link | → `MOD-BRAIN-SOURCE` Choose the brain source |
| Page | Import your own Model, robot or environment | Button or link | → `MOD-IMPORT` Import |
| Page | Featured | Button or link | → `SCR-COMMUNITY` Community |
| Page | Recent | Button or link | → `SCR-COMMUNITY` Community |
| Page | Most voted | Button or link | → `SCR-COMMUNITY` Community |
| Page | 2.3k Valet Bot by mara · 2.3k votes Remix | Button or link | → `SCR-CREATION` Creation page |
| Page | 1.8k Stair Tripod by kenji · 1.8k votes Remix | Button or link | → `SCR-CREATION` Creation page |
| Page | 1.4k Salsa Dancer by lu · 1.4k votes Remix | Button or link | → `SCR-CREATION` Creation page |
| Page | 960 Lot Swarm by dev_ana · 960 votes Remix | Button or link | → `SCR-CREATION` Creation page |
| Overlay | ! Run 4 stopped The physics went unstable at 41k steps. 5 min | Button or link | → `STA-TRAIN-FAILED` Train · run failed |
| Overlay | Park Pilot is public It passed review. 12 people saw it in the last hour. 2 min | Button or link | → `SCR-CREATION` Creation page |
| Overlay | Run 3 finished Parks 71% of the time. The best brain is saved. 40 min | Button or link | → `SCR-RESULTS` Results workspace |
| Overlay | @mara remixed Tripod Jumper Her version climbs stairs. 3 h | Button or link | → `SCR-PROFILE` Profile |
| Overlay | ! Dance Copy needs attention The spin at 0:07 loses balance. yesterday | Button or link | → `SCR-MOTION` Motion workspace |

#### `STA-HOME-EMPTY` Home · first launch

- **Kind:** State of a screen of `SCR-HOME` Home
- **Mockup:** *Home · no creations yet* (`EmptyHome`)
- **Reached from:** entry point
- **Purpose:** Home on first launch, before any creation.
- **Content:**
  - Same hero and templates, plus an empty state with *Take the 3 minute tour*.
- **Header:** `HDR-LAUNCHER` · active: **Home**
- **Page:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Page | Empty world Terrain, sky and camera ready | Button or link | → `STA-WORLD-EMPTY-NOGUIDE` World · new project, guide hidden |
| Page | Parking car Learns to park with sensors | Button or link | → `SCR-WORLD` World workspace |
| Page | Walker robot Learns to walk and jump | Button or link | → `SCR-WORLD` World workspace |
| Page | Dancer Copies a video | Button or link | → `MOD-MOTION-VIDEO` Copy motion from a video |
| Page | Fruit fly A real fly brain in a fly body | Button or link | → `MOD-BRAIN-SOURCE` Choose the brain source |
| Page | Import your own Model, robot or environment | Button or link | → `MOD-IMPORT` Import |
| Page | Take the 3 minute tour | Button or link | → `STA-WORLD-EMPTY` World · new project with guide |

#### `SCR-SETTINGS-MODELS` Settings · AI models

- **Kind:** Screen
- **Mockup:** *Settings · AI models* (`Settings`)
- **Reached from:** `SCR-PROFILE`, `SCR-SETTINGS-NOTIFICATIONS`, `SCR-SETTINGS-PRIVACY`, `SCR-SETTINGS-PROFILE`, `SCR-SETTINGS-TRAINING`
- **Purpose:** Connect AI models per capability.
- **Content:**
  - Reasoning, Vision, Images, Pose with model and status; endpoint and key stored on this computer; Test connection, Save.
- **Header:** `HDR-LAUNCHER` · active: **Home**
- **Side navigation:** no tabbed panels
- **Page:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Side navigation | Profile | Button or link | → `SCR-SETTINGS-PROFILE` Settings · profile |
| Side navigation | AI models | Button or link | Acts in place |
| Side navigation | Privacy and safety | Button or link | → `SCR-SETTINGS-PRIVACY` Settings · privacy and safety |
| Side navigation | Blocked people | Button or link | → `SCR-SETTINGS-PRIVACY` Settings · privacy and safety |
| Side navigation | Training and hardware | Button or link | → `SCR-SETTINGS-TRAINING` Settings · training and hardware |
| Side navigation | Notifications | Button or link | → `SCR-SETTINGS-NOTIFICATIONS` Settings · notifications |
| Page | Test connection | Button or link | Acts in place |
| Page | Save | Button or link | → `SCR-HOME` Home |

#### `SCR-SETTINGS-PROFILE` Settings · profile

- **Kind:** Screen
- **Mockup:** *Settings · profile* (`SettingsProfile`)
- **Reached from:** `SCR-SETTINGS-MODELS`, `SCR-SETTINGS-NOTIFICATIONS`, `SCR-SETTINGS-PRIVACY`, `SCR-SETTINGS-TRAINING`
- **Purpose:** Edit the public profile and signature.
- **Header:** `HDR-LAUNCHER` · active: **Home**
- **Side navigation:** no tabbed panels
- **Page:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Side navigation | Profile | Button or link | Acts in place |
| Side navigation | AI models | Button or link | → `SCR-SETTINGS-MODELS` Settings · AI models |
| Side navigation | Privacy and safety | Button or link | → `SCR-SETTINGS-PRIVACY` Settings · privacy and safety |
| Side navigation | Blocked people | Button or link | → `SCR-SETTINGS-PRIVACY` Settings · privacy and safety |
| Side navigation | Training and hardware | Button or link | → `SCR-SETTINGS-TRAINING` Settings · training and hardware |
| Side navigation | Notifications | Button or link | → `SCR-SETTINGS-NOTIFICATIONS` Settings · notifications |
| Page | Change photo | Button or link | Acts in place |
| Page | Remove | Button or link | Acts in place |
| Page | Save | Button or link | → `SCR-PROFILE` Profile |

#### `SCR-SETTINGS-PRIVACY` Settings · privacy and safety

- **Kind:** Screen
- **Mockup:** *Settings · privacy* (`SettingsPrivacy`)
- **Reached from:** `SCR-SETTINGS-MODELS`, `SCR-SETTINGS-NOTIFICATIONS`, `SCR-SETTINGS-PROFILE`, `SCR-SETTINGS-TRAINING`
- **Purpose:** Control what is public and who is blocked.
- **Content:**
  - Switches for showing creations, remixing and comments; blocked people with Unblock; Download my data; Delete account.
- **Header:** `HDR-LAUNCHER` · active: **Home**
- **Side navigation:** no tabbed panels
- **Page:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Side navigation | Profile | Button or link | → `SCR-SETTINGS-PROFILE` Settings · profile |
| Side navigation | AI models | Button or link | → `SCR-SETTINGS-MODELS` Settings · AI models |
| Side navigation | Privacy and safety | Button or link | Acts in place |
| Side navigation | Blocked people | Button or link | Acts in place |
| Side navigation | Training and hardware | Button or link | → `SCR-SETTINGS-TRAINING` Settings · training and hardware |
| Side navigation | Notifications | Button or link | → `SCR-SETTINGS-NOTIFICATIONS` Settings · notifications |
| Page | Unblock | Button or link | Acts in place |
| Page | Download my data | Button or link | Acts in place |
| Page | Delete account | Button or link | Acts in place |

#### `SCR-SETTINGS-TRAINING` Settings · training and hardware

- **Kind:** Screen
- **Mockup:** *Settings · training* (`SettingsTraining`)
- **Reached from:** `POP-PROJECT-MENU`, `SCR-SETTINGS-MODELS`, `SCR-SETTINGS-NOTIFICATIONS`, `SCR-SETTINGS-PRIVACY`, `SCR-SETTINGS-PROFILE`
- **Purpose:** Control how training uses this computer.
- **Content:**
  - CPU threads, graphics card, projects folder, checkpoints kept, engine status with Restart engine.
- **Header:** `HDR-LAUNCHER` · active: **Home**
- **Side navigation:** no tabbed panels
- **Page:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Side navigation | Profile | Button or link | → `SCR-SETTINGS-PROFILE` Settings · profile |
| Side navigation | AI models | Button or link | → `SCR-SETTINGS-MODELS` Settings · AI models |
| Side navigation | Privacy and safety | Button or link | → `SCR-SETTINGS-PRIVACY` Settings · privacy and safety |
| Side navigation | Blocked people | Button or link | → `SCR-SETTINGS-PRIVACY` Settings · privacy and safety |
| Side navigation | Training and hardware | Button or link | Acts in place |
| Side navigation | Notifications | Button or link | → `SCR-SETTINGS-NOTIFICATIONS` Settings · notifications |
| Page | Restart engine | Button or link | → `SYS-ENGINE-DOWN` Engine stopped |

#### `SCR-SETTINGS-NOTIFICATIONS` Settings · notifications

- **Kind:** Screen
- **Mockup:** *Settings · notifications* (`SettingsNotifications`)
- **Reached from:** `SCR-SETTINGS-MODELS`, `SCR-SETTINGS-PRIVACY`, `SCR-SETTINGS-PROFILE`, `SCR-SETTINGS-TRAINING`
- **Purpose:** Choose what to be told about.
- **Header:** `HDR-LAUNCHER` · active: **Home**
- **Side navigation:** no tabbed panels
- **Page:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Side navigation | Profile | Button or link | → `SCR-SETTINGS-PROFILE` Settings · profile |
| Side navigation | AI models | Button or link | → `SCR-SETTINGS-MODELS` Settings · AI models |
| Side navigation | Privacy and safety | Button or link | → `SCR-SETTINGS-PRIVACY` Settings · privacy and safety |
| Side navigation | Blocked people | Button or link | → `SCR-SETTINGS-PRIVACY` Settings · privacy and safety |
| Side navigation | Training and hardware | Button or link | → `SCR-SETTINGS-TRAINING` Settings · training and hardware |
| Side navigation | Notifications | Button or link | Acts in place |

### System and team

#### `SYS-ENGINE-DOWN` Engine stopped

- **Kind:** System screen
- **Mockup:** *Engine stopped* (`EngineDown`)
- **Reached from:** `SCR-SETTINGS-TRAINING`
- **Purpose:** The local engine stopped. Reassure and recover.
- **Content:**
  - Power icon, what happened, what is safe, Restart engine, Copy error details, technical details.
- **Header:** none, full-screen presentation
- **Page:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Page | Restart engine | Button or link | → `SCR-HOME` Home |
| Page | Copy error details | Button or link | Acts in place |

#### `SCR-MODERATION` Moderation (team tool)

- **Kind:** Screen
- **Mockup:** *Moderation · team only* (`Moderation`)
- **Reached from:** entry point
- **Purpose:** Team-only tool to review reported creations. Not part of the desktop app.
- **Content:**
  - Reports, new creations, banned people, appeals; each report with preview, reason, count, automatic scan result, Keep, Remove, Ban user.
- **Header:** Window title bar · Icarus · Moderation Team only Signed in as moderator
- **Side navigation:** no tabbed panels
- **Page:** no tabbed panels

| Region | Control | Type | Result |
|---|---|---|---|
| Page | Keep | Button or link | Acts in place |
| Page | Remove | Button or link | Acts in place |
| Page | Ban user | Button or link | Acts in place |

## Index

| ID | Name | Kind | Mockup |
|---|---|---|---|
| `MOD-AUTO-RIG` | Auto-rig progress | Modal dialog | `AutoRig` |
| `MOD-AUTOPILOT` | Autopilot | Modal dialog | `Autopilot` |
| `MOD-BRAIN-SIZES` | Brain sizes | Modal dialog | `BrainOptions` |
| `MOD-BRAIN-SOURCE` | Choose the brain source | Modal dialog | `ConnectomeImport` |
| `MOD-DELETE-PROJECT` | Delete project | Modal dialog | `DeleteProject` |
| `MOD-DUPLICATE` | Duplicate project | Modal dialog | `Duplicate` |
| `MOD-EXPORT-ANIMATION` | Export animation | Modal dialog | `ExportAnim` |
| `MOD-EXPORT-BRAIN` | Export brain | Modal dialog | `ExportBrain` |
| `MOD-HISTORY` | History | Modal dialog | `Versions` |
| `MOD-IMPORT` | Import | Modal dialog | `Import` |
| `MOD-MOTION-TRACKING` | Tracking the motion | Modal dialog | `PoseProgress` |
| `MOD-MOTION-TRAIN` | Train the copy | Modal dialog | `TrainMotion` |
| `MOD-MOTION-VIDEO` | Copy motion from a video | Modal dialog | `UploadVideo` |
| `MOD-PUBLISH` | Publish to the community | Modal dialog | `Publish` |
| `MOD-PUBLISHED` | Sent for review | Modal dialog | `Published` |
| `MOD-RENAME` | Rename project | Modal dialog | `Rename` |
| `MOD-REPORT` | Report a creation | Modal dialog | `Report` |
| `MOD-SHARE` | Share | Modal dialog | `Share` |
| `MOD-SIGN-IN` | Sign in | Modal dialog | `SignIn` |
| `MOD-START-TRAINING` | Start training | Modal dialog | `StartTraining` |
| `MOD-STOP-RUN` | Stop run | Modal dialog | `StopRun` |
| `POP-ADD-COMPONENT` | Components and Add component | Popover or menu | `Components` |
| `POP-NOTIFICATIONS` | Notifications | Popover or menu | `Notifications` |
| `POP-PROJECT-MENU` | Project menu | Popover or menu | `ProjectMenu` |
| `POP-TRAINING-COPIES` | Training copies | Popover or menu | `Randomize` |
| `REF-PROPERTY-TYPES` | Property types | Design reference | `PropertyTypes` |
| `SCR-BODY` | Body workspace | Screen | `Body` |
| `SCR-BRAIN` | Brain workspace | Screen | `Brain` |
| `SCR-BUILD` | Build workspace | Screen | `Build` |
| `SCR-COMMUNITY` | Community | Screen | `Community` |
| `SCR-CREATION` | Creation page | Screen | `Creation` |
| `SCR-HOME` | Home | Screen | `Main` |
| `SCR-IDEAS` | Ideas | Screen | `Proposals` |
| `SCR-MODERATION` | Moderation (team tool) | Screen | `Moderation` |
| `SCR-MOTION` | Motion workspace | Screen | `Motion` |
| `SCR-PLAY` | Play | Screen | `PlayCar` |
| `SCR-PLAY` | Play | Screen | `PlayFly` |
| `SCR-PROFILE` | Profile | Screen | `Profile` |
| `SCR-PROJECTS` | Projects | Screen | `Projects` |
| `SCR-RESULTS` | Results workspace | Screen | `Results` |
| `SCR-SETTINGS-MODELS` | Settings · AI models | Screen | `Settings` |
| `SCR-SETTINGS-NOTIFICATIONS` | Settings · notifications | Screen | `SettingsNotifications` |
| `SCR-SETTINGS-PRIVACY` | Settings · privacy and safety | Screen | `SettingsPrivacy` |
| `SCR-SETTINGS-PROFILE` | Settings · profile | Screen | `SettingsProfile` |
| `SCR-SETTINGS-TRAINING` | Settings · training and hardware | Screen | `SettingsTraining` |
| `SCR-TIMELAPSE` | Timelapse presentation | Screen | `Timelapse` |
| `SCR-TRAIN` | Train workspace | Screen | `Train` |
| `SCR-WORLD` | World workspace | Screen | `World` |
| `STA-BODY-CHECK-FAILED` | Body · physics check failed | State of a screen | `DesignFailed` |
| `STA-BRAIN-CONNECTOME` | Brain · connectome | State of a screen | `FlyBrain` |
| `STA-BRAIN-NETWORK` | Brain · network view | State of a screen | `Network` |
| `STA-BUILD-HARDWARE` | Build · real hardware | State of a screen | `Hardware` |
| `STA-HOME-EMPTY` | Home · first launch | State of a screen | `EmptyHome` |
| `STA-MOTION-TRAINING` | Motion · training the copy | State of a screen | `MotionTraining` |
| `STA-RESULTS-FAILURES` | Results · where it fails | State of a screen | `Diagnose` |
| `STA-RESULTS-REFERENCE` | Results · compare with recordings | State of a screen | `FlyCompare` |
| `STA-TRAIN-FAILED` | Train · run failed | State of a screen | `TrainFailed` |
| `STA-WORLD-BUILDING` | World · building | State of a screen | `Generating` |
| `STA-WORLD-EMPTY` | World · new project with guide | State of a screen | `NewProject` |
| `STA-WORLD-EMPTY-NOGUIDE` | World · new project, guide hidden | State of a screen | `NewProjectNoGuide` |
| `STA-WORLD-PROPOSAL` | World · copilot proposal preview | State of a screen | `ProposedChange` |
| `SYS-ENGINE-DOWN` | Engine stopped | System screen | `EngineDown` |
