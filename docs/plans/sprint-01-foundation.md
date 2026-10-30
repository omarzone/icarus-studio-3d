# Sprint 1 · Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A monorepo where the Electron app starts and supervises the local Python engine, both share one generated contract, the interface uses the design tokens, every UI change can be compared against the design, CI keeps `main` green, and the two biggest risks (CPU training time, copilot model behavior) are measured.

**Architecture:** pnpm workspaces hold the desktop app, the contracts package, the tokens package and repo tools; `services/engine` is a uv project. The engine exposes FastAPI on localhost; the Electron main process spawns it with an argument array, polls `/health`, and passes the URL and status to the renderer through preload. Pydantic models are exported to JSON Schema and generated into TypeScript. Design references (PNG per catalog ID plus `inventory.json`) are compared against a dev-only design gallery captured by Playwright.

**Tech Stack:** Node 24, pnpm, Biome, TypeScript strict, Electron + electron-vite, React, Tailwind CSS 4, Vitest, Playwright (Electron), pixelmatch, Python 3.12 via uv, FastAPI, Pydantic v2, uvicorn, pytest, ruff, pyright, GitHub Actions.

**Spec:** [`roadmap.md`](./roadmap.md) › Sprint 1, [`docs/architecture.md`](../architecture.md), [`docs/design/tokens.md`](../design/tokens.md), [`docs/design/screens.md`](../design/screens.md) (`HDR-LAUNCHER`, `HDR-WORKSPACE`, `SYS-ENGINE-DOWN`), [`AGENTS.md`](../../AGENTS.md).

## Global Constraints

- All repo content in English; commits are Conventional Commits per zone (`feat(desktop): …`, `feat(engine-api): …`, `chore(repo): …`).
- TypeScript: `strict`, `noUncheckedIndexedAccess`; `type` not `interface`; top-level `import type`; no `any`; no assertions except `as const` (a `// SAFETY:` line otherwise); exhaustive `switch` without `default`.
- Python: 3.12 exactly (`requires-python = "==3.12.*"`), pyright `standard`, Pydantic v2 with `model_config = ConfigDict(extra="forbid")` on every boundary model, `pathlib` for paths.
- Dependencies: pnpm installs only versions published at least 3 days ago (`minimumReleaseAge: 4320`); only `electron` and `esbuild` may run install scripts; Python deps only with `uv add`, locked in `uv.lock`. Pin exact versions (no `^`).
- Names: no `utils`, `helpers`, `common`, `misc`, `manager` files or folders.
- File size guideline (warnings only): `.ts` 300, `.tsx` 400, `.py` 400, tests 800 code lines.
- Electron: `contextIsolation: true`, `nodeIntegration: false`; never `show()`/`focus()` in tests; tests run windows hidden (`ICARUS_HEADLESS=1`).
- Processes are spawned with an argument array, never a shell string (the repo path contains a space).
- Engine binds `127.0.0.1` only.
- UI uses tokens only: no hex values or off-scale sizes in `apps/desktop/src`.

## Review Focus

- **The engine never becomes healthy** (uv missing, first `uv sync` slow, port taken): the app must show `SYS-ENGINE-DOWN` with the reason after the timeout, never a blank window. Pinned in Task 5 (`waitForHealth` timeout test, status reducer test).
- **The engine dies mid-session or the app quits**: status goes to `down`, *Restart engine* works, and no Python process survives app exit on Windows (process tree). Pinned in Task 5 (`stopEngine` kills the tree test).
- **Paths with spaces** (`D:\Proyectos\Icarus Engine`): spawning must not break. Pinned in Task 5 (spawn arguments test with a path containing a space).
- **Contract drift**: a Python model changes without regenerating TypeScript. Pinned in Task 3 (`check:contracts` fails on a stale file).
- **Unstable visual captures** (DPI scaling, fonts not loaded, 3D noise): parity must be deterministic. Pinned in Task 7 (capture forces `deviceScaleFactor: 1`, waits for `document.fonts.ready`, masks regions).

