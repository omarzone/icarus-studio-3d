# App gaps against the design

What the design proposes, what the app does today, and what the spec plans for each part. It was written from the reference renders in `docs/design/reference/`, the design source files, `screens.md`, the plans in `docs/plans/` and the renderer, port and engine code on the `feat/desktop-thumbnails` working tree as of 2026-11-01. The working tree includes uncommitted engine and desktop work (coach, autopilot, events, results wiring), so some rows describe code that is not on `main` yet.

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
| built | A delivered sprint plan (1 to 6) or `app-flows.md` names it |
| planned | A later sprint, an explicit deferral or a `PENDING.md` key names it |
| not in spec | Only the design has it |

## 1. Summary

There are 594 features across seven groups.

| App today | Count | | In spec? | Count |
|---|---|---|---|---|
| works | 195 | | built | 212 |
| partial | 89 | | planned | 311 |
| pending | 204 | | not in spec | 71 |
| fixture-only | 27 | | | |
| missing | 73 | | | |
| broken | 6 | | | |

| Group | Features | works | partial | pending | fixture-only | missing | broken |
|---|---|---|---|---|---|---|---|
| Launcher, projects, community, settings, system | 107 | 29 | 10 | 58 | 1 | 6 | 3 |
| World, ideas, editor panels | 121 | 59 | 23 | 15 | 3 | 21 | 0 |
| Copilot | 44 | 23 | 9 | 1 | 9 | 2 | 0 |
| Brain | 68 | 4 | 6 | 39 | 1 | 16 | 2 |
| Body and motion | 87 | 9 | 14 | 50 | 3 | 11 | 0 |
| Train and results | 91 | 44 | 17 | 18 | 5 | 6 | 1 |
| Play and build | 76 | 27 | 10 | 23 | 5 | 11 | 0 |

Notable crossings: 36 features are built per the plans but still partial, missing, fixture-only or broken (for example blue proposed rows in the explorer, the "Building…" inspector and the first-launch Home card, which the app never routes to). 46 planned features have no code on either side yet.

The short version:

- **Real today:** local projects (list, thumbnails, rename, duplicate, delete, history and restore), the World editor loop (select, edit with "was" and Reset, components, gizmo, library props, undo, training copies with real per-copy variation), building from three compiled ideas, copilot chat with proposals (blue preview, diff, warnings, Apply and Discard), live Play on MuJoCo with nine tools, and Train (runs, metrics, reward breakdown, live copies, replay, start, stop, failure card). On the working tree, Results (runs, best brains, summary, comparison, learning history, failure groups, diagnoses) and the Autopilot dialog are now wired to the engine coach.
- **Honestly pending:** Body rig and import (Sprint 9), Motion (Sprint 10), every Brain panel (Sprint 8 and 11), Build and export (Sprint 12), and everything community, account, share, publish and notifications (Sprint 13).
- **The biggest silent gaps:** chat cards the design leans on (check lists, run progress, milestones, next-run plan, welcome) cannot come from the engine because `CopilotMessage` has no fields for them; suggestion chips never navigate; the Brain workspace's readings card and network diagram vanish instead of saying "not available yet"; the "Let the copilot coach" switch is never sent; and the Engine down page promises runs "pause" when they do not.

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
| SCR-HOME | "Import your own" card | pending | planned | Import pipeline (Sprint 9) and import without an open project |
| SCR-HOME | Community header with Featured, Recent, Most voted | pending | planned | Community service (Sprint 13) |
| SCR-HOME | Four community cards with thumbnail, votes, Remix | pending | planned | `community.list`, creation thumbnails |
| SCR-HOME | Remix pill starts a project from a creation | pending | planned | `community.remix`, bundle import |
| STA-HOME-EMPTY | First-launch card with the 3 minute tour | fixture-only | built | (corrected) Nothing routes to `STA-HOME-EMPTY` in the app: it starts on `SCR-HOME` (`app-providers.tsx` `HOME`), so the card shows only in the design gallery. Show it when `GET /projects` is empty |
| HDR-WORKSPACE | Project name with chevron opening POP-PROJECT-MENU (added) | works | built | Nothing |
| HDR-WORKSPACE | Workspace switcher World, Body, Motion, Brain, Train, Results, Build (added) | works | built | Motion appears only for character projects with clips (Sprint 10) |
| HDR-WORKSPACE | "+" after the tabs to add a workspace (added) | missing | not in spec | `workspace-header.tsx` renders no "+"; decide what adding a workspace means or drop it from the design |
| HDR-WORKSPACE | Play button, disabled until a design exists (added) | works | built | Nothing |
| HDR-WORKSPACE | "Getting started n/N" guide pill (added) | works | built | In the app it opens the engine checklist in place |
| HDR-WORKSPACE | Share button (added) | pending | planned | Opens MOD-SHARE, which is pending (Sprint 13) |
| HDR-WORKSPACE | Primary action follows the next step (Train, Stop, Publish, Train copy, Run test) (added) | partial | built | Train and Stop are real; Publish (Sprint 13), Train copy (Sprint 10) and Run test (Sprint 11) lead to pending screens |
| HDR-WORKSPACE | One-line hover purpose on tabs, Play, Share, primary (added) | works | built | Nothing |
| HDR-LAUNCHER | Home, Projects, Community tabs | works | built | Community destination is pending |
| HDR-LAUNCHER | "Search creations" field | pending | planned | Searchable community catalog |
| HDR-LAUNCHER | Bell with unread dot | pending | planned | `notifications.list` |
| HDR-LAUNCHER | Avatar opens profile or sign-in | pending | planned | `account.get`, OAuth PKCE sign-in |
| SCR-PROJECTS | Grid of local projects | works | built | Nothing |
| SCR-PROJECTS | Rendered thumbnail per project revision | works | built | Nothing |
| SCR-PROJECTS | Status pill per card (training, needs attention, published, draft yesterday) | partial | not in spec | "Training · Run N at P%" is real now; failed runs, published state and last-modified time are not in `ProjectSummary` |
| SCR-PROJECTS | Filter All, Training, Drafts, Published | partial | not in spec | Training works; Published is always empty until publish state exists |
| SCR-PROJECTS | Open in the workspace it was last in | partial | not in spec | Persist the last workspace per project; today every project opens in World |
| SCR-PROJECTS | "Open a file" button | pending | planned | Import (Sprint 9) without an open project |
| SCR-PROJECTS | "New project" starts an empty world with the guide | works | built | Nothing |
| SCR-PROJECTS | Saved-locally note and empty states | works | built | Nothing |
| SCR-COMMUNITY | Featured, Recent, Most voted switch | pending | planned | Catalog API |
| SCR-COMMUNITY | Category chips | pending | planned | `community.categories`; only "All" renders |
| SCR-COMMUNITY | "Every creation is reviewed" note | works | planned | Static copy; moderation must exist to make it true |
| SCR-COMMUNITY | Creation cards with thumbnail, votes, author, remixes | pending | planned | Catalog with previews; thumbnail area is empty even in the prototype |
| SCR-CREATION | Hero replay with "Watch how it learned" | pending | planned | `community.creation` with bundle rollouts |
| SCR-CREATION | Tabs Overview, How it learned, Brain, Versions, Comments | pending | planned | Creation detail data |
| SCR-CREATION | Checkpoint strip opening the timelapse at a step | pending | planned | Checkpoint thumbnails in the bundle |
| SCR-CREATION | Comment list (read only) | pending | planned | Comments in the service |
| SCR-CREATION | Author card with Follow | pending | planned | `account.follow` |
| SCR-CREATION | Votes, remixes, downloads tiles | pending | planned | Catalog counters |
| SCR-CREATION | "Remix into my projects" | pending | planned | `community.remix`, validated bundle unpack |
| SCR-CREATION | Vote | pending | planned | `community.vote` |
| SCR-CREATION | "Included" list and license | pending | planned | Bundle manifest |
| SCR-CREATION | Report this creation | pending | planned | `community.report`, moderation |
| MOD-REPORT | Reason radio cards (offensive, stolen, spam, harmful, other) (added) | pending | planned | Dialog exists (`report-dialog.tsx`); Send report is disabled until a reason is chosen |
| MOD-REPORT | Details field and "Block the author" switch (added) | pending | planned | A block list in the community service; the request already carries `blockAuthor` |
| MOD-REPORT | Send report (added) | pending | planned | `community.report` (Sprint 13); also blocks the author when the switch is on |
| SCR-MODERATION | Team-only screen with its own title bar, "Signed in as moderator" (added) | pending | planned | Not part of the desktop product per `screens.md`; a moderator role and sign-in in the community service |
| SCR-MODERATION | Queues Reports, New creations, Banned people, Appeals with counts (added) | pending | planned | `moderation.counts`, `moderation.list` (Sprint 13) |
| SCR-MODERATION | Report card with preview, reason, report count, automatic scan result (added) | pending | planned | `moderation.list` items carrying the bundle scan from publish |
| SCR-MODERATION | Keep, Remove, Ban user (added) | pending | planned | `moderation.decide` |
| SCR-MODERATION | "Nothing to review" empty queue (added) | pending | planned | Drawn by `QueryView` only after the queue answers, which never happens while `moderation.list` is pending |
| SCR-PROFILE | Header with avatar, bio, signature, Edit profile | pending | planned | `account.profile` |
| SCR-PROFILE | Stats: creations, votes, remixes, followers | pending | planned | Profile counters |
| SCR-PROFILE | Shelves My creations, Remixes, Liked, Drafts | pending | planned | `account.profile-creations`; Drafts needs local projects joined with publish state |
| SCR-PROFILE | Follow on someone else's profile | pending | planned | `account.follow` |
| MOD-SIGN-IN | Google, GitHub, email sign-in | pending | planned | OAuth PKCE via system browser, deep link, keychain session |
| POP-NOTIFICATIONS | Run stopped/finished, publication approved, remixes, each opening its screen | pending | planned | Feed; local run notifications could come from engine run events today but are bundled into Sprint 13 |
| POP-NOTIFICATIONS | Unread highlight and "Mark all read" | pending | planned | Stored read state |
| POP-PROJECT-MENU | Rename, Duplicate, History with revision, Open, Settings, Delete, Home | works | built | Nothing |
| POP-PROJECT-MENU | "Ctrl O" shown next to Open project | broken | not in spec | A global Ctrl/Cmd+O handler; only undo and redo shortcuts exist |
| POP-PROJECT-MENU | "Project settings" item | partial | not in spec | Opens the global Training settings; per-project settings or an honest label |
| POP-PROJECT-MENU | Project actions by asking the copilot | missing | planned | Copilot tools to list, duplicate, delete and open projects (Sprint 6 rule "copilot hooks for every UI") |
| MOD-RENAME | Name and short description, Save disabled without a name | works | built | Nothing |
| MOD-DUPLICATE | Prefilled "X copy" name | works | built | Nothing |
| MOD-DUPLICATE | Switches for world and body, trained brains, runs (with size) | broken | planned | The `include` switches are ignored; engine duplicate copies only the project document; run size is never measured |
| MOD-DELETE-PROJECT | States what is deleted (project, N runs, size) | partial | planned | Run count is real now and the dialog says runs stay; run size is not measured and engine delete leaves runs on disk |
| MOD-DELETE-PROJECT | Delete removes it and returns to Projects | works | built | Nothing |
| MOD-SHARE | Visibility switch | pending | planned | `share.visibility` |
| MOD-SHARE | Link field and Copy link | pending | planned | `share.get` |
| MOD-SHARE | Invite by email | pending | planned | `share.invite` |
| MOD-SHARE | People list with roles | pending | planned | `share.role`, a collaboration model the architecture does not define yet |
| MOD-PUBLISH | Who it appears as and what people can do | pending | planned | `publish.readiness` |
| MOD-PUBLISH | Automatic checks (no personal data, no code, title written) | pending | planned | Bundle pack with validation and scan |
| MOD-PUBLISH | Guideline agreement gating Publish | pending | planned | `publish.guidelines` |
| MOD-PUBLISH | Publish sends for review | pending | planned | `publish.send` |
| MOD-PUBLISHED | "Sent for review" confirmation | pending | planned | `publish.review` |
| MOD-IMPORT | Kind switch: model, environment, robot | pending | planned | Importers (Sprint 9) |
| MOD-IMPORT | Choosing or dropping the file | missing | planned | A file picker or drop zone through the main process; the dialog has no control to choose a file |
| MOD-IMPORT | 3D preview with triangles, height, detected kind | pending | planned | Model reading and shape detection; preview box is empty even in the prototype |
| MOD-IMPORT | Steps auto-rig will run | pending | planned | Auto-rig pipeline |
| MOD-IMPORT | Import as static mesh, Import and auto-rig | pending | planned | `body.importStatic`, `body.importAndRig` |
| MOD-IMPORT | Opening Import with no project open | pending | not in spec | Decide whether import from the launcher creates a project first |
| SCR-SETTINGS | Side navigation | works | built | Nothing |
| SCR-SETTINGS-MODELS | One row per capability with status | works | built | Nothing |
| SCR-SETTINGS-MODELS | Endpoint and API key stored locally | works | built | Nothing |
| SCR-SETTINGS-MODELS | Test connection and Save | works | built | Nothing |
| SCR-SETTINGS-PROFILE | Change and remove photo | pending | planned | `account.change-photo` |
| SCR-SETTINGS-PROFILE | Name, username, location, website, bio | pending | planned | `account.update-profile` |
| SCR-SETTINGS-PROFILE | Signature on my creations | pending | planned | Persisted and stamped into bundles |
| SCR-SETTINGS-PRIVACY | Show, remix, comments switches | pending | planned | `settings.privacy` |
| SCR-SETTINGS-PRIVACY | Blocked people with Unblock | pending | planned | `settings.unblock` |
| SCR-SETTINGS-PRIVACY | Download my data, Delete account | pending | planned | Both endpoints |
| SCR-SETTINGS-TRAINING | CPU threads slider | works | built | Nothing |
| SCR-SETTINGS-TRAINING | Use a graphics card when found | works | built | Nothing |
| SCR-SETTINGS-TRAINING | Editable projects folder | partial | not in spec | Looks editable but the engine refuses; make it read-only or support moving |
| SCR-SETTINGS-TRAINING | Keep checkpoints policy | partial | not in spec | A retention policy in the run store, or a read-only row |
| SCR-SETTINGS-TRAINING | Engine status with Restart | works | built | "healthy" is hardcoded but only shown after the engine answered |
| SCR-SETTINGS-NOTIFICATIONS | Run finished, copilot needs OK, remixes, news | pending | planned | The first two are local and do not need the community |
| SCR-SETTINGS-NOTIFICATIONS | Notifications in the system tray | missing | not in spec | Electron `Notification` from the main process on run events |
| SCR-SETTINGS | Community server (official or self-hosted) | missing | planned | Settings row and community-client configuration (roadmap Sprint 13) |
| SYS-ENGINE-DOWN | Full-screen "The Icarus engine stopped" | works | built | Nothing |
| SYS-ENGINE-DOWN | Copy "Training runs pause until the engine is back" | broken | not in spec | Runs are not resumed; either resume after restart or say the run stops and its last checkpoint is kept |
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
| PNL-EXPLORER | "+" adds an object | works | built | Only the five library props |
| PNL-EXPLORER | Multi-select (feeds Mixed state) | missing | planned | Selection model for several objects (deferred, no task written) |
| PNL-EXPLORER | Drag a row onto another to reparent | missing | not in spec | Desktop only; engine has `reparent_object` |
| PNL-EXPLORER | Right-click: rename, duplicate, delete, ask the copilot | missing | not in spec | Desktop only; engine has the operations |
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
| STA-WORLD-EMPTY | Sky inspector: preset, clouds, horizon, time of day, sun, shadows | partial | not in spec | Clouds, time of day and shadows properties; preselect the sky |
| STA-WORLD-EMPTY | Toolbar Terrain, Sky, Light | works | built | Nothing |
| STA-WORLD-EMPTY | Part tool adds a basic shape | pending | not in spec | `create_object` with a primitive |
| STA-WORLD-EMPTY | Agent tool | works | built | Deliberately asks the copilot instead of opening Ideas |
| STA-WORLD-EMPTY | Goal tool | works | built | Deliberately asks the copilot to add a goal zone |
| STA-WORLD-EMPTY | Import tool | pending | planned | Sprint 9 |
| STA-WORLD-EMPTY | Library offers Parking lot, 16 lots, Car agent, Tripod, Humanoid | partial | not in spec | Environments, agents and bodies as library pieces |
| STA-WORLD-EMPTY | Chat greeting "Hi, what should we build?" with three routed chips | fixture-only | not in spec | Engine opener for empty conversations and chip intents (section 4) |
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
| STA-WORLD-PROPOSAL | Proposed values blue in the inspector with Accept | pending | planned | `scene.acceptProposedValue` |
| SCR-WORLD | Chat check list and suggestion chips | works | built | Chips are the engine's own suggestions sent as text |
| SCR-IDEAS | Three ideas with real 3D previews | works | built | Nothing |
| SCR-IDEAS | World, Body, Learns lines | works | built | Nothing |
| SCR-IDEAS | Training estimate | works | built | Constant throughput (ADR 001) |
| SCR-IDEAS | Recommended badge | works | built | Nothing |
| SCR-IDEAS | Filter Whole idea, Worlds only, Bodies only | partial | planned | Ideas split into worlds and bodies; the filter is ignored |
| SCR-IDEAS | "Use this" starts the build | works | built | Nothing |
| SCR-IDEAS | "Tweak" | pending | planned | `ideas.tweak` |
| SCR-IDEAS | Mix bar "Mix and build" | missing | planned | `ideas.mix`; `mix` is always null |
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
| REF-PROPERTY-TYPES | State Proposed by copilot | pending | planned | Proposed values per property |
| REF-PROPERTY-TYPES | State Out of range | partial | built | The engine refuses the value, so the red state never shows |
| REF-PROPERTY-TYPES | State Mixed | missing | planned | Multi-select |
| REF-PROPERTY-TYPES | State Locked while a run uses it | missing | planned | Lock properties of the revision a run is training |
| REF-PROPERTY-TYPES | Click edits in place, pickers, panels | partial | built | Color is a hex field, no picker |
| REF-PROPERTY-TYPES | Asset "Change" | pending | planned | Asset picker (Sprint 9) |
| MOD-HISTORY | Every revision newest first | works | built | Shows "14" rather than "r14" |
| MOD-HISTORY | Current chip | works | built | Nothing |
| MOD-HISTORY | Restore creates a revision | works | built | Nothing |
| MOD-HISTORY | Opened from the chat History tab | works | built | Nothing |
| PNL-VIEWPORT | Orientation cube | works | built | Nothing |
| PNL-VIEWPORT | Click to select with outline | works | built | Nothing |
| PNL-VIEWPORT | Move, rotate, scale gizmo | partial | built | Rotate and scale modes |
| PNL-VIEWPORT | Sensor rays from the agent | missing | not in spec | Rays in `SceneDescription` and a renderer overlay |
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
| PNL-TOOLBAR | Import world | pending | planned | Sprint 9 |
| PNL-TOOLBAR | Tooltips with name and purpose | works | built | Nothing |
| PNL-LIBRARY | 3D thumbnail per card | partial | planned | Use `scene/scene-thumbnail.tsx` for pieces; today blank |
| PNL-LIBRARY | Built-in environments and bodies | partial | not in spec | Environment and body pieces |
| PNL-LIBRARY | Drag a card into the viewport | missing | not in spec | Drag and drop with a drop position |
| PNL-LIBRARY | Click to preview | partial | built | Clicking places the piece as an edit |
| PNL-LIBRARY | Import environment card | pending | planned | Sprint 9 |
| TAB-LIBRARY-COMMUNITY | Pieces published by others | pending | planned | Sprint 13 |
| TAB-MY-FILES | Imported models, environments, videos | pending | planned | Sprint 9 |
| PNL-LIBRARY | Search assets | works | built | Nothing |

