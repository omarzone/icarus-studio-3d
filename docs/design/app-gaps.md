# App gaps against the design

What the design proposes, what the app does today, and what the spec plans for each part. It was first written from the reference renders in `docs/design/reference/`, the design source files, `screens.md`, the plans in `docs/plans/` and the renderer, port and engine code as of 2026-11-01. On 2026-11-03 every row that was not `works` was checked again against `main`, after the body rig, motion, brain, build, community and multi-agent work landed.

## How to read the tables

**App today**

| Value | Meaning |
|---|---|
| works | Real in app mode, backed by the engine or by real local state |
| partial | Real in part; the rest is missing, simplified or different from the design |
| pending | The app side is `pending(...)` or a dimmed control that honestly says "not available yet" |
| fixture-only | Rendered only from design samples in the prototype; the app never produces it |
| missing | Neither the app nor the prototype has it |
| broken | Shown in the app but does nothing, or says something untrue |

**In spec?**

| Value | Meaning |
|---|---|
| built | Delivered: a sprint plan or `app-flows.md` names it and the app does it |
| planned | A sprint or an explicit deferral names it, and it is not fully delivered yet |
| not in spec | Only the design has it |

## 1. Summary

There are 593 features across seven groups.

| App today | Count | | In spec? | Count |
|---|---|---|---|---|
| works | 354 | | built | 364 |
| partial | 146 | | planned | 158 |
| pending | 18 | | not in spec | 71 |
| fixture-only | 18 | | | |
| missing | 53 | | | |
| broken | 4 | | | |

| Group | Features | works | partial | pending | fixture-only | missing | broken |
|---|---|---|---|---|---|---|---|
| Launcher, projects, community, settings, system | 107 | 78 | 19 | 3 | 2 | 5 | 0 |
| World, ideas, editor panels | 121 | 70 | 24 | 7 | 2 | 17 | 1 |
| Copilot | 44 | 33 | 8 | 1 | 1 | 1 | 0 |
| Brain | 68 | 31 | 22 | 2 | 5 | 8 | 0 |
| Body and motion | 87 | 38 | 32 | 2 | 3 | 9 | 3 |
| Train and results | 91 | 59 | 26 | 0 | 2 | 4 | 0 |
| Play and build | 75 | 45 | 15 | 3 | 3 | 9 | 0 |

The short version:

- **Real today:** local projects and their history; the World editor loop; ideas with tweak and mix; the copilot with proposals, check lists, live steps, run cards, milestones and chips that route by intent; live Play on MuJoCo with the newest fitting brain; Train with pause, coaching and the autopilot; Results with failure groups, diagnoses, behavior tests and the timelapse; the Brain workspace (senses, motors, rewards, settings, sizes, network from a checkpoint); the Body workspace (import as mesh, auto-rig, rig check, test poses, skin weights); Motion from video (tracking with the pose model, imitation training, comparison, JSON and BVH export); Build (export plan, ONNX, URDF, MJCF, hardware check); and the community (sign-in, catalog, creation pages, remix, votes, reports, moderation, sharing, publishing, profile and privacy settings).
- **Not built yet:** connectome brains (`STA-BRAIN-CONNECTOME` and the fly source), so the connectome panels show the trained brain instead; curriculum stages; imported reference recordings; comments on creations; glTF and FBX animation export; URDF and MJCF robot import; installers (Sprint 14).
- **Broken (says or offers something it does not do):** clicking a rig check problem does nothing; the amber "Can't train yet" banner counts findings that do not block training; the animation export Target field is never sent; and the Library's Community shelf always says nothing is published.
- **Most visible partials:** pictures missing where real data exists (Home community cards, the share preview card, moderation previews, the video behind the motion skeleton); views that read one evaluation instead of live data (brain readings, network glow, brain activity); and notifications that never fire for local runs.

### Diagnosis: body rig, motion and connectome

The three workspaces this section diagnosed on 2026-11-01 now stand as follows.

| Pillar | Design IDs | Today | What is left | Plan |
|---|---|---|---|---|
| Body rig and import | `SCR-BODY`, `TAB-RIG-VIEW`, `TAB-MESH-VIEW`, `PNL-RIG-CHECK`, `MOD-IMPORT`, `MOD-AUTO-RIG`, `STA-BODY-CHECK-FAILED` | Built: mesh import (static or auto-rigged), auto-rig with progress, rig check with fixes, test poses, skin weights with auto-fix, skins drawn over the physical body | Bone and joint tool modes, a mesh-only view, weight painting, an import preview, URDF and MJCF import, a true stand-up test, the two broken rig-check rows | [`sprint-09-body-rig.md`](../plans/sprint-09-body-rig.md) |
| Motion from video | `SCR-MOTION`, `MOD-MOTION-VIDEO`, `MOD-MOTION-TRACKING`, `MOD-MOTION-TRAIN`, `STA-MOTION-TRAINING`, `MOD-EXPORT-ANIMATION` | Built: frames sampled from a chosen part of the video, tracking through the `pose` capability with real frame previews, retargeting, imitation training with a tracking reward, match per moment and limb, JSON and BVH export | The video picture behind the skeleton, Play for the clip, link and webcam sources, glTF and FBX export, named target rigs. Tracking with a general vision model drifts on fast moves; a dedicated pose estimator would track better | [`sprint-10-motion.md`](../plans/sprint-10-motion.md) |
| Connectome brain | `MOD-BRAIN-SOURCE`, `STA-BRAIN-CONNECTOME`, `PNL-BRAIN-ACTIVITY`, `STA-RESULTS-REFERENCE` | Not built: these panels show the trained brain (its readings, layers, behaviors and wiring) and behavior tests compare checkpoints | Connectome data, a spiking simulator fast enough for Play, the fly body, taste and looming senses, reference recordings | [`sprint-11-connectome.md`](../plans/sprint-11-connectome.md) |

`MOD-BRAIN-SOURCE` still says "Motor neurons drive the leg and wing joints · 92% matched", which the data cannot support; once connectomes are real that line becomes the count of descending neurons driving the gait generator.

## 2. Per screen group

Every reference render in `docs/design/reference/` (62 IDs) and every screen in `screens.md` has at least one row. `regions.json` in that folder is panel geometry for the visual tests, not a screen. Rows marked (added) or (corrected) came from a completeness pass against the renders and the code.

### Launcher, projects, community, settings, system