---

### Task 1: Toolchain and root workspace

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `biome.json`, `tsconfig.base.json`, `.node-version`
- Create: `tools/max-lines/package.json`, `tools/max-lines/src/count-code-lines.ts`, `tools/max-lines/src/report.ts`, `tools/max-lines/src/count-code-lines.test.ts`

**Interfaces:**
- Produces: root scripts `check`, `check:max-lines`, `lint` (more are appended by later tasks); `countCodeLines(source: string, language: "ts" | "py"): number`; `findOversized(root: string): Promise<Array<{ path: string; lines: number; limit: number }>>`.

- [ ] **Step 1: Make pnpm usable on this machine.** `pnpm --version` currently hangs (corepack waiting for a prompt). Run `corepack enable` with `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`, then pin `"packageManager": "pnpm@<latest ≥3 days old>"` in `package.json`. Expected: `pnpm --version` prints a version in under 5 s.
- [ ] **Step 2: Write `pnpm-workspace.yaml`** with packages `apps/*`, `packages/*`, `tools/*`, `minimumReleaseAge: 4320`, and the build allowlist (`onlyBuiltDependencies` or `allowBuilds`, whichever the pinned pnpm supports) containing exactly `electron` and `esbuild`. Write `tsconfig.base.json` with the TypeScript constraints above, `biome.json` (formatter on, `noExplicitAny` error, `useImportType` error, `noNonNullAssertion` error), `.node-version` = `24`.
- [ ] **Step 3: Write the failing test** `tools/max-lines/src/count-code-lines.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { countCodeLines } from "./count-code-lines";

describe("countCodeLines", () => {
  it("ignores blank lines and comments in TypeScript", () => {
    expect(countCodeLines("const a = 1;\n\n// note\n/* block\n still */\nconst b = 2;\n", "ts")).toBe(2);
  });
  it("ignores blank lines, comments and docstrings in Python", () => {
    expect(countCodeLines('"""Module."""\n\n# note\nx = 1\n', "py")).toBe(1);
  });
});
```

- [ ] **Step 4: Run** `pnpm -F max-lines test`. Expected: FAIL, `countCodeLines` not found.
- [ ] **Step 5: Implement** `countCodeLines` in `count-code-lines.ts` and `findOversized` in `report.ts` (limits: `.ts` 300, `.tsx` 400, `.py` 400, `*.test.ts(x)` and `test_*.py` 800; skips `generated.ts`, `node_modules`, `.venv`, `dist`, `out`). `report.ts` prints `WARN <path> <lines>/<limit>` per file and always exits 0.
- [ ] **Step 6: Run** `pnpm -F max-lines test` → PASS; `pnpm check:max-lines` → exits 0.
- [ ] **Step 7: Root scripts.** `lint` = `biome check .`; `check` = `pnpm lint && pnpm -r test && pnpm check:max-lines` (later tasks append `typecheck`, `check:contracts`, engine checks). Run `pnpm check` → green.
- [ ] **Step 8: Commit** `chore(repo): add pnpm workspace, biome and file-size report`.

### Task 2: Engine skeleton with health and errors

**Files:**
- Create: `services/engine/pyproject.toml`, `services/engine/src/icarus/__init__.py`, `services/engine/src/icarus/cli.py`
- Create: `services/engine/src/icarus/contracts/__init__.py`, `services/engine/src/icarus/contracts/health.py`, `services/engine/src/icarus/contracts/errors.py`
- Create: `services/engine/src/icarus/api/__init__.py`, `services/engine/src/icarus/api/app.py`, `services/engine/src/icarus/api/health.py`
- Test: `services/engine/tests/api/test_health.py`, `services/engine/tests/api/test_errors.py`, `services/engine/tests/test_cli.py`