### Copilot (PNL-CHAT, TAB-CHAT, TAB-HISTORY)

| ID | Feature | App today | In spec? | What it needs |
|---|---|---|---|---|
| TAB-CHAT | User bubble | works | built | Nothing |
| TAB-CHAT | Copilot answer with bold spans | works | built | Depends on the model writing markdown |
| TAB-CHAT | Answer with a bold title line | fixture-only | not in spec | `CopilotMessage.title` |
| TAB-CHAT | Welcome answer and starter chips in an empty conversation | missing | not in spec | Engine opener (section 4) |
| TAB-CHAT | Check list with green and amber marks | fixture-only | not in spec | `CopilotMessage.checks` |
| TAB-CHAT | Inline action buttons under an answer | partial | built | Engine emits Apply, Discard, Train now and coach actions; no "show" kind |
| TAB-CHAT | "Train now" action | partial | built | Opens the Start training dialog rather than starting |
| TAB-CHAT | Navigate action | works | built | Nothing |
| TAB-CHAT | "You chose: …" collapse | works | not in spec | Nothing |
| TAB-CHAT | Show thinking | works | built | Nothing |
| TAB-CHAT | "What the copilot did" step list | works | built | Steps arrive with the finished answer |
| TAB-CHAT | Live steps while the copilot works | partial | planned | Subscribe to `/events` (exists on the engine); today a static "Working…" |
| TAB-CHAT | Scene renders sent and seen | works | built | Nothing |
| TAB-CHAT | Attach images, videos, documents | works | built | Nothing |
| TAB-CHAT | Proposal card with diff, warning, Apply, Discard, Edit by hand | partial | built | "Edit by hand" hidden |
| TAB-CHAT | Proposal applied, discarded or outdated | works | built | Nothing |
| TAB-CHAT | Open proposal previewed in blue | partial | built | Only in World |
| TAB-CHAT | Build progress card in the chat | partial | built | Real but floats in the viewport; no build message in the conversation |
| TAB-CHAT | "You can keep chatting while it builds" | missing | not in spec | Queue edits onto a project being built |
| TAB-CHAT | Run progress card with goals | fixture-only | not in spec | Run card message and a goals model |
| TAB-CHAT | Milestone dividers ("100k steps") | fixture-only | not in spec | Step marker on coach messages |
| TAB-CHAT | Coach observations at checkpoints | partial | planned | Engine posts them only on request or under autopilot; chat does not refresh live |
| TAB-CHAT | "Next run, if you agree" plan card | fixture-only | planned | Plan message or a mapping from a diagnosis proposal |
| TAB-CHAT | Suggestion chips send their text | works | built | Nothing |
| TAB-CHAT | Chips that navigate by intent | fixture-only | not in spec | An intent on suggestions (section 4) |
| TAB-CHAT | Chip intents propose-change, explain, diagnose, stop-run, train-run, apply-fix | partial | built | Text is sent and answered; routing is fixture-only; "stop at a step" unsupported |
| TAB-CHAT | Chip intents new-idea, refine-ideas, template, play, record, show, dismiss, add-to-training | fixture-only | not in spec | Engine never emits them; no action kinds for show or dismiss |
| TAB-CHAT | Chip intents import, motion-video, export-brain, order-parts, compare, share, resize-brain, export | fixture-only | planned | Each follows its feature (Sprints 7 to 13) |
| TAB-CHAT | Chip intent ask | works | built | Nothing |
| TAB-CHAT | Workspace placeholder | works | built | Nothing |
| TAB-CHAT | Autonomy switch Ask before changes, Autopilot | works | built | Toggles on click; no menu |
| TAB-CHAT | "Autopilot · 5 tries" note | fixture-only | planned | Read `AutopilotStatus.iteration` and `max_iterations` |
| TAB-CHAT | Autopilot messages with Watch training, Stop autopilot | partial | planned | Engine posts them; the chat does not refresh live |
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
| TAB-WHAT-IT-SEES | One row per brain input with switch and description | pending | planned | Named observation layout per project (section 5) |
| TAB-WHAT-IT-SEES | Coach-proposed input shown blue | pending | planned | Map open proposals onto inputs |
| TAB-WHAT-IT-SEES | Turn an input on or off | pending | planned | A new edit operation to include or exclude a sense (contract first) |
| TAB-WHAT-IT-SEES | "+" adds a sensor input | broken | planned | The button has no handler in either mode |
| TAB-WHAT-IT-CAN-DO | Outputs with ranges, turn off, limit | pending | planned | Actuator view; a limit operation |
| SCR-BRAIN | Inspector Practice: steps, parallel copies | partial | planned | A brain inspection section; today real only in Start training and Training copies |
| SCR-BRAIN | Expert settings: method, network, learning rate | missing | planned | `BrainSpec` fields for algorithm, network and rate; the worker hardcodes PPO, (256, 256), Tanh, 3e-4 |
| SCR-BRAIN | Proposed inspector value with Accept | pending | planned | `scene.acceptProposedValue` and the expert fields |
| SCR-BRAIN | 3D viewport with Scene and Game view | works | built | Nothing |
| SCR-BRAIN | Senses tool: sensor rays overlay | pending | planned | Ray hits from the engine and an overlay |
| SCR-BRAIN | "What the brain sees now" live card | broken | planned | Live readings and actions; today the card silently disappears because the component returns null on a pending error |
| SCR-BRAIN | Network tool | works | built | Nothing |
| TAB-REWARD | One card per reward term with weight | pending | planned | Read route over `TaskSpec.rewards`; the data exists |
| TAB-REWARD | Drag a weight | pending | planned | Emit the existing `set_reward_term` |
| TAB-REWARD | "1 change proposed" | pending | planned | Map proposals and diagnoses onto cards |
| TAB-GOAL | Success condition and time limit | pending | planned | Contract fields; success is hardcoded and episodes are a 30 s constant |
| TAB-CURRICULUM | Stages that make the task harder | pending | planned | Curriculum in `TaskSpec` and the env |
| SCR-BRAIN | Chat explains a reward change | partial | built | The copilot can change rewards and copies, not inputs, network, goal or curriculum |
| STA-BRAIN-NETWORK | Layer size sliders | pending | planned | Network architecture in `BrainSpec` |
| STA-BRAIN-NETWORK | Decisions per second | pending | planned | Control rate is a 20 Hz constant (design says 25) |
| STA-BRAIN-NETWORK | "+ Add a layer" | pending | planned | Hidden with the whole Shape tab until `getShape` exists |
| STA-BRAIN-NETWORK | Speed hint "2 × 512 trains about 2.3× slower" | pending | planned | Measured throughput per size |
| STA-BRAIN-NETWORK | Episode rules: reset on hit, end after 30 s | pending | planned | Termination rules in the contract |
| STA-BRAIN-NETWORK | Named input column | missing | planned | Named observation layout |
| STA-BRAIN-NETWORK | Hidden layers with sampled neurons and wires | missing | planned | Architecture from the checkpoint; wires today are a decorative pattern |
| STA-BRAIN-NETWORK | Named output column | missing | planned | Actuator labels in action order |
| STA-BRAIN-NETWORK | Live activation glow and hot connections | missing | planned | Activations endpoint (section 5) |
| STA-BRAIN-NETWORK | Body with rays wired into inputs | missing | planned | Draw the project body and anchor wires to sensors |
| STA-BRAIN-NETWORK | Hover a neuron for an explanation | missing | planned | Hover in the renderer; attributions from real rollouts |
| STA-BRAIN-NETWORK | Live, 25k, 312k switch | missing | planned | `getNetwork(checkpoint)` loading that checkpoint |
| STA-BRAIN-NETWORK | Caption with layers, parameters, rate | missing | planned | From the checkpoint and the engine |
| STA-BRAIN-NETWORK | Network and Scene tabs | partial | planned | Scene tab gets no project scene |
| STA-BRAIN-NETWORK | Copilot explains what the brain is thinking | missing | not in spec | A copilot read tool over the network (section 5) |
| STA-BRAIN-NETWORK | Chat answer with neuron check list ("Neuron 2·41 fires when a car is close on the left") (added) | fixture-only | not in spec | `CopilotMessage.checks` (section 4) filled only from `NeuronNote` statistics (section 5) |
| STA-BRAIN-NETWORK | Chips "Make the brain bigger", "Compare with 25k", "What does layer 1 do?" (added) | partial | planned | Chips send their text; routing to MOD-BRAIN-SIZES or a checkpoint switch needs `Suggestion.intent` and the network fields |
| MOD-BRAIN-SIZES | Small, Medium, Large cards | pending | planned | Network templates once `BrainSpec` has a network |
| MOD-BRAIN-SIZES | Mini diagrams | pending | planned | Layer sizes |
| MOD-BRAIN-SIZES | Training time per size | pending | planned | Measured throughput on this CPU |
| MOD-BRAIN-SIZES | "Expected: parks about 55%" | pending | planned | A real source of outcomes or "not run" |
| MOD-BRAIN-SIZES | Recommended | pending | planned | Rule from measured budget |
| MOD-BRAIN-SIZES | Honesty note | pending | planned | Returned with the data |
| MOD-BRAIN-SIZES | Use size | pending | planned | `set_brain` network field |
| MOD-BRAIN-SIZES | Browse community brains | pending | planned | Sprint 13 |
| MOD-BRAIN-SOURCE | Learn, connectome, community options | pending | planned | Brain kinds (Sprint 11) |
| MOD-BRAIN-SOURCE | FlyWire dataset card | pending | planned | Connectome library entries |
| MOD-BRAIN-SOURCE | How it connects, matched share | pending | planned | Mapping report |
| MOD-BRAIN-SOURCE | Load into the fly | pending | planned | Operation to attach a connectome |
| STA-BRAIN-CONNECTOME | Explorer of body parts and brain regions | missing | planned | Connectome objects in the tree |
| STA-BRAIN-CONNECTOME | Inspector wiring and simulation | missing | planned | Connectome spec and LIF settings |
| STA-BRAIN-CONNECTOME | Fly body viewport | missing | planned | Fly body in the library |
| STA-BRAIN-CONNECTOME | "Firing right now" card | missing | planned | LIF simulator streaming region activity; card silently disappears today |
| STA-BRAIN-CONNECTOME | Neurons, Connections, Regions, maps tools | pending | planned | Sprint 11 |
| STA-BRAIN-CONNECTOME | Brain activity panel | pending | planned | `brain.activity` |
| STA-BRAIN-CONNECTOME | Behaviors tab | pending | planned | Behavior detection |
| STA-BRAIN-CONNECTOME | Wiring tab | pending | planned | Mapping report |
| STA-BRAIN-CONNECTOME | Run test and chat | pending | planned | Behavior tests, connectome copilot tools |
| MOD-EXPORT-BRAIN | ONNX, TorchScript, Unity Sentis | pending | planned | Export route (Sprint 12) |
| MOD-EXPORT-BRAIN | Include layout, example, history | pending | planned | Named observation layout, example runtime |
| MOD-EXPORT-BRAIN | File summary | pending | planned | Best checkpoint and sizes |
| MOD-EXPORT-BRAIN | Download | pending | planned | Export job and save dialog |
| MOD-EXPORT-BRAIN | Export from the conversation | missing | planned | Copilot export tool |
| PNL-LEARNED | Checkpoint cards with thumbnails | partial | planned | Cards are real on the working tree; thumbnails are empty boxes |
| PNL-LEARNED | Caption per checkpoint ("hits a car") | partial | planned | Scores are real; behavior words need the coach on frames |
| PNL-LEARNED | Future checkpoints with ETA | missing | planned | ETA from scheduled checkpoints and measured speed |
| PNL-LEARNED | Current checkpoint highlighted | works | planned | Nothing |
| PNL-LEARNED | "● Training" indicator | works | planned | Nothing |
| PNL-LEARNED | Timelapse button | pending | planned | `results.timelapse` |
| PNL-LEARNED | Click a checkpoint to open the timelapse there | pending | planned | Pass the step to SCR-TIMELAPSE |