| ID | Feature | App today | In spec? | What it needs |
|---|---|---|---|---|
| SCR-HOME | Hero with a live 3D lot grid behind it | missing | not in spec | A hero scene rendered from a real compiled template with `scene/`, no hand animation |
| SCR-HOME | Headline and subtitle | works | built | Nothing |
| SCR-HOME | Prompt field opens SCR-IDEAS with the sentence | works | built | Nothing |
| SCR-HOME | "Press enter to see 3 ideas" hint | works | built | Nothing (it also navigates with an empty prompt) |
| SCR-HOME | Template row: Empty world, Parking car, Walker, Dancer, Fruit fly | partial | planned | Dancer (Sprint 10) and Fruit fly (Sprint 11) templates; `templateView` must map those kinds |
| SCR-HOME | Rendered 3D thumbnail per template | works | built | Nothing |
| SCR-HOME | Template opens the right workspace (Dancer to motion video, Fruit fly to brain source) | partial | planned | Sprint 10 and 11 templates |
| SCR-HOME | "Import your own" card | pending | planned | Import works inside a project, but from Home with no project open MOD-IMPORT only says no project is open; import without an open project. |
| SCR-HOME | Community header with Featured, Recent, Most voted | works | built | Nothing |
| SCR-HOME | Four community cards with thumbnail, votes, Remix | partial | planned | Cards, votes and Remix are real from the community service, but the Home strip leaves the thumbnail area empty; draw the creation picture as the Community screen does. |
| SCR-HOME | Remix pill starts a project from a creation | works | built | Nothing |
| STA-HOME-EMPTY | First-launch card with the 3 minute tour | works | built | Nothing |
| HDR-WORKSPACE | Project name with chevron opening POP-PROJECT-MENU (added) | works | built | Nothing |
| HDR-WORKSPACE | Workspace switcher World, Body, Motion, Brain, Train, Results, Build (added) | works | built | Motion appears only for character projects with clips (Sprint 10) |
| HDR-WORKSPACE | "+" after the tabs to add a workspace (added) | missing | not in spec | `workspace-header.tsx` renders no "+"; decide what adding a workspace means or drop it from the design |
| HDR-WORKSPACE | Play button, disabled until a design exists (added) | works | built | Nothing |
| HDR-WORKSPACE | "Getting started n/N" guide pill (added) | works | built | In the app it opens the engine checklist in place |
| HDR-WORKSPACE | Share button (added) | works | built | Nothing |
| HDR-WORKSPACE | Primary action follows the next step (Train, Stop, Publish, Train copy, Run test) (added) | works | built | Nothing |
| HDR-WORKSPACE | One-line hover purpose on tabs, Play, Share, primary (added) | works | built | Nothing |
| HDR-LAUNCHER | Home, Projects, Community tabs | works | built | Nothing |
| HDR-LAUNCHER | "Search creations" field | works | built | Nothing |
| HDR-LAUNCHER | Bell with unread dot | works | built | Nothing |
| HDR-LAUNCHER | Avatar opens profile or sign-in | works | built | Nothing |
| SCR-PROJECTS | Grid of local projects | works | built | Nothing |
| SCR-PROJECTS | Rendered thumbnail per project revision | works | built | Nothing |
| SCR-PROJECTS | Status pill per card (training, needs attention, published, draft yesterday) | partial | not in spec | "Training · Run N at P%" is real now; failed runs, published state and last-modified time are not in `ProjectSummary` |
| SCR-PROJECTS | Filter All, Training, Drafts, Published | partial | not in spec | Published never fills because ProjectSummary carries no publish state, and its empty state still says publishing is not available yet. |
| SCR-PROJECTS | Open in the workspace it was last in | works | not in spec | Nothing |
| SCR-PROJECTS | "Open a file" button | pending | planned | Opens MOD-IMPORT, which needs an open project and otherwise only says no project is open; import without an open project. |
| SCR-PROJECTS | "New project" starts an empty world with the guide | works | built | Nothing |
| SCR-PROJECTS | Saved-locally note and empty states | works | built | Nothing |
| SCR-COMMUNITY | Featured, Recent, Most voted switch | works | built | Nothing |
| SCR-COMMUNITY | Category chips | works | built | Nothing |
| SCR-COMMUNITY | "Every creation is reviewed" note | partial | planned | Moderation exists, but the service defaults to publishing straight to public; require review by default or change the line. |
| SCR-COMMUNITY | Creation cards with thumbnail, votes, author, remixes | works | built | Nothing |
| SCR-CREATION | Hero replay with "Watch how it learned" | partial | planned | The hero shows the published thumbnail, but bundles carry no training history, so the timelapse reads "not published"; publish rollouts with the bundle. |
| SCR-CREATION | Tabs Overview, How it learned, Brain, Versions, Comments | partial | planned | Overview and Versions are real; Brain and Comments are always empty and How it learned has no published timelapse. |
| SCR-CREATION | Checkpoint strip opening the timelapse at a step | fixture-only | planned | The app maps no checkpoints, so the strip never renders; needs checkpoint thumbnails in the bundle. |
| SCR-CREATION | Comment list (read only) | fixture-only | planned | The community service has no comments; the app always shows "No comments yet". |
| SCR-CREATION | Author card with Follow | works | built | Nothing |
| SCR-CREATION | Votes, remixes, downloads tiles | works | built | Nothing |
| SCR-CREATION | "Remix into my projects" | works | built | Nothing |
| SCR-CREATION | Vote | works | built | Nothing |
| SCR-CREATION | "Included" list and license | works | built | Nothing |
| SCR-CREATION | Report this creation | works | built | Nothing |
| MOD-REPORT | Reason radio cards (offensive, stolen, spam, harmful, other) (added) | works | built | Nothing |
| MOD-REPORT | Details field and "Block the author" switch (added) | works | built | Nothing |
| MOD-REPORT | Send report (added) | works | built | Nothing |
| SCR-MODERATION | Team-only screen with its own title bar, "Signed in as moderator" (added) | partial | planned | The screen and role check on the service are real, but "Signed in as moderator" is fixed text; read the role from the account. |
| SCR-MODERATION | Queues Reports, New creations, Banned people, Appeals with counts (added) | works | built | Nothing |
| SCR-MODERATION | Report card with preview, reason, report count, automatic scan result (added) | partial | planned | Reason, report count and scan are real; the preview is an empty box, so show the creation thumbnail. |
| SCR-MODERATION | Keep, Remove, Ban user (added) | works | built | Nothing |
| SCR-MODERATION | "Nothing to review" empty queue (added) | works | built | Nothing |
| SCR-PROFILE | Header with avatar, bio, signature, Edit profile | works | built | Nothing |
| SCR-PROFILE | Stats: creations, votes, remixes, followers | works | built | Nothing |
| SCR-PROFILE | Shelves My creations, Remixes, Liked, Drafts | works | built | Nothing |
| SCR-PROFILE | Follow on someone else's profile | works | built | Nothing |
| MOD-SIGN-IN | Google, GitHub, email sign-in | works | built | Nothing |
| POP-NOTIFICATIONS | Run stopped/finished, publication approved, remixes, each opening its screen | partial | planned | Votes, remixes, follows, invites and moderation results come from the community and open their screen; local run stopped or finished notifications are never produced. |
| POP-NOTIFICATIONS | Unread highlight and "Mark all read" | works | built | Nothing |
| POP-PROJECT-MENU | Rename, Duplicate, History with revision, Open, Settings, Delete, Home | works | built | Nothing |
| POP-PROJECT-MENU | "Ctrl O" shown next to Open project | works | not in spec | Nothing |
| POP-PROJECT-MENU | "Project settings" item | partial | not in spec | Opens the global Training settings; per-project settings or an honest label |
| POP-PROJECT-MENU | Project actions by asking the copilot | missing | planned | Copilot tools to list, duplicate, delete and open projects (Sprint 6 rule "copilot hooks for every UI") |
| MOD-RENAME | Name and short description, Save disabled without a name | works | built | Nothing |
| MOD-DUPLICATE | Prefilled "X copy" name | works | built | Nothing |
| MOD-DUPLICATE | Switches for world and body, trained brains, runs (with size) | partial | planned | Brains and runs switches honestly disable when runs stay with the original, but the World and body switch has no effect and run size is never measured. |
| MOD-DELETE-PROJECT | States what is deleted (project, N runs, size) | partial | planned | Run count is real now and the dialog says runs stay; run size is not measured and engine delete leaves runs on disk |
| MOD-DELETE-PROJECT | Delete removes it and returns to Projects | works | built | Nothing |
| MOD-SHARE | Visibility switch | works | built | Nothing |
| MOD-SHARE | Link field and Copy link | works | built | Nothing |
| MOD-SHARE | Invite by email | works | built | Nothing |
| MOD-SHARE | People list with roles | works | built | Nothing |
| MOD-PUBLISH | Who it appears as and what people can do | works | built | Nothing |
| MOD-PUBLISH | Automatic checks (no personal data, no code, title written) | partial | planned | Title and physical tests are checked and the service refuses code-like bundles, but there is no personal-data check and the no-code line is always shown as passed. |
| MOD-PUBLISH | Guideline agreement gating Publish | works | built | Nothing |
| MOD-PUBLISH | Publish sends for review | works | built | Nothing |
| MOD-PUBLISHED | "Sent for review" confirmation | works | built | Nothing |
| MOD-IMPORT | Kind switch: model, environment, robot | partial | planned | Model and environment import a glTF or GLB as a skin over a collider (ADR 008); robots wait for URDF and MJCF import (Sprint 9) |
| MOD-IMPORT | Choosing or dropping the file | partial | planned | Choose file takes .glb, .gltf, .obj or .stl; FBX and USD are refused and there is no drop zone. |
| MOD-IMPORT | 3D preview with triangles, height, detected kind | missing | planned | The dialog shows only the file name and size with no preview; read the model for triangles, height and kind and show a 3D preview. |
| MOD-IMPORT | Steps auto-rig will run | works | built | Nothing |
| MOD-IMPORT | Import as static mesh, Import and auto-rig | works | built | Nothing |
| MOD-IMPORT | Opening Import with no project open | pending | not in spec | Decide whether import from the launcher creates a project first |
| SCR-SETTINGS | Side navigation | works | built | Nothing |
| SCR-SETTINGS-MODELS | One row per capability with status | works | built | Nothing |
| SCR-SETTINGS-MODELS | Endpoint and API key stored locally | works | built | Nothing |
| SCR-SETTINGS-MODELS | Test connection and Save | works | built | Nothing |
| SCR-SETTINGS-PROFILE | Change and remove photo | works | built | Nothing |
| SCR-SETTINGS-PROFILE | Name, username, location, website, bio | works | built | Nothing |
| SCR-SETTINGS-PROFILE | Signature on my creations | partial | planned | The switch is saved on the account and shown on the profile and in Publish, but the signature is not stamped into bundles or creation pages. |
| SCR-SETTINGS-PRIVACY | Show, remix, comments switches | works | built | Nothing |
| SCR-SETTINGS-PRIVACY | Blocked people with Unblock | works | built | Nothing |
| SCR-SETTINGS-PRIVACY | Download my data, Delete account | works | built | Nothing |
| SCR-SETTINGS-TRAINING | CPU threads slider | works | built | Nothing |
| SCR-SETTINGS-TRAINING | Use a graphics card when found | works | built | Nothing |
| SCR-SETTINGS-TRAINING | Editable projects folder | works | not in spec | Nothing |
| SCR-SETTINGS-TRAINING | Keep checkpoints policy | works | not in spec | Nothing |
| SCR-SETTINGS-TRAINING | Engine status with Restart | works | built | "healthy" is hardcoded but only shown after the engine answered |
| SCR-SETTINGS-NOTIFICATIONS | Run finished, copilot needs OK, remixes, news | partial | planned | The switches are saved on the community account, but run-finished and copilot notifications are never sent, and the page claims they show in the system tray. |
| SCR-SETTINGS-NOTIFICATIONS | Notifications in the system tray | missing | not in spec | Electron Notification from the main process on run events; the Notifications page already says notifications show in the tray. |
| SCR-SETTINGS | Community server (official or self-hosted) | works | built | Nothing |
| SYS-ENGINE-DOWN | Full-screen "The Icarus engine stopped" | works | built | Nothing |
| SYS-ENGINE-DOWN | Copy "Training runs pause until the engine is back" | works | not in spec | Nothing |
| SYS-ENGINE-DOWN | Restart returns to the covered screen | works | built | Nothing |
| SYS-ENGINE-DOWN | Copy error details | works | built | Nothing |

### World, ideas, editor panels