**Interfaces:**
- Produces: `HealthStatus(status: Literal["ok"], version: str, api_version: int)`; `ApiError(code: str, message: str, details: dict[str, str] | None = None)`; `create_app() -> FastAPI`; `parse_args(argv: list[str]) -> EngineArgs` with `host: str = "127.0.0.1"`, `port: int`, `reload: bool = False`; console script `icarus-engine`; `icarus.__version__`.
- Produces for the root: scripts `engine:sync` = `uv sync --project services/engine`, `engine:dev` = `uv run --project services/engine icarus-engine --port 8765 --reload`, `engine:test` = `uv run --project services/engine pytest -m "not slow and not live"`, `engine:lint` = ruff check + ruff format --check + pyright.

- [ ] **Step 1: Create the project** with `uv init --package` layout under `services/engine`, `requires-python = "==3.12.*"`, then `uv add fastapi uvicorn pydantic` and `uv add --dev pytest httpx ruff pyright`. Configure pytest markers `slow` and `live`, ruff line length 120, pyright `standard`.
- [ ] **Step 2: Write the failing tests:**

```python
# tests/api/test_health.py
from fastapi.testclient import TestClient
from icarus import __version__
from icarus.api.app import create_app

def test_health_reports_ok_and_version():
    response = TestClient(create_app()).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__, "api_version": 1}

# tests/api/test_errors.py
def test_unknown_route_returns_api_error():
    response = TestClient(create_app()).get("/nope")
    assert response.status_code == 404
    assert response.json() == {"code": "not_found", "message": "No route for GET /nope", "details": None}

# tests/test_cli.py
from icarus.cli import parse_args

def test_cli_defaults_to_localhost():
    args = parse_args(["--port", "9100"])
    assert (args.host, args.port, args.reload) == ("127.0.0.1", 9100, False)
```

- [ ] **Step 3: Run** `pnpm engine:test`. Expected: FAIL on imports.
- [ ] **Step 4: Implement** the contracts with `ConfigDict(extra="forbid")`, `create_app()` with the health router and exception handlers that turn `HTTPException` and validation errors into `ApiError` JSON, and `cli.main()` running uvicorn on `args.host:args.port`.
- [ ] **Step 5: Run** `pnpm engine:test` → PASS; `pnpm engine:lint` → clean. Append `pnpm engine:lint && pnpm engine:test` to the root `check`.
- [ ] **Step 6: Commit** `feat(engine-api): add engine skeleton with health and error contract`.

### Task 3: Contract pipeline Python → TypeScript

**Files:**
- Create: `services/engine/src/icarus/contracts/export.py`
- Create: `packages/contracts/package.json`, `packages/contracts/scripts/generate.mjs`, `packages/contracts/scripts/check-stale.mjs`, `packages/contracts/src/index.ts`, `packages/contracts/src/generated.ts` (generated)
- Test: `services/engine/tests/contracts/test_export.py`, `packages/contracts/src/generated.test.ts`

**Interfaces:**
- Consumes: `HealthStatus`, `ApiError` (Task 2).
- Produces: `icarus.contracts.MODELS: tuple[type[BaseModel], ...]`; `build_schema() -> dict[str, object]` (one JSON Schema with every model under `$defs`); `python -m icarus.contracts.export <path>`; package `@icarus/contracts` exporting `type HealthStatus`, `type ApiError`; root scripts `gen:contracts` and `check:contracts`.

- [ ] **Step 1: Write the failing tests:**

```python
# tests/contracts/test_export.py
from icarus.contracts.export import build_schema

def test_schema_lists_every_contract_and_forbids_extra_fields():
    defs = build_schema()["$defs"]
    assert {"HealthStatus", "ApiError"} <= set(defs)
    assert defs["HealthStatus"]["additionalProperties"] is False
```

```ts
// packages/contracts/src/generated.test.ts
import { expectTypeOf, it } from "vitest";
import type { ApiError, HealthStatus } from "./index";

it("exposes the engine contracts as types", () => {
  expectTypeOf<HealthStatus>().toEqualTypeOf<{ status: "ok"; version: string; api_version: number }>();
  expectTypeOf<ApiError["code"]>().toEqualTypeOf<string>();
});
```