### Body and motion

| ID | Feature | App today | In spec? | What it needs |
|---|---|---|---|---|
| SCR-BODY | Header with Motion tab, Play to Motion, guide, Train | partial | planned | Motion tab appears with the first clip (Sprint 10) |
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
| TAB-MESH-VIEW | Shaded imported mesh | missing | planned | `mesh-tab.tsx` and imported meshes |
| TAB-MESH-VIEW | Paint skin weights | missing | planned | Skinned import and a paint tool |
| SCR-BODY | Lit, Perspective, "+" view | partial | planned | Lit and split view |
| SCR-BODY | Import tool | pending | planned | Sprint 9 |
| SCR-BODY | Auto-rig tool | pending | planned | Sprint 9 |
| SCR-BODY | Bone, Joint, Motor, Sensor, Mirror, Collider, Weights, Test pose tools | pending | planned | Viewport tool modes emitting edit operations (Sprint 9) |
| TAB-RIG-CHECK | Rig check list with pass and warn | pending | planned | Map the existing `DesignReport` (computed on every revision, ignored by the desktop) and add body checks |
| TAB-RIG-CHECK | Stand-up test | partial | planned | Today only a rest-stability check; a falling humanoid passes |
| TAB-RIG-CHECK | Click a problem to select the part | pending | planned | Object ids on items |
| TAB-RIG-CHECK | Test pose chips | pending | planned | Pose presets in the engine |
| TAB-POSE-TEST | Preset poses applied to the view | pending | planned | Pose application and replay |
| TAB-WEIGHTS | Skin coverage, Auto-fix weights | pending | planned | Skinned import |
| SCR-BODY | Chat auto-rig summary | partial | planned | Copilot import and auto-rig tools |
| SCR-BODY | Chat chips "Make it lighter", "Stiffer knees", "Copy this video" | partial | planned | "Copy this video" needs Sprint 10 |
| STA-BODY-CHECK-FAILED | Amber "Can't train yet" banner | pending | planned | A project state where a failing body can exist: the store rejects any batch whose design report fails |
| STA-BODY-CHECK-FAILED | Failing checks (falls after 1.4 s, knee 0° to 210°) | missing | planned | Stand-up and anatomical range checks; limits capped at ±180° |
| STA-BODY-CHECK-FAILED | "Fix both for me" | pending | planned | `body.fixProblems` |
| STA-BODY-CHECK-FAILED | "Show me" | partial | planned | Select and frame the part |
| STA-BODY-CHECK-FAILED | Training blocked until checks pass | works | built | No visible explanation in Body |
| MOD-AUTO-RIG | Progress dialog | pending | planned | Auto-rig task with progress |
| MOD-AUTO-RIG | Steps read, detect shape, place bones, estimate masses, stand-up test | missing | planned | Mesh reader, shape detection, bone placement, estimates, stand-up test |
| MOD-AUTO-RIG | Run in background, Cancel | pending | planned | Background task and cancel |
| MOD-AUTO-RIG | See result | partial | planned | A real result |
| SCR-MOTION | Motion tab reachable for character projects | partial | planned | `MotionClip` in the contract |
| SCR-MOTION | Train copy, Play | pending | planned | Imitation training |
| SCR-MOTION | Clip explorer (video, pose track, retarget map, exports) | fixture-only | planned | `MotionClip` entities; app shows ordinary objects under "Clip" |
| SCR-MOTION | Retarget inspector | fixture-only | planned | Retarget settings |
| SCR-MOTION | Physics inspector (balance help, joint force) | fixture-only | planned | Imitation task parameters |
| SCR-MOTION | Video, Detect pose, Retarget, Trim, Export tools | pending | planned | Sprint 10 |
| TAB-SIDE-BY-SIDE | Reference video with tracked skeleton | pending | planned | Video playback and keypoints; prototype is a plain surface |
| TAB-SIDE-BY-SIDE | Physics character with match % | pending | planned | Imitation rollouts |
| TAB-OVERLAY | Character over the video | pending | planned | Camera alignment |
| TAB-REFERENCE-ONLY | Video and skeleton only | pending | planned | Video with keypoints |
| PNL-MOTION-COMPARE | Speed 0.5×, 1× and Play | pending | planned | Playback clock |
| TAB-CLIP | Pose thumbnails strip | pending | planned | Pose track |
| TAB-CLIP | Match curve with playhead | pending | planned | Per-frame tracking error |
| TAB-CLIP | Weakest moment callout | pending | planned | Lowest-match detection |
| TAB-CLIP | Select a range to focus training | missing | planned | Range selection |
| TAB-MATCH-SCORE | Match per body part | pending | planned | Per-joint error |
| SCR-MOTION | Chat motion summary | missing | planned | Copilot Motion role |
| SCR-MOTION | "Train the spin" action | pending | planned | Segment-focused training |
| SCR-MOTION | Chips "Slow it down", "Loop it", "Export for Roblox" | missing | not in spec | Retiming, looping and target-rig export |
| MOD-MOTION-VIDEO | Upload, link, webcam | pending | planned | File intake, download, capture |
| MOD-MOTION-VIDEO | File card with facts and people found | pending | planned | Video probing and person detection |
| MOD-MOTION-VIDEO | Trim range | pending | planned | Draggable handles (not draggable even in the prototype) |
| MOD-MOTION-VIDEO | Who to copy | pending | planned | Multi-person tracking |
| MOD-MOTION-VIDEO | Copy onto humanoid or my character | pending | planned | Target body; humanoid template exists |
| MOD-MOTION-VIDEO | "The video stays on your computer" | pending | not in spec | A local pose model, or the note is untrue when frames go to a provider |
| MOD-MOTION-VIDEO | Track the motion | pending | planned | `POST /motion/clips` |
| MOD-MOTION-TRACKING | Preview with frame counter | pending | planned | Streaming keypoints |
| MOD-MOTION-TRACKING | Progress bar | pending | planned | Progress events |
| MOD-MOTION-TRACKING | Steps find, track, map, physics check | pending | planned | Pose pipeline and retargeting |
| MOD-MOTION-TRACKING | Run in background, See result | partial | planned | Background task |
| MOD-MOTION-TRAIN | Intro | pending | planned | Imitation family |
| MOD-MOTION-TRAIN | Practice steps and copies | pending | planned | Fields are local state never sent |
| MOD-MOTION-TRAIN | Focus on the spin or whole clip | pending | planned | Segment-weighted resets |
| MOD-MOTION-TRAIN | Estimate | pending | planned | Measured throughput |
| MOD-MOTION-TRAIN | Start training | pending | planned | Imitation run |
| STA-MOTION-TRAINING | Status card with % and time left | pending | planned | Live imitation progress |
| STA-MOTION-TRAINING | Match before and now | pending | planned | Evaluation at checkpoints |
| STA-MOTION-TRAINING | Hard moment "6 of 10" | pending | planned | Per-segment evaluation |
| STA-MOTION-TRAINING | Watch, Export now | pending | planned | Live replay, export |
| STA-MOTION-TRAINING | Stop | partial | planned | An imitation run to stop |
| MOD-EXPORT-ANIMATION | glTF, FBX, BVH | pending | planned | `motion/export.py` |
| MOD-EXPORT-ANIMATION | Use the physics result | pending | planned | Export from the rollout |
| MOD-EXPORT-ANIMATION | Include root motion | pending | planned | Root baking |
| MOD-EXPORT-ANIMATION | Loop the clip | pending | not in spec | Loop blending |
| MOD-EXPORT-ANIMATION | Target rig "Roblox · R15 · 30 fps" | pending | not in spec | Named target rigs and resampling |
| MOD-EXPORT-ANIMATION | File summary | pending | planned | Export metadata |
| MOD-EXPORT-ANIMATION | Download | pending | planned | Export endpoint and save dialog |