| ID | Feature | App today | In spec? | What it needs |
|---|---|---|---|---|
| SCR-WORLD | Explorer and Properties, viewport with toolbar and Library, chat | works | built | Nothing |
| SCR-WORLD | Viewport shows the project's world | works | built | Parked-car lot content exists only if the copilot builds it |
| SCR-WORLD | The 16 training copies laid out around the edited world | partial | not in spec | Draw copies in the Scene tab; today only through Preview copies |
| PNL-EXPLORER | Workspace (Camera, Terrain, Sky, Lighting), World and Agents sections | partial | built | Group environment objects under Workspace; a camera object in the library |
| PNL-EXPLORER | Row meta ("x 16 copies", "6 spots", "dusk") | partial | built | Richer `objectMeta`; today only surface kind or "static" |
| PNL-EXPLORER | Children nested under their parent | works | built | Nothing |
| PNL-EXPLORER | Select a row fills inspector and highlights in 3D | works | built | Nothing |
| PNL-EXPLORER | "+" adds an object | works | built | Nothing |
| PNL-EXPLORER | Multi-select (feeds Mixed state) | missing | planned | Selection model for several objects (deferred, no task written) |
| PNL-EXPLORER | Drag a row onto another to reparent | works | not in spec | Nothing |
| PNL-EXPLORER | Right-click: rename, duplicate, delete, ask the copilot | works | not in spec | Nothing |
| PNL-EXPLORER | Objects in an open proposal shown blue | missing | built | Mark proposed objects from the proposal's operations |
| PNL-EXPLORER | "Add an agent" action row in a new project | missing | not in spec | Emit an action row when the project has no body |
| PNL-INSPECTOR | Title and subtitle | works | built | Copy differs |
| PNL-INSPECTOR | Filter properties | works | built | Nothing |
| PNL-INSPECTOR | Collapsible section per component with Remove | works | built | Nothing |
| PNL-INSPECTOR | Training section: Copies, Layout, Randomize | missing | not in spec | A training group built from `brain.copies` and Randomize components |
| PNL-INSPECTOR | Surface: Material with swatch, Friction with "was 1.0 · Reset" | works | built | Nothing |
| PNL-INSPECTOR | "+ Add component" | works | built | Nothing |
| PNL-INSPECTOR | Hover a property: explanation and where it shows in 3D | partial | not in spec | Viewport highlight of the property's target |
| PNL-INSPECTOR | Drag a name to scrub, Shift for fine steps | works | built | Nothing |
| PNL-INSPECTOR | Right-click a property: reset, copy, paste, randomize, ask | missing | not in spec | Desktop menu and a copilot hook |
| STA-WORLD-EMPTY | Default world: camera, terrain, sky, light, spawn | partial | built | A camera object |
| STA-WORLD-EMPTY | Getting started card with 5 workspace-tagged steps | partial | built | The app shows 4 engine-derived steps with one-click actions |
| STA-WORLD-EMPTY | Hide guide | works | built | Nothing |
| STA-WORLD-EMPTY | Sky inspector: preset, clouds, horizon, time of day, sun, shadows | partial | not in spec | Preselect the sky in a new project; clouds, time of day and shadows properties now exist. |
| STA-WORLD-EMPTY | Toolbar Terrain, Sky, Light | works | built | Nothing |
| STA-WORLD-EMPTY | Part tool adds a basic shape | works | not in spec | Nothing |
| STA-WORLD-EMPTY | Agent tool | works | built | Deliberately asks the copilot instead of opening Ideas |
| STA-WORLD-EMPTY | Goal tool | works | built | Deliberately asks the copilot to add a goal zone |
| STA-WORLD-EMPTY | Import tool | partial | planned | Models and environments import as meshes; URDF and MJCF robots cannot be imported yet. |
| STA-WORLD-EMPTY | Library offers Parking lot, 16 lots, Car agent, Tripod, Humanoid | partial | not in spec | Environments (parking lot, lots) and a car agent as library items; props by category and vault bodies (Tripod, Humanoid…) are there. |
| STA-WORLD-EMPTY | Chat greeting "Hi, what should we build?" with three routed chips | partial | not in spec | The three chips are sent as typed messages instead of routed intents. |
| STA-WORLD-EMPTY | Train disabled in a new project | works | built | Deliberately enabled because the project exists |
| STA-WORLD-EMPTY-NOGUIDE | "Show guide" pill | works | built | Count is n of 4 |
| STA-WORLD-BUILDING | Status pill over the viewport | works | built | Nothing |
| STA-WORLD-BUILDING | Building card with steps | works | built | Floats in the viewport, not in the chat (section 4) |
| STA-WORLD-BUILDING | Explorer fills as objects are created | works | built | Nothing |
| STA-WORLD-BUILDING | Inspector says "Building…" | fixture-only | built | Return the building inspection while a build runs |
| STA-WORLD-BUILDING | Only Terrain, Sky, Light while building | works | built | Nothing |
| STA-WORLD-BUILDING | "Open when ready" | works | built | Nothing |
| STA-WORLD-BUILDING | Train and Play disabled until built | works | built | Nothing |
| STA-WORLD-BUILDING | Keep chatting while it builds | partial | built | Chat exists only once the engine has created the project |
| STA-WORLD-PROPOSAL | "Preview of revision 15 · not applied yet" pill | works | built | Nothing |
| STA-WORLD-PROPOSAL | Viewport turns to the proposed scene (night, lamps) | partial | built | Draw the proposed lighting and sky, not just blue ghosts of changed geoms |
| STA-WORLD-PROPOSAL | Diff list old to new | works | built | Nothing |
| STA-WORLD-PROPOSAL | Amber side-effect warnings | works | built | Nothing |
| STA-WORLD-PROPOSAL | Apply and Discard | works | built | Nothing |
| STA-WORLD-PROPOSAL | "Edit by hand" | missing | not in spec | Open proposed values in the inspector; hidden because `editable` is false |
| STA-WORLD-PROPOSAL | Proposed values blue in the inspector with Accept | works | built | Nothing |
| SCR-WORLD | Chat check list and suggestion chips | works | built | Chips are the engine's own suggestions sent as text |
| SCR-IDEAS | Three ideas with real 3D previews | works | built | Nothing |
| SCR-IDEAS | World, Body, Learns lines | works | built | Nothing |
| SCR-IDEAS | Training estimate | works | built | Constant throughput (ADR 001) |
| SCR-IDEAS | Recommended badge | works | built | Nothing |
| SCR-IDEAS | Filter Whole idea, Worlds only, Bodies only | partial | planned | Ideas split into worlds and bodies; the filter is ignored |
| SCR-IDEAS | "Use this" starts the build | works | built | Nothing |
| SCR-IDEAS | "Tweak" | works | built | Nothing |
| SCR-IDEAS | Mix bar "Mix and build" | works | built | Nothing; the pairing is fixed: the second idea's world with the recommended idea's body. |
| SCR-IDEAS | Scene tab shows the highlighted idea | works | built | No way to highlight another idea |
| SCR-IDEAS | Chat explains the ideas; "Show 3 more" | missing | not in spec | A conversation not tied to a project; regeneration |
| SCR-IDEAS | Generating, not connected, error states | works | built | Nothing |
| SCR-IDEAS | Header with Train and Play disabled | works | built | Nothing |
| POP-TRAINING-COPIES | Copies field | works | built | Nothing |
| POP-TRAINING-COPIES | Layout "Grid 4 x 4" | partial | built | Store a layout and its dimensions; the choice is dropped |
| POP-TRAINING-COPIES | Vary positions | works | built | Semantics differ ("± 1 m, ± 15°") |
| POP-TRAINING-COPIES | Vary colors | works | built | Nothing |
| POP-TRAINING-COPIES | Vary time of day | missing | not in spec | Time of day on sky and light, varied per copy |
| POP-TRAINING-COPIES | Vary grip | works | built | Nothing |
| POP-TRAINING-COPIES | Vary sensor noise | missing | planned | Per-copy sensor noise (architecture, roadmap Sprint 12) |
| POP-TRAINING-COPIES | Vary wind | missing | not in spec | Wind as a per-copy world force |
| POP-TRAINING-COPIES | Preview copies | works | built | Shows copies in the viewport instead of the timelapse |
| POP-TRAINING-COPIES | Close and Done | works | built | Nothing |
| POP-ADD-COMPONENT | Picker next to the button, Escape closes | works | built | Nothing |
| POP-ADD-COMPONENT | "Search components, or describe one" | partial | built | Send a description to the copilot; label search works |
| POP-ADD-COMPONENT | Core kinds (mesh to zone) | works | built | Group names differ |
| POP-ADD-COMPONENT | Senses Camera, Smell, Sound | missing | planned | Sensor kinds (Sprint 11); Sound not planned |
| POP-ADD-COMPONENT | Brain group: learned, connectome, community | missing | planned | Brains as components (Sprints 8, 11, 13) |
| POP-ADD-COMPONENT | Reward term as a component | missing | not in spec | Rewards are task terms edited in Brain |
| POP-ADD-COMPONENT | World group: Wind, Water | missing | not in spec | Library and sim components |
| POP-ADD-COMPONENT | Reference board with an imported URDF joint | fixture-only | planned | URDF import (Sprint 9) |
| POP-ADD-COMPONENT | "Or ask for it" proposal | partial | built | Works through the main chat, not from the picker |
| REF-PROPERTY-TYPES | Twelve live type cards | partial | built | Library has no `panel` or `readonly` properties, so 10 of 12 show |
| REF-PROPERTY-TYPES | State Default | works | built | Nothing |
| REF-PROPERTY-TYPES | State Changed by you | works | built | Real in the inspector, absent on the board |
| REF-PROPERTY-TYPES | State Proposed by copilot | works | built | Real in the inspector, absent on the board |
| REF-PROPERTY-TYPES | State Out of range | partial | built | The engine refuses the value, so the red state never shows |
| REF-PROPERTY-TYPES | State Mixed | missing | planned | Multi-select |
| REF-PROPERTY-TYPES | State Locked while a run uses it | missing | planned | Lock properties of the revision a run is training |
| REF-PROPERTY-TYPES | Click edits in place, pickers, panels | works | built | Nothing |
| REF-PROPERTY-TYPES | Asset "Change" | pending | planned | Asset picker (Sprint 9) |
| MOD-HISTORY | Every revision newest first | works | built | Shows "14" rather than "r14" |
| MOD-HISTORY | Current chip | works | built | Nothing |
| MOD-HISTORY | Restore creates a revision | works | built | Nothing |
| MOD-HISTORY | Opened from the chat History tab | works | built | Nothing |
| PNL-VIEWPORT | Orientation cube | works | built | Nothing |
| PNL-VIEWPORT | Click to select with outline | works | built | Nothing |
| PNL-VIEWPORT | Move, rotate, scale gizmo | works | built | Nothing |
| PNL-VIEWPORT | Sensor rays from the agent | works | not in spec | Nothing |
| PNL-VIEWPORT | Blue copilot ghosts | works | built | Nothing |
| TAB-GAME-VIEW | The world through the project camera | partial | built | A camera object; today an orbitable preview |
| PNL-VIEWPORT | Lit option | pending | not in spec | Shading modes |
| PNL-VIEWPORT | Perspective option | works | built | Became the camera menu |
| PNL-VIEWPORT | "+" split view | pending | not in spec | Split views |
| PNL-TOOLBAR | Terrain: shape the ground | partial | not in spec | Heightfields; today selects the ground |
| PNL-TOOLBAR | Paint | pending | not in spec | Painting over Material and Surface |
| PNL-TOOLBAR | Props placement mode | pending | not in spec | Placement mode |
| PNL-TOOLBAR | Sky | works | built | Nothing |
| PNL-TOOLBAR | Light | works | built | Nothing |
| PNL-TOOLBAR | Camera | pending | not in spec | Camera component (Sprint 4 ruled out cameras in v1) |
| PNL-TOOLBAR | Copies and Randomize | works | built | Nothing |
| PNL-TOOLBAR | Import world | partial | planned | Imports a .glb, .gltf, .obj or .stl as a static mesh; the dialog opens on Model, not Environment, and USD is not supported. |
| PNL-TOOLBAR | Tooltips with name and purpose | works | built | Nothing |
| PNL-LIBRARY | 3D thumbnail per card | works | built | Nothing |
| PNL-LIBRARY | Built-in environments and bodies | partial | not in spec | Environment pieces; vault bodies are already listed and placeable. |
| PNL-LIBRARY | Drag a card into the viewport | missing | not in spec | Drag and drop with a drop position |
| PNL-LIBRARY | Click to preview | partial | built | Clicking places the piece as an edit |
| PNL-LIBRARY | Import environment card | partial | planned | Opens the real import, which brings an environment in as a static mesh; USD is not supported. |
| TAB-LIBRARY-COMMUNITY | Pieces published by others | broken | planned | List creations from the community service; the shelf always returns nothing and says no community pieces exist yet. |
| TAB-MY-FILES | Imported models, environments, videos | pending | planned | Sprint 9 |
| PNL-LIBRARY | Search assets | works | built | Nothing |