- [ ] **Step 2: Run** both test commands. Expected: FAIL.
- [ ] **Step 3: Implement** `build_schema` with `pydantic.json_schema.models_json_schema` over `MODELS`; `generate.mjs` runs the export through `uv run`, converts with `json-schema-to-typescript` (`unreachableDefinitions: true`, `additionalProperties: false`, banner `// Generated by pnpm gen:contracts. Do not edit.`) and writes `src/generated.ts`; `check-stale.mjs` generates to a temp file and exits 1 with `contracts are stale: run pnpm gen:contracts` when it differs.
- [ ] **Step 4: Run** `pnpm gen:contracts`, then both tests → PASS. Add a field to `HealthStatus` locally, run `pnpm check:contracts` → exits 1 with the stale message; revert. Append `pnpm check:contracts` and `pnpm -r typecheck` to the root `check`.
- [ ] **Step 5: Commit** `feat(contracts): generate TypeScript contracts from the engine`.

### Task 4: Design tokens package

**Files:**
- Create: `packages/ui-tokens/package.json`, `packages/ui-tokens/src/tokens.ts`, `packages/ui-tokens/src/build-css.ts`, `packages/ui-tokens/src/index.ts`
- Test: `packages/ui-tokens/src/tokens.test.ts`, `packages/ui-tokens/src/build-css.test.ts`

**Interfaces:**
- Produces: `tokens` (`as const` object with `color`, `viz`, `scene`, `font`, `text`, `space`, `radius`, `shadow`, `size`, `icon`, `motion`, exactly the names and dark values in `docs/design/tokens.md`); `toCssVariables(t: typeof tokens): string` (`:root { --ic-… }` plus the shadcn variables from the mapping table); `toTailwindTheme(t: typeof tokens): string` (a Tailwind 4 `@theme inline { … }` block exposing `bg-app`, `bg-panel`, `text-fg-secondary`, `rounded-card`, …); build output `dist/tokens.css`; `scene` colors as numbers for Three.js.

- [ ] **Step 1: Write the failing tests:**

```ts
// tokens.test.ts — the document and the code never drift
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { tokens } from "./tokens";

it("matches every dark color in docs/design/tokens.md", () => {
  const doc = readFileSync(new URL("../../../docs/design/tokens.md", import.meta.url), "utf8");
  const rows = [...doc.matchAll(/^\| `(color\.[a-z.\-]+)` \| `([^`]+)` \|/gm)];
  expect(rows.length).toBeGreaterThan(20);
  for (const [, path, value] of rows) {
    expect(lookup(tokens, path), path).toBe(value);
  }
});

