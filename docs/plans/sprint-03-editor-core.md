# Sprint 3 · Editor Core and Project Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The desktop app works on real projects: start one from a template, see it in a real 3D viewport, select objects in the viewport or explorer, edit any property in the inspector, add components and library pieces, undo and redo, and rename, duplicate, restore or delete projects. Every change goes to the engine as edit operations.

**Architecture:** Contracts first (description, restore, duplicate, library pieces). The engine then gains duplicate, restore and pieces. On the desktop, a new `engine-client/` is the only code that calls `fetch`. It resolves the engine URL from `window.icarus.engine`, checks responses at the boundary and turns `ApiError` and `ValidationErrorBody` into typed errors. The `app` side of the projects, revisions, templates, scene and library ports maps engine documents onto the existing view types through pure, tested mapping modules. Selection stays client-side. `scene/` draws a `SceneDescription` with React Three Fiber, converting MuJoCo Z-up wxyz to Three.js Y-up xyzw in one file. The prototype mode and the design gallery keep their fixtures, so parity is unaffected.

**Tech Stack:** Python engine (Sprint 2) · Electron, React 19, TanStack Query, Zustand · three, @react-three/fiber, @react-three/drei (new) · Vitest · Playwright-Electron.

**Spec:** [`roadmap.md`](./roadmap.md) › Sprint 3; [`docs/architecture.md`](../architecture.md) › Desktop studio, HTTP API; [`apps/desktop/AGENTS.md`](../../apps/desktop/AGENTS.md); [`docs/design/screens.md`](../design/screens.md) for every ID touched; [ADR 005](../decisions/005-edit-operation-granularity.md).

## Global Constraints

- Zones and order: Task 1 `contracts` (alone, first); Task 2 `design` and `engine-api` engine work; Tasks 3–9 `desktop`. Commits: `feat(contracts)`, `feat(design)`, `feat(engine-api)`, `feat(desktop)`, `test(desktop)`, `docs`.
- `engine-client/` is the only place that calls `fetch`. Responses are checked at runtime before use; contract types come only from `@icarus/contracts`.
- Ports stay `definePort({ app, prototype })`. Screens never import the engine client. Fixtures stay untouched, and gallery parity must not change.
- An action without real logic stays `pending(...)` with its real sprint. Nothing fakes data in app mode. Run `pnpm -F desktop gen:pending` after port changes.
- Heavy 3D modules load with dynamic `import()` from the viewport only.
- TypeScript rules from the root `AGENTS.md`: strict, no `any`, no casts without `// SAFETY:`, exhaustive switches, `type` not `interface`.
- New dependencies: `three`, `@react-three/fiber`, `@react-three/drei` (and `@types/three`). Justify in the PR: the roadmap names R3F for the viewport, and writing a WebGL scene graph, orbit camera, transform gizmo and view cube by hand is weeks of work.
- Never steal focus. App-mode end-to-end tests run hidden with a temporary projects directory (`ICARUS_PROJECTS_DIR`).

## Review Focus

1. **The engine rejects an edit** (out of range, physics check fails). The inspector keeps the old value and shows the reason as a notice. The UI never displays a value the engine did not store. Pinned in Task 6 (setProperty reconciles from the engine state) and Task 9.
2. **The engine restarts on another port mid-session.** The client follows the new URL from `onStatus`, and requests made while it is down fail as "engine unavailable", not as a hang. Pinned in Task 3.
3. **Malformed or unexpected engine responses** (a missing field, the HTML error page of a crash). They become a readable error, never an exception deep inside a component. Pinned in Task 3.
4. **Selection after structural edits.** Undo removes the selected object, or another client deletes it, and the selection falls back to nothing instead of crashing the inspector. Pinned in Task 5.
5. **Rapid edits** (dragging a slider, a gizmo). Edits are sent on commit (release or blur), not on every frame, and each one is a single revision. Pinned in Task 7 (gizmo commits on drag end) and Task 6.

---

### Task 1: Contracts for descriptions, restore, duplicate and pieces

**Files:** `services/engine/src/icarus/contracts/{project,specs,operations,library}.py`, `packages/contracts/src/index.ts`, regenerated `generated.ts`, `services/engine/tests/contracts/test_project_contracts.py`.