### Copilot (PNL-CHAT, TAB-CHAT, TAB-HISTORY)

| ID | Feature | App today | In spec? | What it needs |
|---|---|---|---|---|
| TAB-CHAT | User bubble | works | built | Nothing |
| TAB-CHAT | Copilot answer with bold spans | works | built | Depends on the model writing markdown |
| TAB-CHAT | Answer with a bold title line | works | not in spec | Nothing |
| TAB-CHAT | Welcome answer and starter chips in an empty conversation | works | not in spec | Nothing |
| TAB-CHAT | Check list with green and amber marks | works | not in spec | Nothing |
| TAB-CHAT | Inline action buttons under an answer | works | built | Nothing |
| TAB-CHAT | "Train now" action | partial | built | Opens the Start training dialog rather than starting |
| TAB-CHAT | Navigate action | works | built | Nothing |
| TAB-CHAT | "You chose: …" collapse | works | not in spec | Nothing |
| TAB-CHAT | Show thinking | works | built | Nothing |
| TAB-CHAT | "What the copilot did" step list | works | built | Steps arrive with the finished answer |
| TAB-CHAT | Live steps while the copilot works | works | built | Nothing |
| TAB-CHAT | Scene renders sent and seen | works | built | Nothing |
| TAB-CHAT | Attach images, videos, documents | works | built | Nothing |
| TAB-CHAT | Proposal card with diff, warning, Apply, Discard, Edit by hand | partial | built | "Edit by hand" hidden |
| TAB-CHAT | Proposal applied, discarded or outdated | works | built | Nothing |
| TAB-CHAT | Open proposal previewed in blue | partial | built | Only in World |
| TAB-CHAT | Build progress card in the chat | works | built | Nothing |
| TAB-CHAT | "You can keep chatting while it builds" | missing | not in spec | Queue edits onto a project being built |
| TAB-CHAT | Run progress card with goals | partial | not in spec | The run card shows live progress of the real run; goals stay empty until runs have stages. |
| TAB-CHAT | Milestone dividers ("100k steps") | works | not in spec | Nothing |
| TAB-CHAT | Coach observations at checkpoints | works | built | Nothing |
| TAB-CHAT | "Next run, if you agree" plan card | partial | planned | The plan comes from the copilot's answer; the card carries no action buttons of its own. |
| TAB-CHAT | Suggestion chips send their text | works | built | Nothing |
| TAB-CHAT | Chips that navigate by intent | works | not in spec | Nothing |
| TAB-CHAT | Chip intents propose-change, explain, diagnose, stop-run, train-run, apply-fix | partial | built | The engine emits and the app routes all but apply-fix; "stop at a step" is unsupported. |
| TAB-CHAT | Chip intents new-idea, refine-ideas, template, play, record, show, dismiss, add-to-training | partial | not in spec | The engine emits play and show (routed to Play and World); the other six are never emitted. |
| TAB-CHAT | Chip intents import, motion-video, export-brain, order-parts, compare, share, resize-brain, export | partial | planned | The engine emits compare (routed to Results) and share (sent as text); the other six are never emitted. |
| TAB-CHAT | Chip intent ask | works | built | Nothing |
| TAB-CHAT | Workspace placeholder | works | built | Nothing |
| TAB-CHAT | Autonomy switch Ask before changes, Autopilot | works | built | Toggles on click; no menu |
| TAB-CHAT | "Autopilot · 5 tries" note | fixture-only | planned | Read `AutopilotStatus.iteration` and `max_iterations` |
| TAB-CHAT | Autopilot messages with Watch training, Stop autopilot | works | built | Nothing |
| TAB-CHAT | Send button and failed-send recovery | works | built | Nothing |
| TAB-CHAT | Selection and workspace sent as context | works | built | Nothing |
| TAB-CHAT | Guide steps sent as chat messages | works | not in spec | Nothing |
| TAB-CHAT | No project, not connected, busy, error states | works | built | Nothing |
| PNL-CHAT | "⋯" clear or export the conversation | pending | not in spec | (corrected) No engine route clears or exports a conversation yet. Undocked (Play) the ⋯ honestly says "not available yet"; docked, the dock menu (Maximize, Float, New window, Close) replaces it and has no clear or export |
| PNL-CHAT | Drag the panel to another dock | works | built | Nothing |
| PNL-CHAT | Answers in the person's language | works | built | Nothing |
| TAB-HISTORY | History tab opens MOD-HISTORY | works | built | Nothing |
| TAB-HISTORY | Revision list with author and current | works | built | Nothing |
| TAB-HISTORY | Restore | works | built | Nothing |
| TAB-HISTORY | Empty history | works | built | Nothing |

### Brain

| ID | Feature | App today | In spec? | What it needs |
|---|---|---|---|---|
| TAB-WHAT-IT-SEES | One row per brain input with switch and description | works | built | Nothing |
| TAB-WHAT-IT-SEES | Coach-proposed input shown blue | fixture-only | planned | Map an open proposal's sensor and muted-senses changes onto inputs; the app never marks one proposed. |
| TAB-WHAT-IT-SEES | Turn an input on or off | works | built | Nothing |
| TAB-WHAT-IT-SEES | "+" adds a sensor input | works | built | Nothing |
| TAB-WHAT-IT-CAN-DO | Outputs with ranges, turn off, limit | partial | planned | Motors list with kind and max force and can be switched off; no range display or limit operation. |
| SCR-BRAIN | Inspector Practice: steps, parallel copies | works | built | Nothing |
| SCR-BRAIN | Expert settings: method, network, learning rate | works | built | Nothing |
| SCR-BRAIN | Proposed inspector value with Accept | works | built | Nothing |
| SCR-BRAIN | 3D viewport with Scene and Game view | works | built | Nothing |
| SCR-BRAIN | Senses tool: sensor rays overlay | works | built | Nothing |
| SCR-BRAIN | "What the brain sees now" live card | partial | planned | Real readings one second into the newest checkpoint's test try, not live; the card still hides on a query error. |
| SCR-BRAIN | Network tool | works | built | Nothing |
| TAB-REWARD | One card per reward term with weight | works | built | Nothing |
| TAB-REWARD | Drag a weight | works | built | Nothing |
| TAB-REWARD | "1 change proposed" | fixture-only | planned | Map open proposals and diagnoses onto cards; the app always reports zero. |
| TAB-GOAL | Success condition and time limit | partial | planned | Shows the task's real time limit and end rules; success is a fixed sentence per task family and not editable. |
| TAB-CURRICULUM | Stages that make the task harder | fixture-only | planned | Curriculum in TaskSpec and the env; the app honestly shows one stage. |
| SCR-BRAIN | Chat explains a reward change | partial | built | The copilot can change rewards, senses, network and episode rules through operations; curriculum does not exist. |
| STA-BRAIN-NETWORK | Layer size sliders | works | built | Nothing |
| STA-BRAIN-NETWORK | Decisions per second | works | built | Nothing |
| STA-BRAIN-NETWORK | "+ Add a layer" | partial | planned | On the network screen it opens Brain sizes instead of adding a layer; it adds in place only with that dialog open. |
| STA-BRAIN-NETWORK | Speed hint "2 × 512 trains about 2.3× slower" | partial | planned | A real but generic hint (steps per try); measured time per size is only in Brain sizes. |
| STA-BRAIN-NETWORK | Episode rules: reset on hit, end after 30 s | partial | planned | Fall and goal rules switch for real; the time limit is shown locked and there is no reset-on-hit rule. |
| STA-BRAIN-NETWORK | Named input column | works | built | Nothing |
| STA-BRAIN-NETWORK | Hidden layers with sampled neurons and wires | partial | planned | Layers and sampled neurons come from the checkpoint; the faint background wires are still a fixed pattern. |
| STA-BRAIN-NETWORK | Named output column | works | built | Nothing |
| STA-BRAIN-NETWORK | Live activation glow and hot connections | partial | planned | Glow and hot links come from one observation of the checkpoint's evaluation, not live. |
| STA-BRAIN-NETWORK | Body with rays wired into inputs | missing | planned | Draw the project body and anchor wires to sensors |
| STA-BRAIN-NETWORK | Hover a neuron for an explanation | missing | planned | Hover in the renderer; attributions from real rollouts |
| STA-BRAIN-NETWORK | Live, 25k, 312k switch | pending | planned | Checkpoint labels are real but clicking one says not available yet; wire it to the network of that checkpoint. |
| STA-BRAIN-NETWORK | Caption with layers, parameters, rate | partial | planned | Layers, parameters and step come from the checkpoint; the decision rate is not in the caption. |
| STA-BRAIN-NETWORK | Network and Scene tabs | partial | planned | Scene tab gets no project scene |
| STA-BRAIN-NETWORK | Copilot explains what the brain is thinking | missing | not in spec | A copilot read tool over the network (section 5) |
| STA-BRAIN-NETWORK | Chat answer with neuron check list ("Neuron 2·41 fires when a car is close on the left") (added) | fixture-only | not in spec | CopilotMessage.checks exists now; it needs neuron statistics (NeuronNote, section 5) and a copilot network tool. |
| STA-BRAIN-NETWORK | Chips "Make the brain bigger", "Compare with 25k", "What does layer 1 do?" (added) | partial | planned | The engine emits compare and explain intents; resize-brain is never emitted and no chip switches the checkpoint. |
| MOD-BRAIN-SIZES | Small, Medium, Large cards | works | built | Nothing |
| MOD-BRAIN-SIZES | Mini diagrams | works | built | Nothing |
| MOD-BRAIN-SIZES | Training time per size | works | built | Nothing |
| MOD-BRAIN-SIZES | "Expected: parks about 55%" | works | built | Nothing |
| MOD-BRAIN-SIZES | Recommended | works | built | Nothing |
| MOD-BRAIN-SIZES | Honesty note | works | built | Nothing |
| MOD-BRAIN-SIZES | Use size | works | built | Nothing |
| MOD-BRAIN-SIZES | Browse community brains | partial | planned | Opens the real Community screen; no brain filter or start-from-a-community-brain flow. |
| MOD-BRAIN-SOURCE | Learn, connectome, community options | partial | planned | Offers Learn and trained brains from local projects that fit the body; no connectome or community options. |
| MOD-BRAIN-SOURCE | FlyWire dataset card | fixture-only | planned | Connectome library entries; the app never sets a dataset. |
| MOD-BRAIN-SOURCE | How it connects, matched share | partial | planned | Real counts of senses and actions and which trained brains do not fit; no matched share. |
| MOD-BRAIN-SOURCE | Load into the fly | partial | planned | Really sets the starting brain; the label and destination still assume the fly connectome. |
| STA-BRAIN-CONNECTOME | Explorer of body parts and brain regions | missing | planned | Connectome objects in the tree |
| STA-BRAIN-CONNECTOME | Inspector wiring and simulation | missing | planned | Connectome spec and LIF settings |
| STA-BRAIN-CONNECTOME | Fly body viewport | missing | planned | Fly body in the library |
| STA-BRAIN-CONNECTOME | "Firing right now" card | missing | planned | A spiking simulator streaming region activity; the card shows the trained brain's sense readings instead. |
| STA-BRAIN-CONNECTOME | Neurons, Connections, Regions, maps tools | pending | planned | Sprint 11 |
| STA-BRAIN-CONNECTOME | Brain activity panel | partial | planned | Shows the trained policy's layers as regions from one evaluation observation; no connectome regions or live stream. |
| STA-BRAIN-CONNECTOME | Behaviors tab | partial | planned | Real behaviors grouped from the trained brain's evaluation episodes; cards say "Jump to this moment" but do nothing. |
| STA-BRAIN-CONNECTOME | Wiring tab | partial | planned | Real senses and motor maps of the project's body; no connectome mapping report (unmatched is always 0). |
| STA-BRAIN-CONNECTOME | Run test and chat | partial | planned | Run test opens the engine-backed behavior tests in Results; no connectome copilot tools. |
| MOD-EXPORT-BRAIN | ONNX, URDF, MuJoCo, runtime package | works | built | TorchScript and Sentis dropped: Sentis reads ONNX |
| MOD-EXPORT-BRAIN | Include spec, README and script, parts, history | works | built | |
| MOD-EXPORT-BRAIN | File summary | works | built | Every file with its real size |
| MOD-EXPORT-BRAIN | Download | works | built | Save dialog checked in main, zip written by the engine |
| MOD-EXPORT-BRAIN | Export from the conversation | works | built | `export_robot` and `check_hardware` tools |
| PNL-LEARNED | Checkpoint cards with thumbnails | partial | planned | Cards are real on the working tree; thumbnails are empty boxes |
| PNL-LEARNED | Caption per checkpoint ("hits a car") | partial | planned | Scores are real; behavior words need the coach on frames |
| PNL-LEARNED | Future checkpoints with ETA | missing | planned | ETA from scheduled checkpoints and measured speed |
| PNL-LEARNED | Current checkpoint highlighted | works | built | Nothing |
| PNL-LEARNED | "● Training" indicator | works | built | Nothing |
| PNL-LEARNED | Timelapse button | works | built | Nothing |
| PNL-LEARNED | Click a checkpoint to open the timelapse there | works | built | Nothing |