// build-css.test.ts
import { toCssVariables } from "./build-css";
it("emits css variables and the shadcn mapping", () => {
  const css = toCssVariables(tokens);
  expect(css).toContain("--ic-bg-app: #121212;");
  expect(css).toContain("--background: var(--ic-bg-app);");
  expect(css).toContain("--radius: 10px;");
});
```

`lookup(obj, "color.bg.app")` walks dot paths and maps kebab segments (`control-raised`) to the same keys in `tokens.ts`.

- [ ] **Step 2: Run** `pnpm -F @icarus/ui-tokens test` → FAIL.
- [ ] **Step 3: Implement** `tokens.ts` transcribing every table of `docs/design/tokens.md` (dark values; light column kept as `light` siblings only for colors), `toCssVariables`, `toTailwindTheme`, and a `build` script writing `dist/tokens.css` (variables + theme block).
- [ ] **Step 4: Run** tests → PASS; `pnpm -F @icarus/ui-tokens build` writes `dist/tokens.css`.
- [ ] **Step 5: Commit** `feat(desktop): add design tokens package`.

### Task 5: Desktop app that starts and supervises the engine

**Files:**
- Create: `apps/desktop/package.json`, `apps/desktop/electron.vite.config.ts`, `apps/desktop/tsconfig.json`
- Create: `apps/desktop/src/main/index.ts`, `apps/desktop/src/main/engine/engine-process.ts`, `apps/desktop/src/main/engine/health.ts`, `apps/desktop/src/main/engine/engine-status.ts`
- Create: `apps/desktop/src/preload/index.ts`, `apps/desktop/src/shared/engine-bridge.ts`
- Create: `apps/desktop/src/renderer/index.html`, `apps/desktop/src/renderer/main.tsx`, `apps/desktop/src/renderer/app/app.tsx`, `apps/desktop/src/renderer/app/styles.css`
- Create: `apps/desktop/src/renderer/app/shell/launcher-header/launcher-header.tsx`, `apps/desktop/src/renderer/app/shell/launcher-shell.tsx`, `apps/desktop/src/renderer/app/shell/workspace-header/workspace-header.tsx`, `apps/desktop/src/renderer/app/shell/workspace-shell.tsx`, `apps/desktop/src/renderer/app/system/engine-down.tsx`
- Test: `apps/desktop/src/main/engine/health.test.ts`, `apps/desktop/src/main/engine/engine-status.test.ts`, `apps/desktop/src/main/engine/engine-process.test.ts`

**Interfaces:**
- Consumes: `HealthStatus`, `ApiError` from `@icarus/contracts`; `dist/tokens.css` from `@icarus/ui-tokens`; `icarus-engine` CLI (Task 2).
- Produces:
  - `engineCommand(repoRoot: string, port: number): { command: string; args: string[] }` → `{ command: "uv", args: ["run", "--project", "<repoRoot>/services/engine", "icarus-engine", "--port", "<port>"] }`.
  - `waitForHealth(url: string, opts: { timeoutMs: number; intervalMs: number; fetchFn?: typeof fetch }): Promise<HealthStatus>`; rejects with `EngineStartError` (`reason: "timeout" | "exited"`, `message`).
  - `type EngineStatus = { kind: "starting" } | { kind: "ready"; url: string; version: string } | { kind: "down"; reason: string; lastLog: string[] }`; `nextStatus(status: EngineStatus, event: EngineEvent): EngineStatus` with `EngineEvent = { type: "healthy"; url: string; version: string } | { type: "exited"; code: number | null; lastLog: string[] } | { type: "timeout"; lastLog: string[] } | { type: "restart" }`.
  - `stopEngine(pid: number, platform: NodeJS.Platform, run: (cmd: string, args: string[]) => void): void` → on `win32` runs `taskkill /PID <pid> /T /F`, elsewhere kills the process group.
  - Preload `window.icarus.engine`: `{ status(): Promise<EngineStatus>; onStatus(cb: (s: EngineStatus) => void): () => void; restart(): Promise<void> }` typed in `shared/engine-bridge.ts`.
  - Engine URL override: `ICARUS_ENGINE_URL` skips spawning. Startup timeout 60 000 ms (first `uv sync` can be slow), poll interval 250 ms. Window created with `show: false`; shown on `ready-to-show` unless `ICARUS_HEADLESS=1`.
  - Renderer: launcher shell (`HDR-LAUNCHER` 56 px with Home, Projects, Community as inert placeholders) and workspace shell grid (`52px` header, columns `270px minmax(0,1fr) 380px`, gutter 12, gap 6) using token classes only; `SYS-ENGINE-DOWN` (power icon, *The Icarus engine stopped*, what is safe, **Restart engine** → `restart()`, **Copy error details** copies `lastLog`, details in mono). Each root element carries `data-ui-id` with its catalog ID.

- [ ] **Step 1: Scaffold** with electron-vite (React + TypeScript template), React 19, Tailwind 4 importing `@icarus/ui-tokens/dist/tokens.css`, Lucide (`lucide-react`), Inter and JetBrains Mono bundled via `@fontsource-variable/inter` and `@fontsource/jetbrains-mono`.
- [ ] **Step 2: Write the failing tests:**

```ts
// health.test.ts
it("resolves with the health payload on the first 200", async () => {
  const fetchFn = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ status: "ok", version: "0.1.0", api_version: 1 }));
  await expect(waitForHealth("http://127.0.0.1:9", { timeoutMs: 2000, intervalMs: 1, fetchFn })).resolves.toMatchObject({ status: "ok" });
});
it("rejects with reason timeout when the engine never answers", async () => {
  const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
  await expect(waitForHealth("http://127.0.0.1:9", { timeoutMs: 20, intervalMs: 5, fetchFn })).rejects.toMatchObject({ reason: "timeout" });
});

