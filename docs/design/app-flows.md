# App flows

What every control does in the **app** (engine-backed mode), and what it should do for a first-time user. The design catalog ([`screens.md`](./screens.md)) describes the intended product; this page records where the app stands against it, so no control silently does nothing.

Rules this audit enforces:

- A control either works against the engine, opens a screen that says honestly that it is *not available yet* (a pending port, see `apps/desktop/PENDING.md`), or is **dimmed** with a tooltip saying what it will do and *Not available yet*; clicking it explains the same in a notice. Never silent.
- Every toolbar tool has a tooltip: its name and one line on what it is for.
- **Play** means *try it live*: the current brain acts in the world and you poke it with tools; nothing changes the project. **Train** means *practice*: the brain learns over many tries in parallel copies. Both say so on hover, Play names the brain it runs, and the start dialog explains steps, copies and time in plain words.
- The prototype and design gallery keep their design: app-only changes are behind `useRuntimeMode() === "app"`; shared changes are tooltips and menus that do not change layout.

Status: **works** (real, against the engine) · **pending-honest** (says *not available yet*) · **broken** (did nothing, threw, or showed sample data) · **confusing** (worked, but a beginner could not tell what it does). The *Now* column is after the fixes of this audit; *Before* says what was wrong.

## Inventory

| Screen | Control | Now in the app | Status | Before → fix |
|---|---|---|---|---|
| Home | Describe prompt, Send, *Press enter to see 3 ideas* | Opens `SCR-IDEAS` with the prompt; ideas come from the engine | works | |
| Home | Template cards (example, empty world) | Creates a project from the template and opens World | works | |
| Home | *Import your own* | Opens `MOD-IMPORT`, which says import is not available yet | pending-honest | |
| Home | *Take the 3 minute tour* (first launch) | Creates an empty project and shows the getting-started checklist | works | Kept the previous project's route parameters, so it could reopen an old project → starts clean |
| Home | From the community strip | Panel says the community is not available yet | pending-honest | |
| Launcher header | Home, Projects, Community | Navigate; Community pages are pending | works / pending-honest | |
| Launcher header | Search creations, Bell, Avatar | Community, notifications and sign-in screens say not available yet | pending-honest | |
| Sign in dialog | Continue with Google, GitHub, email | Dimmed, *not available yet* | pending-honest | Opened an empty profile page as if signed in |
| Ideas | Tweak | Dimmed, *not available yet* | pending-honest | Undimmed, answered with a generic notice |
| Projects | Filters All · Training · Drafts · Published | Filter the list; a project with a live run (starting, running or stopping) shows as *Training · Run N at P%*; Published is empty and its empty state says publishing is not available yet | works | Every project was a draft, so Training and Published were always empty → the list reads each project's runs; Published says why it is empty |
| Projects | Project card | Opens the project in World | works | |
| Projects | *Open a file* | Opens `MOD-IMPORT` (pending); tooltip added | pending-honest | |
| Projects | *New project* | Creates an empty project with the checklist | works | Reopened the last project when one was in the route → starts clean; tooltip added |
| Project menu | Rename, Duplicate, History, Delete project…, Open project…, Close project (the design's *Back to Home*) | Work against the engine; Close project returns Home with no project open | works | |
| Duplicate, Delete dialogs | Training runs line | Count the project's real runs. Runs live in the engine's runs folder, not in the project: Delete says they stay in the runs folder, and Duplicate dims *Trained brains* and *Training runs* with *N runs stay with the original*. No size is shown because the engine does not measure it | works | Always said there were no runs → real run count and what happens to the runs |
| Project menu | Project settings | Opens `SCR-SETTINGS-TRAINING` as `screens.md` says; the tooltip says these training and hardware settings are shared by every project | works | Label promised per-project settings → kept the design's label and destination, tooltip says the settings are shared |
| Workspace header | Workspace tabs | Navigate; each explains its workspace on hover | works | No tooltips → one-line purpose per tab |
| Workspace header | Play | Enters Play; tooltip *Try it live… nothing changes the project* | works | No explanation of Play vs Train → tooltip |
| Workspace header | Train (primary) / Stop while training | Opens `MOD-START-TRAINING` / `MOD-STOP-RUN`; tooltip *Practice: the brain learns over many tries…* | works | No explanation → tooltip |
| Workspace header | *Getting started n/4* / *Guide* | Opens the checklist popover in place: body, goal, rewards, trained, each with a one-click action and a *Next* button | works | Navigated to `STA-WORLD-EMPTY`, which swapped the toolbar and disabled Train and Play for an existing project; the "trained" step was hard-coded to never be done → reads the project's runs |
| Workspace header | Share | Opens `MOD-SHARE`, which says sharing is not available yet | pending-honest | |
| Workspace header | Panels menu, panel ⋯ menus | Show, hide, float, maximize panels | works | |
| World | Explorer rows, 3D selection, gizmo move | Select and move objects as edit operations | works | |
| World | Explorer `+` | Menu of library pieces; picking one places it in the world | works | Did nothing → menu |
| World | Inspector properties, Reset, + Add component | Edit through the engine | works | |
| World | Inspector component `···` | Menu with *Remove ‹component›* (one edit operation, undoable) | works | Did nothing → menu |
| World | Inspector asset *Change* | Dimmed, *not available yet* | pending-honest | Did nothing |
| World | Inspector *auto* chip | Tooltip *Computed from the shape*; clicking does nothing | confusing | Not changed: informational chip drawn as a button in the design |
| World | Toolbar Terrain, Sky, Light | Select the ground, the sky or the sun, so the Inspector shows its settings; a notice when the world has none | works | Only highlighted themselves → select the object |
| World | Toolbar Paint, Props, Camera | Dimmed, tooltip and notice *not available yet* (Library places props; the camera menu moves the view) | pending-honest | Only highlighted themselves |
| World | Toolbar Copies, Randomize | Open `POP-TRAINING-COPIES` (copies and variations work) | works | |
| World | Toolbar Import world, Library import card | Open `MOD-IMPORT` (pending) | pending-honest | |
| World (new project) | Toolbar Agent, Goal | Ask the copilot to add a body / a goal zone | works | Agent opened Ideas for a *new* project and Goal opened the pending Brain panels → ask the copilot |
| World (new project) | Toolbar Part | Dimmed, *not available yet* | pending-honest | Only highlighted itself |
| World (new project) | Guide card | The same checklist as the header, with actions | works | Showed five fixed sample steps |
| World (new project) | Header Train and Play | Enabled: the project exists in the app | works | Disabled with *Available once the project exists* although it existed |
| World | Library cards | Place the piece in the world | works | |
| World | Library Community, My files | Empty shelves (nothing shared or imported yet) | works | |
| Viewport | Scene tab, camera menu, Frame all | Draw the compiled scene; camera modes work | works | |
| Viewport | Game view tab | Draws the world to look at (orbit only) | works | Was an empty panel |
| Viewport | `+` Add a view | Dimmed, *not available yet* | pending-honest | Did nothing |
| Viewport | *Lit* option | Dimmed, *not available yet* | pending-honest | Did nothing |
| Body | Header | World · Body · Brain · Train · Results · Build; Play plays the project | works | Showed a Motion tab and Play led to the pending Motion workspace |
| Body | Rig view | Draws the project scene | works | Was an empty panel |
| Body | Explorer, Inspector | Work as in World | works | |
| Body | Checks panel | Says rig checks are not available yet | pending-honest | |
| Body | Toolbar Import, Auto-rig | Open pending dialogs | pending-honest | |
| Body | Toolbar Bone, Joint, Motor, Sensor, Mirror, Collider, Weights, Test pose | Dimmed with tooltip and notice | pending-honest | Only highlighted themselves |
| Brain | Senses and actions, Learning, readings card | Say not available yet | pending-honest | |
| Brain | Senses and actions `+` (add a sensor input) | Dimmed, *not available yet* | pending-honest | Did nothing |
| Brain | Inspector, Train | Work | works | |
| Brain | Viewport | Draws the project scene | works | Was an empty panel |
| Brain | Toolbar Senses | Dimmed with tooltip and notice | pending-honest | Only highlighted itself |
| Brain | Toolbar Network | Opens the network state, whose panels are pending | pending-honest | |
| Train | Train tool, header Train, *Start run N* | Start a real run; the dialog now explains practice, steps, copies and time | works | Steps, copies and time were unexplained → plain-words intro and field tooltips |
| Train | Stop tool, header Stop, Stop dialog | Stop the run, keeping the best brain | works | |
| Train | Pause tool | Opens the stop dialog, where Pause says not available yet | pending-honest | |
| Train | Pause and Stop tools with nothing training | Dimmed; hover and click say no run is training | works | Opened a stop dialog for no run, whose buttons failed |
| Train | Timelapse, Autopilot | Open screens that say not available yet | pending-honest | |
| Train | Runs, Metrics, Console, Live training, Replay | Real run data | works | |
| Train | Live training episode bar play button | Opens Replay on that checkpoint's recorded episode, playing | works | Did nothing, also after the run finished |
| Results | Every panel | Says not available yet | pending-honest | |
| Build | Every panel and dialog | Says not available yet | pending-honest | |
| Play | Header | Names the brain that plays (untrained or trained run N) with *Train it* while untrained | works | Which brain played was only a small line in a side panel → header chip |
| Play | Stop | Back to the workspace as it was | works | |
| Play | Record | Dimmed, *not available yet* | pending-honest | Opened the pending timelapse screen |
| Play | Tool bar (Move, Push, Add object, Light, Wind, Slow, Reset…) | Act on the live world | works | |
| Play | Speed, Pause/Resume, Reconnect | Work | works | |
| Play | *Use another brain* | Lists every finished run's best brain; one that does not fit the body is dimmed with the reason; picking one restarts Play with it | works | Opened the pending Results workspace |
| Play | What happened lines | Plain text | works | Were buttons that did nothing (jump to a recording that does not exist) |
| Play | Chat ⋯ *Chat options* | Does nothing (Play's chat is not docked) | broken | Not fixed here: copilot zone, left to the chat work |
| Settings | AI models | Real model connections | works | |
| Settings | Training and hardware fields | Real settings | works | |
| Settings | Restart engine | Restarts the local engine in place | works | Was pending, and opened a sample *engine stopped* screen with made-up error text |
| Settings | Profile, Privacy, Notifications | Say not available yet | pending-honest | |
| Dialogs | Start training, Stop run, Rename, Duplicate, Delete, History, Training copies, Add component | Work | works | |
| Dialogs | Share, Import, Auto-rig, Autopilot, Brain sizes, Brain source, Export, Publish | Say not available yet | pending-honest | |
| Auto-rig dialog | Footer | Only Close while auto-rig is not available | pending-honest | Cancel answered *not available yet* and See result opened a failed-check state |
| Notices | Every notice | Leaves after a few seconds; the same notice is not stacked twice | works | Stayed until dismissed and piled up over the bottom of the workspace (Library cards, Console) |

## Counts

Rows of the inventory after the fixes (79): **works 48**, **pending-honest 29**, **confusing 1**, **broken 1**. A row whose status depends on the page, like the launcher links, counts once as works.

Before the fixes, 34 rows were broken or confusing; 32 are fixed and 2 remain (the inspector *auto* chip, Play's *Chat options*).

## Changes against the design catalog

Recorded in `screens.md` as app-side notes:

- `HDR-WORKSPACE` guide pill opens the checklist in place instead of `STA-WORLD-EMPTY` (the prototype keeps the design).
- `HDR-PLAY` adds the brain chip; Record is not available yet.
- `PNL-TOOLBAR` tooltips; Terrain, Sky and Light select their object; Agent and Goal ask the copilot; tools with nothing behind them are dimmed.
- `PNL-EXPLORER` `+` is a library menu; `PNL-INSPECTOR` `···` offers Remove.
- `PNL-VIEWPORT` `+` and *Lit* are not available yet; Game view draws the world.
- `TAB-WHAT-HAPPENED` jumps are not available yet.
- `SCR-SETTINGS-TRAINING` Restart engine restarts in place.
- `POP-TRAINING-COPIES` *Preview copies* shows every copy's first try in the World viewport and closes the popover instead of opening `SCR-TIMELAPSE`; the inventory and the gallery keep the design's link.
- `POP-PROJECT-MENU` *Project settings* keeps its label and destination; its tooltip says the settings are shared by every project.
- `SCR-PROJECTS` filters by live runs; the Training and Published filters have their own empty states.
- `MOD-DUPLICATE`, `MOD-DELETE-PROJECT` say what happens to the project's runs, which stay in the runs folder; no size is shown.

## Follow-ups

- Published status arrives with the community; deleting or duplicating a project's runs, and their size on disk, need engine support (runs live apart from projects).
- Play's *Chat options* button (copilot zone).
- Results is the natural place after training and is entirely pending: it should at least list runs and their best brains, which the training API already serves.