### Body and motion

| ID | Feature | App today | In spec? | What it needs |
|---|---|---|---|---|
| SCR-BODY | Header with Motion tab, Play to Motion, guide, Train | partial | planned | The Motion tab always shows in Body, whether or not there is a clip, and Play plays the project instead of the clip. |
| SCR-BODY | Rig explorer with skeleton and bone counts | partial | planned | Body-only tree grouped as skeleton and physics; import source |
| SCR-BODY | Physics group: motors, sensors, colliders | missing | planned | Aggregate component rows |
| SCR-BODY | Select a bone drives the inspector | works | built | Nothing |
| SCR-BODY | Inspector header "Bone · hinge · from dancer.glb" | partial | planned | Import metadata |
| SCR-BODY | Joint type | works | built | Nothing |
| SCR-BODY | Joint range two-thumb slider | works | built | Nothing |
| SCR-BODY | Joint damping | works | built | Nothing |
| SCR-BODY | Motor strength | works | built | Unit N in the library, N·m in the design |
| SCR-BODY | Motor speed (rad/s) | missing | not in spec | Velocity limit on the motor component |
| SCR-BODY | Mass with "auto" toggle | partial | planned | Auto mass from size (Sprint 9) |
| SCR-BODY | Collider shape per bone | partial | planned | Shape lives on Mesh; collider editor (Sprint 9) |
| SCR-BODY | "+ Add component" | works | built | Nothing |
| TAB-RIG-VIEW | See-through body with bones and colliders | missing | planned | `rig-tab.tsx` (does not exist) |
| TAB-RIG-VIEW | Select bones in 3D | works | built | Nothing |
| TAB-RIG-VIEW | Drag joint limits in the view | missing | planned | Viewport handles |
| TAB-RIG-VIEW | Axis widget | works | built | Nothing |
| TAB-MESH-VIEW | Shaded imported mesh | partial | planned | The Mesh tab draws the same scene as Rig. Imported skins appear shaded, but there is no view of the mesh alone. |
| TAB-MESH-VIEW | Paint skin weights | missing | planned | A paint tool. Skins are bound part by part and the only fix is automatic. |
| SCR-BODY | Lit, Perspective, "+" view | partial | planned | Lit and split view |
| SCR-BODY | Import tool | works | built | Nothing |
| SCR-BODY | Auto-rig tool | works | built | Nothing |
| SCR-BODY | Bone, Joint, Motor, Sensor, Mirror, Collider, Weights, Test pose tools | pending | planned | Viewport tool modes that emit edit operations. Today these tools have no action and say they are not available yet. |
| TAB-RIG-CHECK | Rig check list with pass and warn | works | built | Nothing |
| TAB-RIG-CHECK | Stand-up test | partial | planned | Today only a rest-stability check; a falling humanoid passes |
| TAB-RIG-CHECK | Click a problem to select the part | broken | planned | Problem rows are buttons with no action. The engine already sends each finding's part, but the desktop drops it. |
| TAB-RIG-CHECK | Test pose chips | works | built | Nothing |
| TAB-POSE-TEST | Preset poses applied to the view | works | built | Nothing |
| TAB-WEIGHTS | Skin coverage, Auto-fix weights | works | built | Nothing |
| SCR-BODY | Chat auto-rig summary | partial | planned | The copilot has auto_rig and fix_body tools, but the chat has no auto-rig summary card. |
| SCR-BODY | Chat chips "Make it lighter", "Stiffer knees", "Copy this video" | partial | planned | The engine never suggests a motion-video chip, so "Copy this video" appears only in the prototype, even though its dialog is real. |
| STA-BODY-CHECK-FAILED | Amber "Can't train yet" banner | broken | planned | The banner counts rig-audit findings, which do not block training, so "Can't train yet" is untrue. |
| STA-BODY-CHECK-FAILED | Failing checks (falls after 1.4 s, knee 0° to 210°) | missing | planned | Stand-up and anatomical range checks; limits capped at ±180° |
| STA-BODY-CHECK-FAILED | "Fix both for me" | works | built | Nothing |
| STA-BODY-CHECK-FAILED | "Show me" | partial | planned | Select and frame the part |
| STA-BODY-CHECK-FAILED | Training blocked until checks pass | works | built | No visible explanation in Body |
| MOD-AUTO-RIG | Progress dialog | works | built | Nothing |
| MOD-AUTO-RIG | Steps read, detect shape, place bones, estimate masses, stand-up test | partial | planned | All the steps are real, but the stand-up step is only the store's design tests (rest stability), not a true stand-up test. |
| MOD-AUTO-RIG | Run in background, Cancel | works | built | Nothing |
| MOD-AUTO-RIG | See result | partial | planned | See result stays enabled while auto-rig runs or after it fails, and always opens the check-failed state of the current body. |
| SCR-MOTION | Motion tab reachable for character projects | partial | planned | Only the Body and Motion headers show the Motion tab, and it does not depend on having a clip. |
| SCR-MOTION | Train copy, Play | partial | planned | Train copy starts a real imitation run, but Play on Motion only reopens Motion instead of playing the clip. |
| SCR-MOTION | Clip explorer (video, pose track, retarget map, exports) | fixture-only | planned | `MotionClip` entities; app shows ordinary objects under "Clip" |
| SCR-MOTION | Retarget inspector | fixture-only | planned | Retarget settings |
| SCR-MOTION | Physics inspector (balance help, joint force) | fixture-only | planned | Imitation task parameters |
| SCR-MOTION | Video, Detect pose, Retarget, Trim, Export tools | partial | planned | Video, Detect pose, Trim and Export open real dialogs. Retarget says it is not available yet. |
| TAB-SIDE-BY-SIDE | Reference video with tracked skeleton | partial | planned | Draws the tracked skeleton as a stick figure with no video picture behind it. |
| TAB-SIDE-BY-SIDE | Physics character with match % | partial | planned | Shows the latest checkpoint's result and match % as a stick figure, not the 3D character. |
| TAB-OVERLAY | Character over the video | partial | planned | Draws the reference and result stick figures over each other, with no video and no camera alignment. |
| TAB-REFERENCE-ONLY | Video and skeleton only | partial | planned | Shows the tracked skeleton but not the video picture. |
| PNL-MOTION-COMPARE | Speed 0.5×, 1× and Play | partial | planned | The speeds work and playback loops on its own, but there is no Play or pause control. |
| TAB-CLIP | Pose thumbnails strip | works | built | Nothing |
| TAB-CLIP | Match curve with playhead | works | built | Nothing |
| TAB-CLIP | Weakest moment callout | works | built | Nothing |
| TAB-CLIP | Select a range to focus training | missing | planned | Range selection |
| TAB-MATCH-SCORE | Match per body part | works | built | Nothing |
| SCR-MOTION | Chat motion summary | missing | planned | Copilot Motion role |
| SCR-MOTION | "Train the spin" action | pending | planned | Segment-focused training |
| SCR-MOTION | Chips "Slow it down", "Loop it", "Export for Roblox" | missing | not in spec | Retiming, looping and target-rig export |
| MOD-MOTION-VIDEO | Upload, link, webcam | partial | planned | Upload only. There is no link download or webcam capture. |
| MOD-MOTION-VIDEO | File card with facts and people found | partial | planned | The video facts are real, but people are counted only after tracking. |
| MOD-MOTION-VIDEO | Trim range | partial | planned | The part picker chooses where a fixed part of up to 12 s starts. There are no two draggable trim handles. |
| MOD-MOTION-VIDEO | Who to copy | works | built | Nothing |
| MOD-MOTION-VIDEO | Copy onto humanoid or my character | works | built | Nothing |
| MOD-MOTION-VIDEO | "The video stays on your computer" | works | not in spec | Nothing |
| MOD-MOTION-VIDEO | Track the motion | works | built | Nothing |
| MOD-MOTION-TRACKING | Preview with frame counter | partial | planned | Real frames and the frame counter show while it runs, but the skeleton is drawn only once tracking finishes. |
| MOD-MOTION-TRACKING | Progress bar | works | built | Nothing |
| MOD-MOTION-TRACKING | Steps find, track, map, physics check | partial | planned | The real steps are sample, track and pick the person. There is no map or physics-check step. |
| MOD-MOTION-TRACKING | Run in background, See result | works | built | Nothing |
| MOD-MOTION-TRAIN | Intro | works | built | Nothing |
| MOD-MOTION-TRAIN | Practice steps and copies | works | built | Nothing |
| MOD-MOTION-TRAIN | Focus on the spin or whole clip | works | built | Nothing |
| MOD-MOTION-TRAIN | Estimate | partial | planned | There is no estimate before training. It honestly says "Measured once training starts". |
| MOD-MOTION-TRAIN | Start training | works | built | Nothing |
| STA-MOTION-TRAINING | Status card with % and time left | works | built | Nothing |
| STA-MOTION-TRAINING | Match before and now | partial | planned | Shows only the latest checkpoint's match, with no before-and-now pair. |
| STA-MOTION-TRAINING | Hard moment "6 of 10" | partial | planned | Shows the weakest moment and its match, not a per-segment count. |
| STA-MOTION-TRAINING | Watch, Export now | partial | planned | Export now is real. Watch opens the comparison of the latest checkpoint, not a live replay. |
| STA-MOTION-TRAINING | Stop | works | built | Nothing |
| MOD-EXPORT-ANIMATION | glTF, FBX, BVH | partial | planned | Exports JSON and BVH only, not glTF or FBX. |
| MOD-EXPORT-ANIMATION | Use the physics result | works | built | Nothing |
| MOD-EXPORT-ANIMATION | Include root motion | works | built | Nothing |
| MOD-EXPORT-ANIMATION | Loop the clip | partial | not in spec | BVH repeats the first frame at the end and JSON only records a flag. There is no loop blending. |
| MOD-EXPORT-ANIMATION | Target rig "Roblox · R15 · 30 fps" | broken | not in spec | The Target field is editable local text that is never sent. There are no named target rigs and no resampling. |
| MOD-EXPORT-ANIMATION | File summary | works | built | Nothing |
| MOD-EXPORT-ANIMATION | Download | works | built | Nothing |

