# AGENTS.md — apps/desktop (Electron + React + R3F)

Inherits everything from `/AGENTS.md`. This file covers only what is specific to the desktop app.

## Stack and commands

Electron · electron-vite · React · strict TypeScript · React Three Fiber + drei · Tailwind + shadcn/ui · TanStack Query · Zustand · Recharts · Biome · Vitest.

| What | Command |
|---|---|
| Dev (with engine) | `pnpm dev` (repo root) |
| Typecheck | `pnpm -F desktop typecheck` |
| Tests | `pnpm -F desktop test` |
| Add a shadcn component | `pnpm -F desktop dlx shadcn@latest add <name>` |

## Boundaries

- `src/main/`: window, engine spawn and supervision, passing the port to preload. No product logic.
- `src/preload/`: minimal API through `contextBridge`. Always `contextIsolation: true`, `nodeIntegration: false`.
- `src/renderer/engine-client/`: the **only** place that calls `fetch`/SSE against the engine. Uses types from `@icarus/contracts`; never redefine contract types by hand.
- `src/renderer/community-client/`: the only place that talks to the community service.
- `src/renderer/editor/`: viewport interaction, gizmos, selection, explorer, properties and undo. Every edit becomes an `EditOperation` sent to the engine; the editor never mutates project data locally as the source of truth.
- `src/renderer/scene/`: only draws a `SceneDescription` and applies `Rollout` or simulate-mode frames. Never computes physics or invents motion.
- `src/renderer/features/<feature>/`: one folder per feature with its own components, hooks and state. Features do not import each other; shared code moves up to `ui/` or `scene/`.
- **One module, one folder; one tab, one file.** Every panel (`PNL-…`) and header (`HDR-…`) in [`docs/design/screens.md`](../../docs/design/screens.md) is a folder at the path listed there, and every tab (`TAB-…`) is one file named after it (`reward-tab.tsx`). Screens (`SCR-…`) compose modules; states (`STA-…`) reuse their screen with different data; dialogs (`MOD-…`) and popovers (`POP-…`) live with the feature that opens them. Put the ID in a one-line comment at the top of the file.
- `src/renderer/editor/inspector/`: renders properties from their `PropertySchema` type with the 12 property controls. Never write a custom inspector for one component.

## Rules

- **Copilot everywhere.** Every studio panel exposes its actions to the copilot, and copilot proposals are previewed in the viewport (highlighted parts, ghosted changes) before they are applied.
- **Server state in TanStack Query**, local UI state in Zustand. Never duplicate engine data in Zustand.
- **Coordinate conversion in one place** (`scene/coordinates.ts`): MuJoCo is Z-up with wxyz quaternions; Three.js is Y-up with xyzw.
- **Rendering is not tied to rollout fps:** interpolate between frames by time inside `useFrame`.
- **Every metric on screen comes from the engine.** No hardcoded demo values in components. Empty states show an empty state, never fake data.
- **Required states** for every view that queries the engine: loading, empty, error (with a useful message) and engine down.
- **Presentation-ready:** every screen must look good at 1920×1080 and in presentation mode, with no debug UI visible.
- **Do not steal focus** in automated tasks: no `win.show()`/`focus()` in tests; validate with headless Playwright or screenshots.

## Traps that already cost us

*(Fill in as we go: symptom → cause → rule.)*