### Train and results

| ID | Feature | App today | In spec? | What it needs |
|---|---|---|---|---|
| SCR-TRAIN | Train before a run, Stop while training | works | built | Nothing |
| SCR-TRAIN | Run inspector: method, start, budget locked while running | fixture-only | not in spec | Inspector built from `RunStatus` and `RunConfig`; app shows the scene selection |
| SCR-TRAIN | Inspector Autopilot section with tries left | fixture-only | planned | Read `AutopilotStatus` into the inspector |
| SCR-TRAIN | Train tool | works | built | Nothing |
| SCR-TRAIN | Pause tool | pending | planned | Resumable runs; `PENDING.md` says Sprint 8 but the roadmap's Sprint 8 does not list it |
| SCR-TRAIN | Stop tool | works | built | Nothing |
| SCR-TRAIN | Timelapse tool | pending | planned | `results.timelapse` |
| SCR-TRAIN | Autopilot tool | works | planned | Wired to `/projects/{id}/autopilot` on the working tree |
| SCR-TRAIN | Chat run-progress card with goals | fixture-only | not in spec | Run goals and a message kind |
| SCR-TRAIN | Coach milestones and observations during the run | fixture-only | planned | Coach messages at checkpoints for normal runs; milestone markers; live refresh |
| SCR-TRAIN | "Next run, if you agree" card | partial | planned | Map a diagnosis proposal onto the plan card; today a normal answer plus proposal card |
| SCR-TRAIN | "Train it, and tell me how it goes" | works | built | The "tell me" half needs the coach commentary |
| SCR-TRAIN | Chips "Why does it scrape?", "Compare with run 2", "Stop at 500k" | partial | planned | Routes are fixture-only |
| SCR-TRAIN | Stop at a chosen step | missing | not in spec | Scheduled stop or a budget change in `StartRun` |
| SCR-TRAIN | Composer "Autopilot · 5 tries" | partial | planned | Show the iteration budget |
| TAB-LIVE-TRAINING | Every copy side by side from live snapshots | works | built | Nothing |
| TAB-LIVE-TRAINING | Checkpoint card | works | built | Generic "Success 71% · fails 38%" instead of task words |
| TAB-LIVE-TRAINING | Scrubber over the latest episode with failure marker | fixture-only | not in spec | Fill `LiveView.episode` from the latest rollout and `touched_at` |
| TAB-LIVE-TRAINING | Pick one copy to follow | missing | not in spec | Copy selection and follow camera |
| TAB-LIVE-TRAINING | Connecting, no run, ended, reconnect states | works | built | Nothing |
| TAB-LIVE-TRAINING | Lit, Perspective, "+" | pending | not in spec | Viewport options |
| TAB-REPLAY | Choose a checkpoint's episode | works | built | Nothing |
| TAB-REPLAY | Play, scrub, speed in the frozen scene | works | built | Nothing |
| TAB-REPLAY | Card with result and outcome | works | built | Nothing |
| PNL-RUNS | Runs with status and result line | works | built | Generic wording |
| PNL-RUNS | Select a run switches every panel | works | built | Nothing |
| PNL-RUNS | "+" new run | works | built | Nothing |
| PNL-RUNS | Paused status | pending | planned | Pause and resume |
| PNL-METRICS | Mean reward chart with change | works | built | Nothing |
| PNL-METRICS | Collision rate with "high" chip | partial | built | Severity judgment and task naming |
| PNL-METRICS | Extra series | works | built | Nothing |
| PNL-METRICS | Reward breakdown | works | built | Nothing |
| PNL-METRICS | Weight change on a term ("0.2 → 1.0") | missing | not in spec | Diff of reward weights against the previous revision |
| PNL-METRICS | Steps done and speed | works | built | Nothing |
| PNL-METRICS | Hover for exact values | partial | built | A real tooltip; today native SVG titles |
| PNL-METRICS | Console | partial | built | Load earlier `worker.log` lines; today only streamed lines, reset on reconnect |
| PNL-METRICS | Copy and filter the console | partial | not in spec | Filter field and copy action |
| MOD-START-TRAINING | Intro | works | built | Nothing |
| MOD-START-TRAINING | Practice steps | works | built | Nothing |
| MOD-START-TRAINING | Parallel copies | works | built | Nothing |
| MOD-START-TRAINING | Estimated time | partial | built | Measured throughput; today a constant |
| MOD-START-TRAINING | CPU threads used | works | built | Nothing |
| MOD-START-TRAINING | "Let the copilot coach" switch | broken | planned | Never sent: `startRequest` sends only steps and copies and `StartRun` has no coach field |
| MOD-START-TRAINING | Start run | works | built | Nothing |
| MOD-STOP-RUN | Where the run is and its best result | works | built | Nothing |
| MOD-STOP-RUN | What is kept | works | built | Nothing |
| MOD-STOP-RUN | Keep training | works | built | Nothing |
| MOD-STOP-RUN | Pause | pending | planned | Resumable runs |
| MOD-STOP-RUN | Stop and go to Results | works | built | Nothing |
| STA-TRAIN-FAILED | Card appears when a run stops by itself | works | built | Nothing |
| STA-TRAIN-FAILED | Reason and what is safe | works | built | Nothing |
| STA-TRAIN-FAILED | Technical details | works | built | Nothing |
| STA-TRAIN-FAILED | "Fix and restart" | partial | not in spec | A diagnosis for crashed runs; today it opens Start training |
| STA-TRAIN-FAILED | "View log" | partial | built | Open the Console with `worker.log` |
| STA-TRAIN-FAILED | "Back to run 3" | works | planned | Results now wired on the working tree |
| MOD-AUTOPILOT | Intro | works | planned | Wired on the working tree |
| MOD-AUTOPILOT | Off, Ask first, Fix on its own | works | planned | Wired on the working tree |
| MOD-AUTOPILOT | Fix limit per run | works | planned | Goal, iterations and minutes are exposed |
| MOD-AUTOPILOT | Status while it runs and Stop | works | planned | (corrected) `autopilot-run.tsx` shows a status pill, detail line, timestamped log and Stop autopilot from engine progress; limits lock while active |
| MOD-AUTOPILOT | Start, stop, check by asking the copilot | works | planned | Nothing |
| SCR-RESULTS | Runs with compare checkboxes | works | planned | Compare selection lives in app memory |
| SCR-RESULTS | Best brains | works | planned | Export needs Sprint 12 |
| SCR-RESULTS | Summary "Best brain so far" | works | planned | Build is Sprint 12 |
| SCR-RESULTS | Notes | partial | planned | Stored in this browser's `localStorage`, invisible to the engine and the copilot; needs a contract and engine storage |
| TAB-COMPARE | Two runs side by side with scores | partial | planned | Scores and seed basis are real; the two views are empty surfaces |
| TAB-COMPARE | Play both together | missing | planned | Synced rollout players |
| TAB-COMPARE | Seed basis chip | works | planned | Fixed on the working tree: "Same seeds", "Different seeds" or "Seeds not recorded" from real rollouts |
| SCR-RESULTS | "Is run 3 actually better?" in chat | works | planned | Nothing |
| SCR-RESULTS | Chips Show where it fails, Share, Train | partial | planned | Share is Sprint 13 |
| PNL-FAILURES | Failure groups with coverage | works | planned | Wired to the coach on the working tree; thumbnails need frames |
| PNL-FAILURES | Select a group to replay one of its episodes | partial | planned | Only the first evaluation episode is recorded as a rollout |
| PNL-FAILURES | All test runs | pending | planned | Route for `episodes.json` and per-episode rollouts |
| STA-RESULTS-FAILURES | Scores summary with seed note | works | planned | Nothing |
| TAB-WHERE-IT-FAILS | Replay of a failing test run | partial | planned | Per-episode rollouts and a player in this tab |
| TAB-WHERE-IT-FAILS | Vision annotations (circle, path, explanation card) | pending | not in spec | Annotation geometry and time in `Diagnosis` evidence |
| TAB-WHERE-IT-FAILS | "Test run 17 of 23" step-through | pending | planned | Per-episode rollouts |
| STA-RESULTS-FAILURES | Chat diagnosis with proposed changes | partial | planned | Runs only when asked; not linked to the panels |
| STA-RESULTS-FAILURES | "Apply as revision 14" | partial | planned | Apply works; Brain is mostly pending |
| STA-RESULTS-REFERENCE | Behavior tests list | pending | planned | Sprint 11 |
| STA-RESULTS-REFERENCE | Recordings | pending | planned | Sprint 11 |
| STA-RESULTS-REFERENCE | Paths of real flies and your fly | pending | planned | Sprint 11 |
| STA-RESULTS-REFERENCE | Behavior match table, Neurons tab | pending | planned | Sprint 11 |
| STA-RESULTS-REFERENCE | Overall match and Run test | pending | planned | Sprint 11 |
| SCR-TIMELAPSE | Full-screen replay | pending | planned | Play checkpoint rollouts in sequence |
| SCR-TIMELAPSE | Title with real metrics | pending | planned | Map checkpoints |
| SCR-TIMELAPSE | Checkpoint strip | pending | planned | Thumbnails from rendered frames |
| SCR-TIMELAPSE | Play bar | pending | planned | A player; Play has no handler even in the prototype |
| SCR-TIMELAPSE | Export video | missing | planned | No code encodes video anywhere |
| SCR-TIMELAPSE | Cinematic camera and overlays | missing | planned | Presentation camera |
| SCR-TIMELAPSE | Exit returns to Train | works | planned | Always Train, whatever opened it |
| TAB-TIMELAPSE | Results tab opens the presentation | pending | planned | The timelapse |

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
| TAB-PLAY | Sensor rays and goal spot in the view | partial | not in spec | Ray hit points in `PlayFrame` and an overlay; zones are drawn |
| TAB-AGENT-VIEW | What the agent's camera sees | missing | planned | Camera sensor |
| TAB-AGENT-VIEW | Game view through the project camera | missing | planned | Second view bound to the camera |
| PNL-PLAY-TOOLS | Move | works | built | Nothing |
| PNL-PLAY-TOOLS | Push | works | built | Nothing |
| PNL-PLAY-TOOLS | Add object | partial | built | Always a box; food pieces in Sprint 11 |
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
| PNL-PLAY-DECISIONS | "Use another brain" | pending | planned | Brain selection on the Play socket |
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
| SCR-BUILD | Header with Publish | pending | planned | Sprint 13 |
| PNL-BUILD-TARGETS | Targets with live facts | pending | planned | `build.targets` (Sprint 12) |
| PNL-BUILD-TARGETS | Each target opens its view | partial | planned | Rows never render until targets exist |
| TAB-SHARE-TO-COMMUNITY | Title and description | pending | planned | `publish.page` |
| TAB-SHARE-TO-COMMUNITY | Permission toggles | pending | planned | `publish.page-edit` |
| TAB-SHARE-TO-COMMUNITY | Included list | pending | planned | Bundles |
| TAB-SHARE-TO-COMMUNITY | Preview card | pending | planned | Thumbnails |
| TAB-SHARE-TO-COMMUNITY | Save draft | pending | planned | `publish.save-draft` |
| TAB-SHARE-TO-COMMUNITY | Publish to community | pending | planned | `publish.send` |
| SCR-BUILD | Export brain | pending | planned | Export module (Sprint 12) |
| SCR-BUILD | Use in a game | pending | planned | Game-engine format |
| SCR-BUILD | URDF and MJCF export | missing | planned | No target kind for it |
| SCR-BUILD | Chat explains what it prepared | fixture-only | planned | Builder role and tools |
| STA-BUILD-HARDWARE | Guided steps | pending | planned | `build.hardware` |
| STA-BUILD-HARDWARE | Connected device line | pending | planned | Device discovery |
| STA-BUILD-HARDWARE | Live calibration | pending | planned | Runtime streaming |
| STA-BUILD-HARDWARE | Problem card | pending | planned | Diagnosis from readings |
| STA-BUILD-HARDWARE | Recheck | pending | planned | `build.hardware-recheck` |
| STA-BUILD-HARDWARE | Skip this sensor | pending | planned | Input masking |
| STA-BUILD-HARDWARE | Test drive | missing | planned | Remote drive with limits |
| STA-BUILD-HARDWARE | Load the brain | missing | planned | Runtime and ONNX deploy |
| STA-BUILD-HARDWARE | 3D preview | missing | planned | Empty placeholder today |
| STA-BUILD-HARDWARE | Safety rules | pending | planned | Runtime limits |
| STA-BUILD-HARDWARE | Parts list with total | pending | planned | `HardwareProfile` and priced components |
| STA-BUILD-HARDWARE | Chat helps with hardware | fixture-only | planned | Builder role |
| SCR-BUILD | Export animation target | pending | planned | Sprint 10 |