**Produces:**
- `Project.description: str` (≤ 300, default `""`); `ProjectSummary.description`.
- `RenameProject.description: str | None = None`; when it is set, the description changes too.
- `Revision.restored_from: int | None = None`.
- `DuplicateProject{name}`.
- `PieceInfo{id, label, icon, description, object: ObjectSpec}`; `LibraryCatalog.pieces: list[PieceInfo]`.
- `packages/contracts/src/index.ts` re-exports every model the desktop uses: Project, ProjectState, ProjectSummary, Revision, OperationBatch, EditOperation and its members, PropertyValue and its members, PropertySchema, ComponentKindSpec, LibraryCatalog, TemplateInfo, PieceInfo, SceneDescription and its parts, ValidationErrorBody, ValidationIssue, DesignReport.

- [ ] Failing test: a project without `description` parses with `""`; `RenameProject` with a description round-trips; `Revision.restored_from` defaults to `None`.
- [ ] Implement, `pnpm gen:contracts`, `pnpm check` green.
- [ ] Commit `feat(contracts): add descriptions, restore, duplicate and library pieces`.

### Task 2: Engine duplicate, restore and library pieces

**Files:** `library/pieces.py`, `library/catalog.py`, `projects/operations.py` (rename sets the description), `projects/store.py` (`duplicate`, `restore`), `api/projects.py`, tests in `tests/library/test_pieces.py`, `tests/projects/test_store.py` and `tests/api/test_projects_api.py`.

**Produces:**
- `PIECES`: box obstacle, ramp, wall, post and ball, each a valid object built with library defaults.
- `ProjectStore.duplicate(project_id, name) -> ProjectState`: a new id, with the current document copied as revision 1 (summary "Duplicated from <name>").
- `ProjectStore.restore(project_id, number) -> ProjectState`: a new revision whose document equals revision `number`, with `restored_from=number`, parent = current, and the redo list emptied. An unknown number raises `UnknownRevision` (404).
- Routes: `POST /projects/{id}/duplicate` (`DuplicateProject`) → 201; `POST /projects/{id}/revisions/{n}/restore` → `ProjectState`.

- [ ] Failing tests:
  - every piece, placed in an `empty_world` project, passes the design report;
  - duplicate gives a new id, revision 1 and the same objects;
  - restore 1 after two edits gives revision 4 equal to revision 1, with `restored_from` 1;
  - restore 9 gives 404;
  - rename with a description changes both.
- [ ] Implement, engine check green, `pnpm gen:contracts` (no change expected).
- [ ] Commit `feat(engine-api): duplicate projects, restore revisions and list library pieces`.

### Task 3: Engine client

**Files:** `apps/desktop/src/renderer/engine-client/{engine-url.ts, request.ts, engine-api.ts, response-checks.ts}` and tests next to them.

**Produces:**
- `engineUrl(): Promise<string>`: reads `window.icarus.engine.status()`, follows `onStatus`, and rejects with `EngineUnavailable` while the engine is starting or down.
- `request<T>(path, init, check: (body: unknown) => body is T, fetchFn = fetch): Promise<T>`.
- Error classes:
  - `EngineUnavailable`;
  - `EngineRejected` (422, with `issues: ValidationIssue[]`);
  - `EngineError` (any other status, with `ApiError` code and message);
  - `EngineResponseInvalid` (failed check or non-JSON).
- `engineApi`: typed functions, one per route — `library`, `listProjects`, `createProject`, `project`, `deleteProject`, `applyOperations`, `revisions`, `undo`, `redo`, `scene`, `duplicateProject`, `restoreRevision`.
- Checks are small structural guards per response, verifying the fields the desktop reads, not full schemas.

- [ ] Failing tests with an injected `fetchFn`:
  - 200 with a valid body resolves;
  - 422 gives `EngineRejected` with issues;
  - 404 gives `EngineError` with code `not_found`;
  - an HTML 500 body gives `EngineResponseInvalid`;
  - a body missing `project.id` gives `EngineResponseInvalid`;
  - while status is `starting`, `EngineUnavailable` is raised;
  - after `onStatus` reports a new URL, the next request uses it.
- [ ] Implement. `useEngineAction` shows `EngineRejected` issues as the notice detail (first message).
- [ ] Commit `feat(desktop): add the engine client`.

### Task 4: Projects, revisions and templates on the engine