### Train and results

| ID | Feature | App today | In spec? | What it needs |
|---|---|---|---|---|
| SCR-TRAIN | Train before a run, Stop while training | works | built | Nothing |
| SCR-TRAIN | Run inspector: method, start, budget locked while running | fixture-only | not in spec | Inspector built from `RunStatus` and `RunConfig`; app shows the scene selection |
| SCR-TRAIN | Inspector Autopilot section with tries left | partial | planned | Tries left show as a real autopilot chip ("try 2 of 4") in the Metrics header; the Inspector section still shows only the scene selection. |
| SCR-TRAIN | Train tool | works | built | Nothing |
| SCR-TRAIN | Pause tool | works | built | Nothing |
| SCR-TRAIN | Stop tool | works | built | Nothing |
| SCR-TRAIN | Timelapse tool | works | built | Nothing |
| SCR-TRAIN | Autopilot tool | works | built | Wired to `/projects/{id}/autopilot` on the working tree |
| SCR-TRAIN | Chat run-progress card with goals | partial | not in spec | The live run card with progress is real; its goals list is always empty because runs have no goals or stages. |
| SCR-TRAIN | Coach milestones and observations during the run | works | built | Nothing |
| SCR-TRAIN | "Next run, if you agree" card | partial | planned | Map a diagnosis proposal onto the plan card; today a normal answer plus proposal card |
| SCR-TRAIN | "Train it, and tell me how it goes" | works | built | Nothing |
| SCR-TRAIN | Chips "Why does it scrape?", "Compare with run 2", "Stop at 500k" | partial | planned | Chips come from the engine with real intents and routes; "Stop at 500k" only opens Stop because there is no scheduled stop. |
| SCR-TRAIN | Stop at a chosen step | missing | not in spec | Scheduled stop or a budget change in `StartRun` |
| SCR-TRAIN | Composer "Autopilot · 5 tries" | partial | planned | Show the iteration budget |
| TAB-LIVE-TRAINING | Every copy side by side from live snapshots | works | built | Nothing |
| TAB-LIVE-TRAINING | Checkpoint card | works | built | Generic "Success 71% · fails 38%" instead of task words |
| TAB-LIVE-TRAINING | Scrubber over the latest episode with failure marker | partial | not in spec | The episode bar is filled from the latest checkpoint's rollout and Play opens Replay; there is no failure marker and no scrubbing in place. |
| TAB-LIVE-TRAINING | Pick one copy to follow | works | not in spec | Nothing |
| TAB-LIVE-TRAINING | Connecting, no run, ended, reconnect states | works | built | Nothing |
| TAB-LIVE-TRAINING | Lit, Perspective, "+" | partial | not in spec | Perspective is a working camera menu, plus a rays menu; Lit and "+" (split view) still say not available yet. |
| TAB-REPLAY | Choose a checkpoint's episode | works | built | Nothing |
| TAB-REPLAY | Play, scrub, speed in the frozen scene | works | built | Nothing |
| TAB-REPLAY | Card with result and outcome | works | built | Nothing |
| PNL-RUNS | Runs with status and result line | works | built | Generic wording |
| PNL-RUNS | Select a run switches every panel | works | built | Nothing |
| PNL-RUNS | "+" new run | works | built | Nothing |
| PNL-RUNS | Paused status | works | built | Nothing |
| PNL-METRICS | Mean reward chart with change | works | built | Nothing |
| PNL-METRICS | Collision rate with "high" chip | partial | built | Severity judgment and task naming |
| PNL-METRICS | Extra series | works | built | Nothing |
| PNL-METRICS | Reward breakdown | works | built | Nothing |
| PNL-METRICS | Weight change on a term ("0.2 → 1.0") | missing | not in spec | Diff of reward weights against the previous revision |
| PNL-METRICS | Steps done and speed | works | built | Nothing |
| PNL-METRICS | Hover for exact values | partial | built | A real tooltip; today native SVG titles |
| PNL-METRICS | Console | works | built | Nothing |
| PNL-METRICS | Copy and filter the console | partial | not in spec | Filter field and copy action |
| MOD-START-TRAINING | Intro | works | built | Nothing |
| MOD-START-TRAINING | Practice steps | works | built | Nothing |
| MOD-START-TRAINING | Parallel copies | works | built | Nothing |
| MOD-START-TRAINING | Estimated time | partial | built | Measured throughput; today a constant |
| MOD-START-TRAINING | CPU threads used | works | built | Nothing |
| MOD-START-TRAINING | "Let the copilot coach" switch | works | built | Nothing |
| MOD-START-TRAINING | Start run | works | built | Nothing |
| MOD-STOP-RUN | Where the run is and its best result | works | built | Nothing |
| MOD-STOP-RUN | What is kept | works | built | Nothing |
| MOD-STOP-RUN | Keep training | works | built | Nothing |
| MOD-STOP-RUN | Pause | works | built | Nothing |
| MOD-STOP-RUN | Stop and go to Results | works | built | Nothing |
| STA-TRAIN-FAILED | Card appears when a run stops by itself | works | built | Nothing |
| STA-TRAIN-FAILED | Reason and what is safe | works | built | Nothing |
| STA-TRAIN-FAILED | Technical details | works | built | Nothing |
| STA-TRAIN-FAILED | "Fix and restart" | partial | not in spec | A diagnosis for crashed runs; today it opens Start training |
| STA-TRAIN-FAILED | "View log" | partial | built | It goes back to Train, where the Console holds the full worker log; it does not open the Console tab directly. |
| STA-TRAIN-FAILED | "Back to run 3" | works | built | Results now wired on the working tree |
| MOD-AUTOPILOT | Intro | works | built | Wired on the working tree |
| MOD-AUTOPILOT | Off, Ask first, Fix on its own | works | built | Wired on the working tree |
| MOD-AUTOPILOT | Fix limit per run | works | built | Goal, iterations and minutes are exposed |
| MOD-AUTOPILOT | Status while it runs and Stop | works | built | (corrected) `autopilot-run.tsx` shows a status pill, detail line, timestamped log and Stop autopilot from engine progress; limits lock while active |
| MOD-AUTOPILOT | Start, stop, check by asking the copilot | works | built | Nothing |
| SCR-RESULTS | Runs with compare checkboxes | works | built | Compare selection lives in app memory |
| SCR-RESULTS | Best brains | works | built | Export needs Sprint 12 |
| SCR-RESULTS | Summary "Best brain so far" | works | built | Build is Sprint 12 |
| SCR-RESULTS | Notes | partial | planned | Stored in this browser's `localStorage`, invisible to the engine and the copilot; needs a contract and engine storage |
| TAB-COMPARE | Two runs side by side with scores | partial | planned | It shows a real comparison table (or an agents table); the two replays side by side are not drawn. |
| TAB-COMPARE | Play both together | missing | planned | Synced rollout players |
| TAB-COMPARE | Seed basis chip | works | built | Fixed on the working tree: "Same seeds", "Different seeds" or "Seeds not recorded" from real rollouts |
| SCR-RESULTS | "Is run 3 actually better?" in chat | works | built | Nothing |
| SCR-RESULTS | Chips Show where it fails, Share, Train | partial | planned | Share is Sprint 13 |
| PNL-FAILURES | Failure groups with coverage | works | built | Nothing |
| PNL-FAILURES | Select a group to replay one of its episodes | partial | planned | Selecting a group shows its rendered frames and description; none of its episodes plays as a replay. |
| PNL-FAILURES | All test runs | works | built | Nothing |
| STA-RESULTS-FAILURES | Scores summary with seed note | works | built | Nothing |
| TAB-WHERE-IT-FAILS | Replay of a failing test run | partial | planned | It shows the group's rendered frames with the explanation; it needs a player over a failing episode's rollout. |
| TAB-WHERE-IT-FAILS | Vision annotations (circle, path, explanation card) | partial | not in spec | The explanation card is real; the circle and path still need annotation geometry and time in Diagnosis evidence. |
| TAB-WHERE-IT-FAILS | "Test run 17 of 23" step-through | fixture-only | planned | Only the prototype draws it; the app's frames view has no step-through over per-episode rollouts. |
| STA-RESULTS-FAILURES | Chat diagnosis with proposed changes | works | built | Nothing |
| STA-RESULTS-FAILURES | "Apply as revision 14" | partial | planned | Apply works from the chat and the Diagnoses tab, but the button says only "Apply", without the revision number. |
| STA-RESULTS-REFERENCE | Behavior tests list | works | built | Nothing |
| STA-RESULTS-REFERENCE | Recordings | partial | planned | It lists checkpoint evaluation episodes, with real Play and Export; there are no imported reference recordings because the engine has no ReferenceRecording. |
| STA-RESULTS-REFERENCE | Paths of real flies and your fly | partial | planned | It draws real paths from behavior-test results, but for two compared checkpoints instead of real fly recordings. |
| STA-RESULTS-REFERENCE | Behavior match table, Neurons tab | partial | planned | Neurons come from real episode activations; the match table compares two checkpoints rather than a checkpoint against real recordings. |
| STA-RESULTS-REFERENCE | Overall match and Run test | partial | planned | Run test really runs on the engine; the overall figure is how many tests passed, not a match against real recordings. |
| SCR-TIMELAPSE | Full-screen replay | works | built | Nothing |
| SCR-TIMELAPSE | Title with real metrics | works | built | Nothing |
| SCR-TIMELAPSE | Checkpoint strip | partial | planned | The strip lists real checkpoints with their results and selects them; it has no thumbnails from rendered frames. |
| SCR-TIMELAPSE | Play bar | works | built | Nothing |
| SCR-TIMELAPSE | Export video | partial | planned | It saves only the current checkpoint's episode as an animated PNG; there is no video of the whole timelapse. |
| SCR-TIMELAPSE | Cinematic camera and overlays | missing | planned | Presentation camera |
| SCR-TIMELAPSE | Exit returns to Train | works | built | Always Train, whatever opened it |
| TAB-TIMELAPSE | Results tab opens the presentation | works | built | Nothing |