## 3. Not in the spec yet

Each row proposes where the feature belongs and the work by layer. "Contract" means `services/engine/src/icarus/contracts/`, landed first as its own task.

| Feature | Proposed home | Contract | Engine | Desktop |
|---|---|---|---|---|
| Home hero 3D scene | Sprint 14 parity pass | None | Serve a template scene (exists) | Render a real template scene behind the hero |
| Project status pills beyond training (failed, published, edited yesterday) | Sprint 7 follow-up | `ProjectSummary.updated_at`, last run state | Fill them in `GET /projects` | Map in `projectView` |
| Projects filter Published | Sprint 13 | Publish state on the summary | From the community client | Filter |
| Open a project in its last workspace | Sprint 7 follow-up | None (desktop-local is fine) | None | Persist per project id |
| Ctrl/Cmd+O | Next desktop fix pass | None | None | Global shortcut next to undo/redo |
| "Project settings" item | Next desktop fix pass | None | None | Rename to "Training and hardware settings" or remove |
| Import with no open project | Sprint 9 | None | Create a project from the import | Route through project creation |
| Editable projects folder | Next desktop fix pass | None | None | Read-only row with "Open folder" |
| Keep checkpoints policy | Sprint 8 | `TrainingSettings.keep_checkpoints` | Retention in the run store | Choice row |
| System tray notifications | Sprint 13 (local half could go in Sprint 7) | None | Run events (exist) | Main-process `Notification` |
| Engine down copy about runs | Next desktop fix pass | None | None, unless runs become resumable | Say the run stops and keeps its last checkpoint |
| Training copies grid in the Scene view | Sprint 8 | None | `GET /projects/{id}/copies` (exists) | Draw copies around the edited world |
| Explorer reparent by drag | Sprint 8 editor pass | None | `reparent_object` exists | Drag and drop |
| Explorer right-click menu | Sprint 8 editor pass | None | Operations exist | Context menu with "Ask the copilot" |
| "Add an agent" row | Sprint 8 editor pass | None | None | Action row when no body |
| Inspector Training section | Sprint 8 | None | None | Section built from `brain.copies` and Randomize |
| Hover a property highlights its target | Sprint 14 | Target geom ids per property | Map property to geoms | Highlight |
| Property right-click menu | Sprint 8 editor pass | None | None | Menu |
| Sky clouds, time of day, shadows | Sprint 8 library pass | New sky and light properties | Compiler and renderer | Inspector rows come for free |
| Part tool | Sprint 8 editor pass | None | Primitive pieces | Tool action |
| Library environments, agents and bodies | Sprint 8 library pass | Piece kinds | Pieces from templates | Library shelf |
| New-project chat greeting with routed chips | Sprint 7 copilot pass | See section 4 | Opener message | Render |
| Edit a proposal by hand | Sprint 8 | Proposed values per property | Open a proposal as a draft | `editable: true` path |
| Ideas chat and "Show 3 more" | Sprint 8 | Conversation keyed by idea set | Architect regeneration | Chat on SCR-IDEAS |
| Vary time of day and wind per copy | Sprint 12 (sim-to-real presets) | Variation kinds | `sim/variation.py` | Popover rows |
| Reward term as a component, wind and water components | Not recommended; rewards stay task terms | None | None | Remove from the picker design |
| Sensor rays in the editor and in Play | Sprint 8 (Senses tool) | Ray origins and hits in `SceneDescription` and `PlayFrame` | Rangefinder hits | Overlay |
| Terrain shaping, Paint, Props placement, Camera tool | Sprint 11 or 14 | Heightfield and camera components | Compiler | Tool modes |
| Lit modes and split view | Sprint 14 | None | None | Viewport options |
| Library drag and drop | Sprint 8 editor pass | Drop position on `create_object` (exists) | None | Drag |
| Copilot title, check list, run progress, milestone, plan, welcome | Sprint 7 copilot pass | Section 4 | Section 4 | Render existing components |
| Suggestion intents | Sprint 7 copilot pass | Section 4 | Section 4 | Use `suggestionRoutes` |
| Keep chatting while building | Sprint 8 | None | Queue edits onto a build's project | Chat during build |
| Add a workspace from the header "+" (added) | Drop from the design unless a real meaning is found | None | None | None, or a "+" that opens a workspace picker |
| Neuron check list in the brain chat (added) | Sprint 8 | `CopilotMessage.checks` (section 4) | Fill from `NeuronNote` (section 5) | Render existing check list |
| Chat clear and export | Sprint 7 copilot pass | None | `DELETE` and export routes on the conversation | "⋯" menu |
| Copilot explains the brain | Sprint 8 | Network read types (section 5) | Copilot tool `inspect_brain` | None |
| Motor speed | Sprint 9 | Motor `max_velocity` | Compiler | Inspector row |
| Motion retiming, looping, Roblox R15 target | Sprint 10 if kept; otherwise drop from the design | Export options | `motion/export.py` | Dialog fields |
| "The video stays on your computer" | Sprint 10 decision | None | Local pose model, or change the copy | Copy |
| Run inspector (method, start, budget, locks) | Sprint 7 | None | None | Inspector from `RunStatus` and `RunConfig` |
| Run goals in the progress card | Sprint 8 (with curriculum) | Goals or curriculum stages | Stage progress per run | Progress card |
| Stop at a chosen step | Sprint 8 | `PATCH /runs/{id}` with `total_steps` | Worker reads a new budget | Chip action |
| Live-episode scrubber | Sprint 7 follow-up | None | Latest rollout (exists) | Fill `LiveView.episode` |
| Pick a copy to follow | Sprint 14 | None | None | Selection and camera |
| Reward weight change on breakdown | Sprint 8 | None | Revision diff (exists in comparisons) | Show previous weight |
| Console copy and filter | Next desktop fix pass | None | None | Filter and copy |
| Fix and restart for crashed runs | Sprint 7 follow-up | None | Coach diagnosis of worker failures | Card action |
| Vision annotations over replays | Sprint 8 | `DiagnosisEvidence` with time, shape (circle, path) and world coordinates | Coach writes them from contacts and poses | Overlay |
| Behavior narration in Play (status card and events) | Sprint 8 | `PlayEvent` kinds for behavior | Detectors over senses and actions | Render |
| Copilot sees the live Play session and drives Play tools | Sprint 8 | `SendMessage.play` (latest frame summary and events) | Copilot Play tool | Pass context |
| Turn a Play surprise into a training change | Sprint 8 | None | Proposal of a variation edit | Route to training copies |