**Files:** `ports/projects-port.ts`, `ports/revisions-port.ts`, `ports/templates-port.ts`, new pure mappers `ports/project-views.ts` (+ test), fixtures gain the new functions.

**Produces:**
- Projects port app side:
  - `listProjects`, `getProject`;
  - `renameProject` (a `rename_project` operation with the description);
  - `duplicateProject` (`include` is ignored until runs exist; the dialog's run options stay as designed);
  - `deleteProject`;
  - `getFootprint` (`{trainingRuns: 0, runsBytes: 0}`: there are no runs before Sprint 5, and that is the true value);
  - new `createProject({ template, name }) → ProjectSummary`.
- Revisions port: `listRevisions` (newest first, `when` as relative time from `created_at`, `change` from the summary, `author` user→"you"); `restoreRevision`; new `undo(projectId)` and `redo(projectId)`.
- Templates port: `listTemplates` from `/library` (`empty_world` → kind `empty-world`, the rest → `example`).
- Project summary view: `status: "draft"`, `statusLine: "Revision N · design checks passed"`, `revision: "rev N"`.

- [ ] Failing mapper tests: relative time ("just now", "5 min ago", "yesterday"); revision order; template kinds; summary lines.
- [ ] Implement, `gen:pending`, `pnpm -F desktop test` green.
- [ ] Commit `feat(desktop): run projects, history and templates on the engine`.

### Task 5: Scene views from the project document

**Files:** `ports/scene-views.ts` (pure) + `ports/scene-views.test.ts`.

**Produces:**
- `sceneTree(project, catalog, selected) → SceneTree`:
  - sections: "World", then one per body;
  - depth comes from the parent chain;
  - the icon comes from the most telling component (motor → `motor`, light → `sun`, goal zone → `goal`, spawn → `spawn`, surface → `terrain`, otherwise mesh → `box`);
  - `meta` holds the surface kind or "static".
- `inspection(project, catalog, selected) → Inspection`: one `InspectorSection` per component (id = component id, title and icon from the kind). Properties come from the schemas, filled with stored values:
  - state `changed` when the value differs from the schema default, with `was` set to the default formatted;
  - expert properties stay in their section (hiding expert settings is not this sprint).
- `toViewValue(schema, value)` and `toContractValue(view)` between the contract `PropertyValue` and the view `PropertyValue` (min, max, step, unit and options come from the schema).
- `componentGroups(catalog) → ComponentGroup[]`.
- A selected id that no longer exists gives `selected: null` and `{kind: "nothing"}`.

- [ ] Failing tests:
  - with a parking car document (built in the test from the template operations' JSON captured from the engine), the tree lists World and Car sections with the wheels nested under the car;
  - the chassis inspection has Transform, Mesh, Material, Physics body, Collider and Distance ray sections;
  - mass 900 versus default 1 is `changed` with `was: "1 kg"`;
  - a slider keeps min, max and step;
  - a missing selection gives nothing;
  - `toContractValue(toViewValue(x)) == x` for every type.
- [ ] Implement. **Commit** `feat(desktop): map project documents to scene views`.

### Task 6: Scene, library and world screen on the engine

**Files:** `ports/scene-port.ts`, `ports/library-port.ts`, `features/world-studio/world-screen.tsx` (scene key from `params.project`; template param creates the project first), `editor/scene-queries.ts` (invalidate on edits), a small `ports/selection.ts` (Zustand, selection per project).

**Produces:**
- Scene port app side:
  - `getTree`, `selectObject`, `getInspection`;
  - `setProperty` / `resetProperty` (a `set_property` operation for the selected object; the result is re-read from the engine state);
  - `listComponentKinds`;
  - `addComponent` (an `add_component` operation with schema defaults; id = kind, or `kind_2`…);
  - `getTrainingCopies` (`copies` from the brain, `layouts: ["Grid"]`, `variations: []`);
  - `setTrainingCopies` (a `set_brain` operation);
  - `getGuide`: 4 steps derived from the document — has a body, has a goal, has rewards, has trained (always 0 until Sprint 5);
  - `getPropertyReference`: one sample per type found in the library schemas;
  - new `getSceneDescription(scene) → SceneDescription | null` (the prototype returns `null`).
- `toggleVariation` stays pending, moved to sprint 5 (randomization lands with training).
- Library port: `listItems` returns the pieces for shelf `library` (filtered by search); the community and my-files shelves are empty (Sprint 13 and 9). `previewItem` places the piece with a `create_object` operation (unique id, at the spawn point plus 3 m in x).
- World screen in app mode: no `project` param but a `template` param → create the project, then replace the params with `{project}`. Loading, error and engine-down states come through `QueryView`.

- [ ] Failing tests:
  - unit test for `nextComponentId`;
  - an app-mode test of the scene port against a fake engine API (injected `engineApi`): `setProperty` sends exactly one `set_property` operation with the contract value and returns the inspection rebuilt from the response;
  - a rejected edit propagates `EngineRejected`, and the selection is unchanged.
- [ ] Implement, `gen:pending`, desktop tests green.
- [ ] Commit `feat(desktop): edit worlds on the engine`.

### Task 7: The 3D viewport

**Files:** `apps/desktop/package.json` (+lock), `scene/coordinates.ts` (+test), `scene/scene-view.tsx`, `scene/scene-materials.ts`, `editor/viewport/viewport-surface.tsx`.

**Produces:**
- `toThreePosition([x,y,z]) = [x, z, -y]` and `toThreeQuaternion([w,x,y,z])`, the matching Y-up rotation in xyzw. These are the only conversions in the app.
- `SceneView({ description, selected, onSelect, onMove })`:
  - draws planes, boxes, spheres, capsules and cylinders with token-matched materials;
  - lights from the description, a ground grid, an orbit camera and drei's `GizmoViewcube`;
  - clicking a geom selects its body's object;
  - the selected object gets `TransformControls`, which calls `onMove(objectId, positionInParentFrame)` once on drag end.
- `ViewportSurface` loads `SceneView` with `import()` when the scene port has a description (app mode only). The prototype and gallery stay as today.
- A move commits as one `set_property` on `transform.position`. For the parent frame, divide out the parent body's world pose from the description.

- [ ] Failing tests: the coordinate conversions — the MuJoCo up axis maps to Three's up axis; a 90° rotation about MuJoCo z maps to a rotation about Three's y; round-trips.
- [ ] Implement; `pnpm check` green.
- [ ] Commit `feat(desktop): draw the engine scene in the viewport`.

### Task 8: Undo and redo in the workspace

**Files:** `app/shell/dock/dock-workspace-shell.tsx` (or a `useUndoShortcuts` hook in `app/shell/`), and query invalidation.

**Produces:** Ctrl/Cmd+Z undoes, while Ctrl/Cmd+Shift+Z and Ctrl+Y redo, on the open project. Shortcuts are skipped while typing in a field. Scene, projects and revisions queries are invalidated. "Nothing to undo" shows a quiet notice.

- [ ] Test: the shortcut hook ignores events from inputs and calls the right port action (unit test with a fake port).
- [ ] Implement. **Commit** `feat(desktop): undo and redo with the keyboard`.

### Task 9: The sprint demo end to end, and docs

**Files:** `apps/desktop/tests/app/editor.e2e.ts`, the `test:app` script, `docs/plans/roadmap.md` (nothing), `README.md` status, `apps/desktop/AGENTS.md` (engine-client and app-mode test notes).

The demo test launches the real app hidden with a temporary `ICARUS_PROJECTS_DIR` and runs these steps:

1. Open Home and pick the Parking car template.
2. The World screen shows Car in the explorer.
3. Select Car and set the collider friction to 1.5 through the inspector control. The engine state now has 1.5.
4. Add a Touch component. The inspector shows a Touch section.
5. Press Ctrl+Z. The section is gone, and the engine is back at the previous revision.
6. Rename the project from the projects list. Duplicate it. The list shows both.
7. The viewport canvas is present.

- [ ] Write and run it (`pnpm -F desktop test:app`), then fix what it finds.
- [ ] Docs: README status line, AGENTS notes.
- [ ] Commit `test(desktop): run the sprint 3 demo against the real engine` and `docs: sprint 3 status`.

## Not in this sprint

- Variations per copy (Sprint 5).
- Expert-settings grouping and the `mixed`, `locked` and `proposed` states from real data (Sprints 6 and 9).
- Community and imported library shelves (Sprints 13 and 9).
- Copilot hooks on these panels (Sprint 6).
- Playing the scene (Sprint 4).