// engine-status.test.ts
it("goes down with the last log lines when the engine exits", () => {
  const ready: EngineStatus = { kind: "ready", url: "http://127.0.0.1:9", version: "0.1.0" };
  expect(nextStatus(ready, { type: "exited", code: 3, lastLog: ["boom"] })).toEqual({ kind: "down", reason: "The engine exited with code 3", lastLog: ["boom"] });
  expect(nextStatus({ kind: "down", reason: "x", lastLog: [] }, { type: "restart" })).toEqual({ kind: "starting" });
});

// engine-process.test.ts
it("passes the repo path as one argument even with spaces", () => {
  expect(engineCommand("D:/Proyectos/Icarus Engine", 9100).args).toEqual(["run", "--project", "D:/Proyectos/Icarus Engine/services/engine", "icarus-engine", "--port", "9100"]);
});
it("kills the whole process tree on Windows", () => {
  const run = vi.fn();
  stopEngine(4242, "win32", run);
  expect(run).toHaveBeenCalledWith("taskkill", ["/PID", "4242", "/T", "/F"]);
});
```

- [ ] **Step 3: Run** `pnpm -F desktop test` → FAIL.
- [ ] **Step 4: Implement** the four main-process modules, the IPC handlers behind the preload bridge (status, onStatus, restart), the free-port picker (`net.createServer().listen(0)`), log ring buffer (last 50 lines of engine stderr), `before-quit` → `stopEngine`, and the three renderer shells plus `SYS-ENGINE-DOWN`.
- [ ] **Step 5: Run** `pnpm -F desktop test` → PASS; `pnpm -F desktop typecheck` → clean. Run `pnpm dev`: the window shows the launcher shell; kill the Python process from the OS → `SYS-ENGINE-DOWN` appears; **Restart engine** → back to the launcher; quit the app → no `python` process remains (`tasklist | findstr python`).
- [ ] **Step 6: Commit** `feat(desktop): start, supervise and restart the engine`.

### Task 6: Design references in the repo

**Files:**
- Local, not versioned: `.local/mockups/` (exported mockups `*.dc.html`, the preview shim `preview.html`, `vendor/three.min.js`)
- Create: `tools/design-reference/package.json`, `tools/design-reference/src/export-references.ts`, `tools/design-reference/src/regions.ts`
- Create (generated): `docs/design/reference/<ID>.png` (62), `docs/design/reference/regions.json`, `docs/design/inventory.json`
- Test: `tools/design-reference/src/regions.test.ts`

**Interfaces:**
- Consumes: artboard → ID map from the Index table of `docs/design/screens.md`; tab-strip → module map (`STRIP`) used to build the catalog.
- Produces: `docs/design/reference/<ID>.png` at 1440×900, `deviceScaleFactor: 1`; second examples get a suffix (`SCR-PLAY.png`, `SCR-PLAY.b.png`). `regions.json`: `{ [screenId]: { modules: { [moduleId]: { x: number; y: number; w: number; h: number } }; masks: Array<{ x: number; y: number; w: number; h: number }> } }`, masks covering every 3D image (`img` inside viewport, idea and thumbnail cards). `docs/design/inventory.json` (same shape as the catalog generator's: regions, tab strips, tools, inspector rows, anchors with label, destination artboard and kind). Root script `design:references`.

- [ ] **Step 1: Copy** the exported mockups (the 62 `*.dc.html`, `preview.html`, `vendor/`) into `.local/mockups/`.
- [ ] **Step 2: Write the failing test** for the pure part:

```ts
// regions.test.ts
it("maps a tab strip to its module and keeps the panel box", () => {
  const panels = [{ tabs: ["Explorer"], box: { x: 12, y: 52, w: 258, h: 380 } }];
  expect(moduleRegions(panels)).toEqual({ "PNL-EXPLORER": { x: 12, y: 52, w: 258, h: 380 } });
});
it("ignores strips that are not in the module map", () => {
  expect(moduleRegions([{ tabs: ["Unknown"], box: { x: 0, y: 0, w: 1, h: 1 } }])).toEqual({});
});
```

- [ ] **Step 3: Run** → FAIL. **Implement** `moduleRegions` and `export-references.ts`: serve `.local/mockups/` over a local static server, open each artboard in Playwright Chromium at 1440×900 with `deviceScaleFactor: 1`, wait for `document.fonts.ready` and for every `img[src^="data:"]` to load, screenshot to `docs/design/reference/<ID>.png`, read each panel's bounding box and tab labels from the DOM for `regions.json`, collect masks from 3D images.
- [ ] **Step 4: Run** `pnpm design:references`. Expected: 63 PNGs, `regions.json` with a module box for `PNL-INSPECTOR` on `SCR-WORLD`, and tests PASS.
- [ ] **Step 5: Commit** `docs(design): add design reference images and inventory`.

### Task 7: Design parity and catalog checks

**Files:**
- Create: `apps/desktop/src/renderer/design-gallery/design-gallery.tsx`, `apps/desktop/src/renderer/design-gallery/gallery-registry.ts`
- Create: `apps/desktop/tests/design/compare.ts`, `apps/desktop/tests/design/report.ts`, `apps/desktop/tests/design/parity.e2e.ts`, `apps/desktop/tests/design/catalog.e2e.ts`, `apps/desktop/playwright.config.ts`
- Test: `apps/desktop/tests/design/compare.test.ts`

**Interfaces:**
- Consumes: `docs/design/reference/*`, `regions.json`, `inventory.json` (Task 6); `SYS-ENGINE-DOWN` (Task 5).
- Produces:
  - Route `#/__design/<ID>` available only when `import.meta.env.DEV` or `ICARUS_DESIGN_GALLERY=1`, rendering the registered component for that ID with fixture props at 1440×900.
  - `galleryRegistry: Record<string, { render: () => JSX.Element; host?: string; maxDiff?: number }>` — `host` names the screen whose reference holds a module's region.
  - `compareImages(reference: PNG, actual: PNG, masks: Box[]): { ratio: number; diff: PNG }` (pixelmatch threshold 0.1, masked pixels ignored).
  - `writeReport(results: ParityResult[], dir: string): void` → `index.html` with reference | implementation | diff and the ratio per ID.
  - Every interactive element in implemented UI carries `data-cta="<label in kebab-case>"` and, when it navigates, `data-goes-to="<catalog ID>"`.
  - Root scripts `test:design` (parity + catalog, Playwright with Electron, `ICARUS_HEADLESS=1`) and default `maxDiff` 0.03.

- [ ] **Step 1: Write the failing test:**

```ts
// compare.test.ts
it("returns zero for identical images and ignores masked pixels", () => {
  const a = solid(10, 10, [18, 18, 18, 255]);
  const b = solid(10, 10, [18, 18, 18, 255]);
  paint(b, { x: 0, y: 0, w: 5, h: 10 }, [255, 0, 0, 255]);
  expect(compareImages(a, a, []).ratio).toBe(0);
  expect(compareImages(a, b, [{ x: 0, y: 0, w: 5, h: 10 }]).ratio).toBe(0);
  expect(compareImages(a, b, []).ratio).toBeCloseTo(0.5);
});
```

- [ ] **Step 2: Run** → FAIL. **Implement** `compare.ts`, `report.ts`, the gallery route and registry with `SYS-ENGINE-DOWN` registered.
- [ ] **Step 3: Write** `parity.e2e.ts`: launch Electron hidden, for each registry ID open `#/__design/<ID>`, wait for fonts, screenshot the full window (or crop the module's region from its `host`), compare against the reference with the masks, assert `ratio ≤ maxDiff`, always write the report. Write `catalog.e2e.ts`: for each implemented screen ID, every anchor of its artboard in `inventory.json` must exist as `[data-cta="<label>"]` and, when it leads elsewhere, have `data-goes-to` equal to the destination's catalog ID.
- [ ] **Step 4: Run** `pnpm test:design`. Expected: `SYS-ENGINE-DOWN` passes parity (≤ 3%) and catalog (*Restart engine* → `SCR-HOME`, *Copy error details* in place); report written to `apps/desktop/test-results/design/index.html`.
- [ ] **Step 5: Commit** `test(desktop): add design parity and catalog checks`.

### Task 8: Continuous integration

**Files:**
- Create: `.github/workflows/check.yml`

**Interfaces:**
- Consumes: root `check`, `engine:sync`, `test:design`.
- Produces: required check *check* on pull requests and `main`.

- [ ] **Step 1: Write the workflow:** matrix `ubuntu-latest` and `windows-latest`; Node 24, pnpm (from `packageManager`), uv; `pnpm install --frozen-lockfile`, `pnpm engine:sync`, `pnpm check`. A second job on Ubuntu runs `pnpm test:design` under `xvfb-run` and uploads `apps/desktop/test-results/design` as an artifact.
- [ ] **Step 2: Push a branch** and open a PR. Expected: both jobs green; the artifact contains `index.html`.
- [ ] **Step 3: Commit** `ci(repo): run checks and design parity on every change`.

### Task 9: Measure CPU training for the parking task

**Files:**
- Create: `docs/decisions/001-cpu-training-budget.md`
- Throwaway (not committed): a script outside the repo with a MuJoCo car (two-wheel steering, 8 distance rays), a parking lot with randomized parked cars, a reward from *get closer*, *park in the spot*, *touching cars* and *time*, and Stable-Baselines3 PPO with `SubprocVecEnv`.

**Interfaces:**
- Produces for Sprints 4–5: measured steps per second with 8, 12 and 16 parallel environments on the development CPU; steps and wall time until 60% of 50 seeded evaluation episodes park; the PPO settings and network size used; the fallback if the target is missed.

- [ ] **Step 1: Run** the throwaway training for up to 2 hours wall time, evaluating every 100k steps on 50 fixed seeds.
- [ ] **Step 2: Write the ADR** (context, decision, consequences, at most ten lines plus a results table). Decision rule: if 60% parking is reached within 2 hours, the default budget is the measured steps rounded up; otherwise the ADR records the fallback (simpler task first, curriculum, smaller observation) for Sprint 4.
- [ ] **Step 3: Commit** `docs(decisions): record CPU training budget for navigation`.

### Task 10: Measure the copilot model

**Files:**
- Create: `docs/decisions/002-copilot-model-behavior.md`
- Throwaway (not committed): a script using the OpenAI-compatible client against the configured `reasoning` and `vision` connections from `.env`.

**Interfaces:**
- Produces for Sprints 6–7: structured-output validity over 20 calls with a JSON Schema derived from a Pydantic model (first try and after one retry), p50 and p95 latency for reasoning and for vision with one 768×432 rendered frame, and whether vision describes a known failure correctly on 5 rendered frames.

- [ ] **Step 1: Run** the throwaway measurements with credentials from `.env` (never committed).
- [ ] **Step 2: Write the ADR** with the numbers and the decisions they force (retry policy, timeouts, frames per diagnosis).
- [ ] **Step 3: Commit** `docs(decisions): record copilot model behavior`.

## Sprint exit

- `pnpm check` and `pnpm test:design` green locally and in CI on Ubuntu and Windows.
- `pnpm dev` opens the app, starts the engine, recovers from an engine crash and leaves no engine process after quitting.
- ADR 001 and 002 written with measured numbers.
- README status line updated: *Foundation in place: desktop app, engine, contract and design checks*.
- Record a 20-second capture of the engine crash and restart.