## 4. Copilot messages and bubbles

The engine conversation today is `Conversation { messages: CopilotMessage[], suggestions: str[], autonomy }`. `CopilotMessage` has `role: "user" | "copilot"`, `text`, `proposal_id`, `thinking`, `attachments`, `actions: ChatAction[]` and `steps: AgentStep[]`. `ChatAction.kind` is `navigate | train | apply | discard | send`. The desktop already has components for every kind below; `copilot-views.ts` only ever produces `user`, `copilot` and `proposal`.

| Kind in the design | Where | Engine can produce it today? | Contract addition |
|---|---|---|---|
| User bubble | Every workspace | Yes | None |
| Copilot answer (markdown) | Every workspace | Yes | None |
| Answer title ("Hi, what should we build?") | STA-WORLD-EMPTY | No | `CopilotMessage.title: str \| None = Field(default=None, max_length=80)` |
| Check list (green check, amber "!") | SCR-WORLD, STA-BODY-CHECK-FAILED, SCR-RESULTS, SCR-MOTION, SCR-BUILD | No (a markdown list renders as bullets) | `class CheckItem(_Model): text: str = Field(max_length=200); tone: Literal["ok", "warn"]` and `CopilotMessage.checks: list[CheckItem] = []`; add `checks` to the `answer` tool schema so the model fills it |
| Inline action buttons | Several | Partly: Apply, Discard, Train now, coach and autopilot actions | Add `ChatAction.kind` values `"show"` (target: object id to select and frame) and `"dismiss"` (closes the actions) |
| Proposal card | World and every workspace | Yes (`proposal_id`) | For "Edit by hand": `CopilotProposal.editable: bool` once proposed values per property exist |
| Build progress card | STA-WORLD-BUILDING | Real (`GET /builds/{id}`) but not in the conversation | `CopilotMessage.build_id: str \| None = None`; the engine posts one message when a build starts and the desktop polls the build as it does today |
| Run progress card with goals | SCR-TRAIN | No | `class GoalProgress(_Model): text: str; state: Literal["done", "running", "todo"]`, `class RunCard(_Model): run_id: str; goals: list[GoalProgress] = []`, and `CopilotMessage.run: RunCard \| None = None`. The bar, percent and "6 min ago" come from `RunStatus` on the desktop, not the message. Goals stay empty until curriculum stages or task milestones exist |
| Milestone divider ("100k steps") | SCR-TRAIN | No | `CopilotMessage.run_step: int \| None = Field(default=None, ge=0)` set on coach messages; the desktop inserts a divider when `run_step` changes |
| Coach observation at a checkpoint | SCR-TRAIN | Only on request (`POST /runs/{id}/diagnosis`) or under autopilot | No contract change; the engine coach must also comment at checkpoints of ordinary runs when the start request asks for it: `StartRun.coach: bool = False` (also fixes the broken "Let the copilot coach" switch) |
| "Next run, if you agree" plan card | SCR-TRAIN | Partly: a diagnosis with a proposal arrives as an answer plus a proposal card | `class PlanItem(_Model): mark: Literal["add", "change"]; label: str; detail: str` and `CopilotMessage.plan: list[PlanItem] = []`, filled from the diagnosis proposal's changes; the primary action is a new `ChatAction.kind` `"apply_and_train"` |
| Welcome with starter chips | STA-WORLD-EMPTY | No | No new field: the engine posts an opener `CopilotMessage` (with `title`) when a conversation is created empty, and returns starter suggestions |
| Suggestion chips | Every workspace | Yes, as plain text | Change `Conversation.suggestions: list[str]` to `list[Suggestion]` with `class Suggestion(_Model): text: str = Field(max_length=60); intent: SuggestionIntent = "ask"`, where `SuggestionIntent` is the same literal union as `copilot-port.ts`; the model chooses an intent from a closed list and the desktop maps it through each workspace's `suggestionRoutes` |
| Autonomy note ("Autopilot · 5 tries") | SCR-TRAIN, MOD-AUTOPILOT | Data exists in `AutopilotStatus` | None; the desktop reads `/projects/{id}/autopilot` |
| Live steps while working | Every workspace | Yes, through `/events` (`turn_started`, `step`, `view_taken`, `turn_finished`) | None; the desktop subscribes to `/events` and also refreshes the conversation on `turn_finished`, which makes coach and autopilot messages appear live |
| What the copilot did, What it saw, attachments | Not in the design | Yes | None |

