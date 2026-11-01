# UI sprints · every screen before its logic

Builds every catalog ID in `docs/design/screens.md` as a real, navigable screen wired through ports ([ADR 003](../decisions/003-screens-before-logic.md)). Logic that does not exist yet is a `pending(...)` port function listed in `apps/desktop/PENDING.md`; the prototype (`pnpm prototype`) runs every flow on sample data. The roadmap sprints (2–14) then replace pending functions with engine calls without touching the screens.

## Done means

For every ID in a UI sprint:

- Registered in its feature's `catalog.tsx`, reachable from every control the inventory says leads to it.
- Parity against `docs/design/reference/<ID>.png` at or under `maxDiff` (target 0.03, at most 0.05; 3D viewport and thumbnails are masked).
- Every inventory control exists with its destination (`catalog.e2e.ts`), every destination works when clicked (`flows.e2e.ts`), every control has hover, press and focus, every field takes typing (`interaction.e2e.ts`).
- Data and actions only through ports; loading, empty, error and not-available states handled; no sample data in components.
- `pnpm check` and `pnpm test:design` pass; `PENDING.md` regenerated.

## Sprints

| Sprint | Scope | IDs | Folders |
|---|---|---|---|
| U0 · Foundation | Navigation, ports, pending registry, UI kit, headers, checks over the registry | `HDR-LAUNCHER`, `HDR-WORKSPACE`, `SYS-ENGINE-DOWN` | `app/`, `ui/`, `ports/projects-*` |
| U1 · Launcher and account | Home, projects, community, profile, sign-in, notifications, settings, moderation | `SCR-HOME`, `STA-HOME-EMPTY`, `SCR-PROJECTS`, `SCR-COMMUNITY`, `SCR-CREATION`, `MOD-REPORT`, `SCR-PROFILE`, `MOD-SIGN-IN`, `POP-NOTIFICATIONS`, `SCR-SETTINGS-MODELS`, `SCR-SETTINGS-PROFILE`, `SCR-SETTINGS-PRIVACY`, `SCR-SETTINGS-TRAINING`, `SCR-SETTINGS-NOTIFICATIONS`, `SCR-MODERATION` | `features/home`, `features/projects`, `features/community`, `features/account`, `features/settings`, `features/moderation` |
| U2 · Editor core, World and copilot | Explorer, inspector with the 12 property types, viewport frame and toolbar, library, chat, ideas, the World workspace and its states | `SCR-WORLD`, `STA-WORLD-EMPTY`, `STA-WORLD-EMPTY-NOGUIDE`, `STA-WORLD-BUILDING`, `STA-WORLD-PROPOSAL`, `SCR-IDEAS`, `REF-PROPERTY-TYPES`, `POP-ADD-COMPONENT`, `POP-TRAINING-COPIES` | `editor/`, `features/world-studio`, `features/copilot`, `features/ideas` |
| U3 · Project actions | Project menu and its dialogs | `POP-PROJECT-MENU`, `MOD-RENAME`, `MOD-DUPLICATE`, `MOD-HISTORY`, `MOD-SHARE`, `MOD-DELETE-PROJECT` | `features/project` |
| U4 · Play, train and results | Play mode, training and its dialogs, results and timelapse | `SCR-PLAY`, `SCR-PLAY.b`, `MOD-START-TRAINING`, `SCR-TRAIN`, `MOD-STOP-RUN`, `MOD-AUTOPILOT`, `STA-TRAIN-FAILED`, `SCR-TIMELAPSE`, `SCR-RESULTS`, `STA-RESULTS-FAILURES`, `STA-RESULTS-REFERENCE` | `features/play`, `features/train`, `features/results` |
| U5 · Brain, body and motion | Brain workspace and sources, body and import, motion from video | `SCR-BRAIN`, `MOD-BRAIN-SIZES`, `STA-BRAIN-NETWORK`, `MOD-BRAIN-SOURCE`, `STA-BRAIN-CONNECTOME`, `SCR-BODY`, `MOD-IMPORT`, `MOD-AUTO-RIG`, `STA-BODY-CHECK-FAILED`, `SCR-MOTION`, `MOD-MOTION-VIDEO`, `MOD-MOTION-TRACKING`, `MOD-MOTION-TRAIN`, `STA-MOTION-TRAINING`, `MOD-EXPORT-ANIMATION` | `features/brain-studio`, `features/body-studio`, `features/motion-studio` |
| U6 · Build and publish | Build workspace, hardware, exports and publishing | `SCR-BUILD`, `STA-BUILD-HARDWARE`, `MOD-EXPORT-BRAIN`, `MOD-PUBLISH`, `MOD-PUBLISHED` | `features/build-studio` |

## Order

1. U0 alone (everything else builds on it).
2. U1 and U2 in parallel: U1 needs only the launcher shell; U2 builds the panels every workspace reuses.
3. U3, U4, U5 and U6 in parallel once U2 is merged.
4. After each merge: `pnpm check`, `pnpm test:design`, `pnpm -F desktop gen:pending`.

Each UI sprint runs in its own worktree and branch off `feat/desktop-ui-screens` and only touches its folders. New shared building blocks are new files in `ui/` or `ports/`; changing an existing shared file is reported and done during the merge.