### Play and build

| ID | Feature | App today | In spec? | What it needs |
|---|---|---|---|---|
| SCR-PLAY | Play button enters Play without changing the project | works | built | Nothing |
| SCR-PLAY | Live MuJoCo frames streamed and replayed | works | built | Nothing |
| SCR-PLAY | Connecting, stopped, reconnect states | works | built | Nothing |
| SCR-PLAY.b | Connectome fly in a field with sugar | missing | planned | Sprint 11 |
| HDR-PLAY | "Playing · nothing you do here changes the project" | works | built | Nothing |
| HDR-PLAY | Stop returns to where Play started | works | built | Nothing |
| HDR-PLAY | Record a clip | pending | planned | Clip recording (roadmap Sprint 4, never scheduled; not a `pending()` key) |
| HDR-PLAY | Brain chip with "Train it" | works | built | Nothing |
| HDR-PLAY | Project menu | works | built | Nothing |
| TAB-PLAY | Free camera, click applies the tool | works | built | Nothing |
| TAB-PLAY | Play plus Agent view or Game view tabs | partial | planned | One tab only; cameras come with vision |
| TAB-PLAY | Speed chip | works | built | Nothing |
| TAB-PLAY | Pause and resume | works | built | Nothing |
| TAB-PLAY | "Tools follow its senses" note | works | built | Nothing |
| TAB-PLAY | Status card explaining behavior | partial | built | Behavior narration; today a fixed template |
| TAB-PLAY | Sensor rays and goal spot in the view | works | not in spec | Nothing |
| TAB-AGENT-VIEW | What the agent's camera sees | missing | planned | Camera sensor |
| TAB-AGENT-VIEW | Game view through the project camera | missing | planned | Second view bound to the camera |
| PNL-PLAY-TOOLS | Move | works | built | Nothing |
| PNL-PLAY-TOOLS | Push | works | built | Nothing |
| PNL-PLAY-TOOLS | Add object | works | built | Nothing |
| PNL-PLAY-TOOLS | Light | works | built | No sense reacts to light yet |
| PNL-PLAY-TOOLS | Wind | works | built | Fixed direction and strength |
| PNL-PLAY-TOOLS | Slow | works | built | Nothing |
| PNL-PLAY-TOOLS | Reset | works | built | Nothing |
| PNL-PLAY-TOOLS | Shuffle | works | built | Moves props only |
| PNL-PLAY-TOOLS | Touch | works | built | Nothing |
| PNL-PLAY-TOOLS | Shadow | missing | planned | Vision sensors and a command (Sprint 11) |
| PNL-PLAY-TOOLS | Scent | missing | planned | Smell sensor and a scent field (Sprint 11) |
| PNL-PLAY-TOOLS | Tool bar and selection | works | built | Nothing |
| PNL-PLAY-TOOLS | Tooltips with purpose | partial | built | Purpose lines |
| PNL-PLAY-SENSES | Live bars per sense | works | built | Nothing |
| PNL-PLAY-SENSES | Close obstacle turns red | works | built | Nothing |
| PNL-PLAY-SENSES | Icons per sense | partial | planned | Sensor kind to icon from the engine |
| PNL-PLAY-SENSES | Caption | partial | built | Real reward line replaces the caption |
| PNL-PLAY-SENSES | Hover for meaning | missing | built | Per-sensor explanation |
| PNL-PLAY-DECISIONS | Live outputs | works | built | Raw values, not "14° R" |
| PNL-PLAY-DECISIONS | Which brain is playing | works | built | Nothing |
| PNL-PLAY-DECISIONS | "Use another brain" | works | built | Nothing |
| PNL-PLAY-DECISIONS | No learned brain state | works | built | Nothing |
| PNL-PLAY-VISION | What each eye or camera sees | fixture-only | planned | Vision field in `PlayFrame` (Sprint 11) |
| PNL-BRAIN-ACTIVITY | Activity strip in Play | fixture-only | planned | Connectome simulator |
| PNL-PLAY-EVENTS | Timestamped log | works | built | Nothing |
| PNL-PLAY-EVENTS | Interpretive behavior lines | missing | not in spec | Behavior detection or narration |
| PNL-PLAY-EVENTS | Click a line to jump there | pending | planned | Clip recording |
| PNL-PLAY-EVENTS | Empty state | works | built | Nothing |
| SCR-PLAY | Chat answers "what is it doing?" from the live session | partial | not in spec | Play frame and events in the message context or a copilot Play tool |
| SCR-PLAY | Copilot turns a surprise into a training change | fixture-only | not in spec | Proposal from Play observations |
| SCR-PLAY | Chips that drive Play tools ("Make it night", "Record this") | partial | not in spec | Copilot Play tools |
| SCR-PLAY | Chat "⋯" options | pending | built | (corrected) `chat-panel.tsx` gives the undocked ⋯ the not-yet props, so it says "Chat options is not available yet"; `app-flows.md` is stale here. Needs the clear and export routes |
| SCR-BUILD | Header with Publish | works | built | Nothing |
| PNL-BUILD-TARGETS | Targets with live facts | works | built | ONNX size, parts total from the best-fitting kit |
| PNL-BUILD-TARGETS | Each target opens its view | works | built | Nothing |
| TAB-SHARE-TO-COMMUNITY | Title and description | works | built | Nothing |
| TAB-SHARE-TO-COMMUNITY | Permission toggles | works | built | Nothing |
| TAB-SHARE-TO-COMMUNITY | Included list | works | built | Nothing |
| TAB-SHARE-TO-COMMUNITY | Preview card | partial | planned | Show the project thumbnail in the card; the byline and votes are already real |
| TAB-SHARE-TO-COMMUNITY | Save draft | works | built | Nothing |
| TAB-SHARE-TO-COMMUNITY | Publish to community | works | built | Nothing |
| SCR-BUILD | Export brain | works | built | Opens the export dialog |
| SCR-BUILD | Use in a game | partial | planned | A game-specific view or package; today the target opens the ONNX brain export (for Unity Sentis or Godot) |
| SCR-BUILD | URDF and MJCF export | works | built | Formats of the export dialog |
| SCR-BUILD | Chat explains what it prepared | partial | planned | A Builder role; today the project's general copilot answers, with its export_robot and check_hardware tools |
| STA-BUILD-HARDWARE | Guided steps | partial | planned | Pick, check, export are real; running on the device is the README's job |
| STA-BUILD-HARDWARE | Connected device line | partial | planned | Shows the kit checked against; no device discovery |
| STA-BUILD-HARDWARE | Live calibration | partial | planned | Replaced by the joint and sensor check against the kit's rated limits |
| STA-BUILD-HARDWARE | Problem card | works | built | First failing or warning part with its gap and fix |
| STA-BUILD-HARDWARE | Recheck | works | built | Checks the current revision again |
| STA-BUILD-HARDWARE | Skip this part | works | built | Accepts the gap and leaves it out of the verdict |
| STA-BUILD-HARDWARE | Test drive | missing | planned | Remote drive with limits |
| STA-BUILD-HARDWARE | Load the brain | missing | planned | Runtime and ONNX deploy |
| STA-BUILD-HARDWARE | 3D preview | missing | planned | Empty placeholder today |
| STA-BUILD-HARDWARE | Safety rules | works | built | From the body's top speed and what was measured |
| STA-BUILD-HARDWARE | Parts list with total | works | built | Kit parts the body uses, approximate prices |
| STA-BUILD-HARDWARE | Chat helps with hardware | partial | planned | A Builder role; today the project's general copilot answers, with its check_hardware tool |
| SCR-BUILD | Export animation target | partial | planned | The target opens the real JSON/BVH motion export, but its fact says 'glTF · FBX', which the export does not write |