## 5. Neurons and the brain view

**What the design shows.** STA-BRAIN-NETWORK draws the body on the left with its sensor rays wired into a column of 11 named inputs (Front L, Front, Front R, Side L/R, Rear L/R, Speed, Steering, Goal dir, Goal dist), two hidden layers of 256 neurons drawn as sampled columns, and 3 named outputs (Steer, Throttle, Brake). Neurons glow by activation (hot red, active white, idle grey), the connections carrying the current decision are drawn red, a hovered neuron explains itself ("Neuron 2·41: fires when a car is close on the left"), a switch picks Live or a saved checkpoint (25k, 312k), and a caption reads "2 layers × 256 neurons · 70k parameters · 25 decisions per second". SCR-BRAIN adds a "What the brain sees now" card with live input bars and the decision in words; MOD-BRAIN-SIZES offers sizes with measured training time.

**What exists.** Every Brain port method is `pending` (Sprint 8, connectome Sprint 11). The policy is SB3 PPO `MlpPolicy` with `net_arch {pi: (256, 256), vf: (256, 256)}`, Tanh and learning rate 3e-4, hardcoded in `training/worker.py`. `BrainSpec` has only `template`, `copies` and `seed`. The control rate is the constant `CONTROL_PERIOD = 0.05` (20 Hz). `sim/model_state.observation` concatenates sensors and task state with no names. `sim/policy.py` `CheckpointPolicy` only exposes `predict()`. Checkpoints are listed at `/runs/{id}/checkpoints` and stored as `checkpoints/<step>.zip`. Play already runs the real checkpoint on MuJoCo observations at about 30 frames per second.

**Engine data needed, in order:**

1. **Named observation layout.** `class ObservationSlot(_Model): index: int; label: str; source: str; unit: str \| None; low: float \| None; high: float \| None` and `GET /projects/{id}/brain/inputs` returning slots in the exact order the policy sees them, built by the same code that builds the observation. This also feeds TAB-WHAT-IT-SEES, export's sensor layout and hardware calibration.
2. **Action layout.** The same for actuators (label, unit, control range) in action order. Play's `PlayReading` already labels them; reuse that code.
3. **Policy architecture in the contract.** `BrainSpec.network: NetworkSpec` (`layers: list[int]`, `activation: Literal["tanh", "relu"]`), `BrainSpec.algorithm: Literal["ppo"]` and `BrainSpec.learning_rate`, frozen per run, read by the worker instead of `PpoSettings`. Warm start must refuse a different shape. A read model `BrainArchitecture { layers, activation, parameters }` comes from the checkpoint itself so an old run reports what it really trained.
4. **Activations endpoint.** `GET /runs/{id}/checkpoints/{step}/activations` returning `NetworkActivations { inputs: list[float], layers: list[list[float]], outputs: list[float], contributions: list[Link] }` for one observation, computed with forward hooks on `mlp_extractor.policy_net` and `action_net`. `Link { from_layer, from_index, to_index, weight_times_activation }` keeps only the top contributions, so "hot connections" are real. The observation comes from a seeded reset of the frozen revision or from an evaluation rollout frame, never invented.
5. **Live versus checkpoint.** Live means the Play session: add an optional `activations` field to `PlayFrame`, sent only when the brain view subscribes (a `WatchBrain` command), using the same checkpoint Play loaded. A checkpoint means the endpoint above with a chosen evaluation frame index. The switch lists real checkpoints.
6. **Neuron explanations.** Computed offline per checkpoint: correlate each hidden neuron's activation with each named input over the evaluation rollouts and store the strongest relations (`NeuronNote { layer, index, input_label, correlation, sample_count }`). The copilot may phrase the sentence, but only from that statistic; with no rollouts it says "not run".
7. **Measured budgets.** Steps per second per network size on this machine, from past runs' metrics or a short benchmark, for the speed hint and MOD-BRAIN-SIZES. "Expected success" needs real outcomes from similar runs or must say "not run".
8. **Copilot access.** A read tool (for example `inspect_brain`) returning the layout, architecture, the latest activations and neuron notes, so "What is the brain thinking right now?" is answered from data. No plan names this tool yet.

**Desktop fixes independent of the engine.** `ReadingsCard` and `NetworkDiagram` return `null` when their query fails, so in the app the card and the whole diagram silently disappear; they should show the not-available-yet state. The diagram's SVG is `pointer-events-none` and its background wires use a `(i + j) % 4` pattern, so hover and real wiring both need renderer work.

## 6. Top 15 gaps for a beginner

Ranked by how much each one confuses or blocks someone using the app for the first time.

1. **No welcome in an empty chat.** A new project opens with an empty conversation and no starter chips, and the first-launch Home card with the tour is never shown because the app always starts on `SCR-HOME`. Add the opener message and starter suggestions (section 4), and route to `STA-HOME-EMPTY` when there are no projects.
2. **Suggestion chips never navigate.** "Show where it fails" or "Make the brain bigger" only send text. Add `Suggestion.intent` so chips take people to the right screen.
3. **The coach is silent during training.** The Train chat has no checkpoint commentary unless the autopilot runs, and new copilot messages appear only on the next refetch. Send `StartRun.coach`, comment at checkpoints, and subscribe the chat to `/events`.
4. **"Let the copilot coach" does nothing.** The switch is shown on by intent but never sent. Fix together with item 3.
5. **Brain workspace looks empty.** Every panel is pending, and the readings card and network diagram vanish without a message. Show the pending states now, then build the reward cards first: the data already exists and `set_reward_term` already works.
6. **No check lists in answers.** Body checks, results and builds read as long paragraphs. Add `CopilotMessage.checks`.
7. **Engine down page says runs "pause".** It is untrue and a beginner will wait for a run that ended. Fix the copy.
8. **Projects open in World and filters look broken.** "Published" is always empty, and failed runs never show "Needs attention". Add last workspace and real states.
9. **Library has five props and blank thumbnails.** A beginner cannot find a car, a lot or a body to drop in. Reuse the thumbnail renderer and add template-based pieces.
10. **Results notes live in the browser.** They vanish with site data and the copilot cannot read them. Store them on the engine.
11. **Duplicate and delete dialogs overpromise.** "Trained brains" and "runs" switches are ignored and deleted projects leave runs on disk. Make duplicate honor the switches and delete offer to remove runs.
12. **Ideas screen chat says "No project open yet".** The first conversation a beginner has after typing on Home cannot talk. Give the idea set its own conversation.
13. **No sensor rays anywhere in the editor.** The design teaches what a body senses by drawing rays; the app never does. Add ray hits to the scene and Play frames.
14. **Live training cannot be scrubbed and copies cannot be followed.** A beginner sees 16 small copies and no way to watch the moment it fails. Fill the episode scrubber from the latest rollout.
15. **Ctrl O and Project settings mislead.** Small, but they make the app feel broken on first exploration. Bind the shortcut and relabel the item.