## 3. Not in the spec yet

Each row proposes where the feature belongs and the work by layer. "Contract" means `services/engine/src/icarus/contracts/`, landed first as its own task. Rows delivered since 2026-11-01 (last workspace, Ctrl O, the projects folder, checkpoint policy, the engine-down copy, explorer drag and menu, sky properties, the Part tool, sensor rays, the copilot cards, following a copy, the privacy note) were removed.

| Feature | Proposed home | Contract | Engine | Desktop |
|---|---|---|---|---|
| Home hero 3D scene | Sprint 14 parity pass | None | Serve a template scene (exists) | Render a real template scene behind the hero |
| Project status pills beyond training (failed, published, edited yesterday) | Sprint 7 follow-up | `ProjectSummary.updated_at`, last run state | Fill them in `GET /projects` | Map in `projectView` |
| Projects filter Published | Sprint 13 | Publish state on the summary | From the community client | Filter |
| Import with no open project | Sprint 9 | None | Create a project from the import | Route through project creation |
| System tray notifications | Sprint 13 (local half could go in Sprint 7) | None | Run events (exist) | Main-process `Notification` |
| Training copies grid in the Scene view | Sprint 8 | None | `GET /projects/{id}/copies` (exists) | Draw copies around the edited world |
| "Add an agent" row | Sprint 8 editor pass | None | None | Action row when no body |
| Inspector Training section | Sprint 8 | None | None | Section built from `brain.copies` and Randomize |
| Hover a property highlights its target | Sprint 14 | Target geom ids per property | Map property to geoms | Highlight |
| Property right-click menu | Sprint 8 editor pass | None | None | Menu |
| Library environments, agents and bodies | Sprint 8 library pass | Piece kinds | Pieces from templates | Library shelf |
| New-project chat greeting with routed chips | Sprint 7 copilot pass | See section 4 | Opener message | Render |
| Edit a proposal by hand | Sprint 8 | Proposed values per property | Open a proposal as a draft | `editable: true` path |
| Ideas chat and "Show 3 more" | Sprint 8 | Conversation keyed by idea set | Architect regeneration | Chat on SCR-IDEAS |
| Vary time of day and wind per copy | Sprint 12 (sim-to-real presets) | Variation kinds | `sim/variation.py` | Popover rows |
| Reward term as a component, wind and water components | Not recommended; rewards stay task terms | None | None | Remove from the picker design |
| Terrain shaping, Paint, Props placement, Camera tool | Sprint 11 or 14 | Heightfield and camera components | Compiler | Tool modes |
| Lit modes and split view | Sprint 14 | None | None | Viewport options |
| Library drag and drop | Sprint 8 editor pass | Drop position on `create_object` (exists) | None | Drag |
| Suggestion intents | Sprint 7 copilot pass | Section 4 | Section 4 | Use `suggestionRoutes` |
| Keep chatting while building | Sprint 8 | None | Queue edits onto a build's project | Chat during build |
| Add a workspace from the header "+" (added) | Drop from the design unless a real meaning is found | None | None | None, or a "+" that opens a workspace picker |
| Neuron check list in the brain chat (added) | Sprint 8 | `CopilotMessage.checks` (section 4) | Fill from `NeuronNote` (section 5) | Render existing check list |
| Chat clear and export | Sprint 7 copilot pass | None | `DELETE` and export routes on the conversation | "⋯" menu |
| Copilot explains the brain | Sprint 8 | Network read types (section 5) | Copilot tool `inspect_brain` | None |
| Motor speed | Sprint 9 | Motor `max_velocity` | Compiler | Inspector row |
| Motion retiming, looping, Roblox R15 target | Sprint 10 if kept; otherwise drop from the design | Export options | `motion/export.py` | Dialog fields |
| Run inspector (method, start, budget, locks) | Sprint 7 | None | None | Inspector from `RunStatus` and `RunConfig` |
| Run goals in the progress card | Sprint 8 (with curriculum) | Goals or curriculum stages | Stage progress per run | Progress card |
| Stop at a chosen step | Sprint 8 | `PATCH /runs/{id}` with `total_steps` | Worker reads a new budget | Chip action |
| Live-episode scrubber | Sprint 7 follow-up | None | Latest rollout (exists) | Fill `LiveView.episode` |
| Reward weight change on breakdown | Sprint 8 | None | Revision diff (exists in comparisons) | Show previous weight |
| Console copy and filter | Next desktop fix pass | None | None | Filter and copy |
| Fix and restart for crashed runs | Sprint 7 follow-up | None | Coach diagnosis of worker failures | Card action |
| Vision annotations over replays | Sprint 8 | `DiagnosisEvidence` with time, shape (circle, path) and world coordinates | Coach writes them from contacts and poses | Overlay |
| Behavior narration in Play (status card and events) | Sprint 8 | `PlayEvent` kinds for behavior | Detectors over senses and actions | Render |
| Copilot sees the live Play session and drives Play tools | Sprint 8 | `SendMessage.play` (latest frame summary and events) | Copilot Play tool | Pass context |
| Turn a Play surprise into a training change | Sprint 8 | None | Proposal of a variation edit | Route to training copies |

## 4. Copilot messages and bubbles

`CopilotMessage` now carries a title, check items, inline actions (including show and dismiss), a proposal, a build id, a run card with milestone steps and a plan; empty conversations open with a welcome and starter chips, suggestions carry an intent, and the desktop follows `/events` for live steps and coach messages.

| Kind in the design | Where | Today | Left |
|---|---|---|---|
| User bubble, answer, title, check list | Every workspace | Real | None |
| Inline action buttons | Several | Real | None |
| Proposal card | Every workspace | Real | "Edit by hand" needs proposed values per property |
| Build progress card | STA-WORLD-BUILDING | Real | None |
| Run progress card with goals | SCR-TRAIN | Real progress | Goals stay empty until runs have stages (curriculum) |
| Milestone divider, coach observations | SCR-TRAIN | Real on coached runs | None |
| "Next run, if you agree" plan card | SCR-TRAIN | Real plan | The card has no action buttons of its own |
| Welcome with starter chips | STA-WORLD-EMPTY | Real | Chips are sent as messages, not routed intents |
| Suggestion chips | Every workspace | Real intents for ask, propose-change, explain, diagnose, compare, train-run, stop-run, play, show, share | The engine never emits apply-fix, new-idea, refine-ideas, template, record, dismiss, add-to-training, import, motion-video, export-brain, order-parts, resize-brain or export |
| Autonomy note | SCR-TRAIN, MOD-AUTOPILOT | Real (autopilot chip) | None |
| Live steps while working | Every workspace | Real | None |

## 5. Neurons and the brain view

**What exists.** The named input and output layout, the network architecture in `BrainSpec` (layers, algorithm, learning rate), `GET /runs/{id}/network`, activations from one observation of a checkpoint's evaluation (`/activations`), readings, behaviors grouped from evaluation episodes, and measured sizes with training time and success from past runs (`training/brain_insights.py`).

**What is left, in order:**

1. **Live activations.** Glow, hot links, readings and brain activity read one evaluation observation, not the running Play session; add activations to `PlayFrame` behind a watch command.
2. **Checkpoint switch.** The Live, 25k, 312k options are real labels but clicking one says not available yet; load the network of the chosen checkpoint.
3. **Real wiring in the diagram.** The faint background wires are still a fixed pattern; draw the checkpoint's strongest weights.
4. **Neuron explanations.** Correlate each hidden neuron with the named inputs over evaluation rollouts (`NeuronNote`) so the chat can say what a neuron responds to.
5. **Copilot access.** A read tool returning the layout, activations and neuron notes, so questions about the brain are answered from data.

## 6. Top gaps today

Ranked by how much each one confuses or blocks someone using the app.

1. **Connectome screens show a different brain.** `STA-BRAIN-CONNECTOME` and the fly source present the trained brain's data under connectome labels. Build Sprint 11 or relabel the screens until it exists.
2. **Rig check problems cannot be clicked, and the amber banner says "Can't train yet" when training is allowed.** Both read as broken on the first body someone imports.
3. **Motion shows stick figures with no video behind them.** A bad track is visible only in the tracking dialog; draw the video frame under the skeleton in Side by side, Overlay and Reference only.
4. **The Library's Community shelf always says nothing is published,** even with creations on the community service.
5. **Import needs an open project.** "Import your own" on Home and "Open a file" on Projects only say no project is open.
6. **Empty pictures where real data exists.** Home community cards, the share preview card and moderation previews leave the picture blank.
7. **Brain views are snapshots, not live.** Readings, glow and activity come from one evaluation observation.
8. **Notifications never fire for local runs,** and the Notifications settings page promises system tray notifications that do not exist.
9. **The animation export Target field is never sent,** and the export target card promises glTF and FBX, which the export does not write.
10. **Body tool modes say not available yet.** Bone, Joint, Motor, Sensor, Mirror, Collider, Weights and Test pose in the toolbar have no action.
11. **No curriculum.** The Curriculum tab honestly shows one stage, and run cards never show goals.
12. **Creation pages have no comments, brain tab or published timelapse.**
