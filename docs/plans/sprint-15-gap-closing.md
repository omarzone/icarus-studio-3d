# Sprint 15 · Cerrar los huecos verificados — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que todo lo que la app muestra diga la verdad y que los huecos chicos y medianos verificados el 2026-11-03 queden cerrados, sin abrir trabajo de sprints grandes.

**Architecture:** casi todo vive en el escritorio (puertos `*-port.ts` con su implementación `app:` y vistas puras `*-views.ts`). Hay un cambio en el motor (texto de un objetivo de Build) y uno en el servicio de comunidad (la miniatura en la cola de moderación). Ningún cambio toca el contrato del motor, así que no hace falta regenerar `packages/contracts`.

**Tech Stack:** Electron + React + TanStack Query + Vitest + Playwright (escritorio); FastAPI + pytest (motor y comunidad).

**Spec:** [`docs/design/app-gaps.md`](../design/app-gaps.md) (estado verificado de cada función), [`docs/design/screens.md`](../design/screens.md) (comportamiento de cada pantalla), [`docs/plans/roadmap.md`](./roadmap.md).

## Qué falta y qué entra en este sprint

`app-gaps.md` lista 593 funciones del diseño: 354 funcionan, 146 parciales, 18 pendientes, 18 solo con datos de ejemplo, 53 faltan y 4 están rotas. **No todo cabe en un sprint.** Este sprint cierra lo que se puede cerrar sin un subsistema nuevo:

| Entra (12 tareas) | Queda fuera, con su sprint |
|---|---|
| Las 4 cosas rotas (rig check, banner, destino de exportación, estante Community) | Cerebros por conectoma: simulador, datos, mosca (Sprint 11) |
| Imágenes vacías con datos reales (Inicio, tarjeta de publicación, moderación) | Instaladores y actualizaciones (Sprint 14) |
| Importar sin proyecto abierto | Modos de herramienta Bone/Joint/Weights y pintar pesos (Sprint 9, segunda parte) |
| El video detrás del esqueleto en Motion | Importar URDF/MJCF, FBX/USD; exportar glTF/FBX |
| Cambiar de checkpoint en la vista de red | Curriculum, comentarios, activaciones en vivo |
| Notificaciones del sistema al terminar un run | Detector de pose dedicado; desplegar la comunidad oficial |
| Etiquetas honestas en las pantallas de conectoma | |

## Global Constraints

- Real o nada: cada imagen, número o estado viene de un run, un proyecto o el servicio de comunidad; si no existe, la UI lo dice.
- Un solo modelo de edición: los proyectos cambian solo con `EditOperation`s aplicadas por el motor.
- El prototipo (`pnpm prototype`) y la galería de diseño conservan las superficies del diseño: los datos de ejemplo (`*.fixture.ts`) no cambian salvo donde una tarea lo diga, y cada `data-cta` del inventario sigue existiendo.
- TypeScript estricto, sin `any` ni aserciones de tipo; `switch` exhaustivo sin `default`; `type`, no `interface`.
- Todo el texto del repo (código, UI, commits, PR) en inglés; solo este plan va en español.
- Ninguna dependencia nueva.
- Cada tarea actualiza las filas que cierra en `docs/design/app-gaps.md` (estado, "In spec?" y "What it needs") y, si cambia un comportamiento descrito, `docs/design/screens.md`.
- Antes de cada PR: `pnpm check` en verde.

## Review Focus

1. Un hallazgo del rig check cuyo `part` ya no existe en el cuerpo (se borró la pieza): seleccionar no debe romper ni seleccionar otra cosa; el clic no hace nada visible y la fila sigue mostrándose.
2. Una corrida que termina mientras la ventana tiene el foco: no debe aparecer una notificación del sistema (la app ya lo muestra); solo con la ventana en segundo plano.
3. El estante Community sin servicio de comunidad conectado (sin red o sin servidor): debe mostrar el estado de "no conectado" que ya usa la pantalla Community, no una lista vacía que diga "nada publicado".
4. Importar sin proyecto y cancelar el diálogo de archivo: no debe quedar un proyecto vacío creado.
5. Un clip de Motion rastreado con un video cuyos cuadros ya no están en el motor (clip viejo sin imágenes): la vista debe caer a la figura de palitos actual, no a una imagen rota.

---

### Task 1: Una fila del rig check selecciona su pieza

Cierra `TAB-RIG-CHECK` "Click a problem to select the part" (broken).

**Files:**
- Modify: `apps/desktop/src/renderer/ports/progress-step.ts` (tipo `CheckFact`)
- Modify: `apps/desktop/src/renderer/ports/body-views.ts` (`rigCheckFromEngine`)
- Modify: `apps/desktop/src/renderer/features/body-studio/rig-check/rig-check-tab.tsx`, `rig-check-panel.tsx`, `features/body-studio/body-screen.tsx` (pasar la escena)
- Test: `apps/desktop/src/renderer/ports/body-views.test.ts`

**Interfaces:**
- Produces: `CheckFact = { text: string; tone: "ok" | "warn"; part?: string }`; `RigCheckPanel({ body, scene }: { body: string; scene: string })`; `RigCheckTab({ check, onPose, onSelectPart }: { …; onSelectPart: (part: string) => void })`.

- [ ] **Step 1: Write the failing test** en `body-views.test.ts`, dentro de `describe("rig check from the engine")`:

```ts
it("keeps the part of every audit finding so its row can select it", () => {
  const check = rigCheckFromEngine({ ...ENGINE_CHECK, findings: [{ id: "f1", part: "left_shin", text: "Left shin has no motor", fixable: true }] });
  expect(check.checks.at(-1)).toEqual({ text: "Left shin has no motor", tone: "warn", part: "left_shin" });
});
```

(`ENGINE_CHECK` es el `RigCheck` del motor que ya usa ese `describe`; si se llama distinto, usar el existente.)

- [ ] **Step 2:** `pnpm -F desktop exec vitest run src/renderer/ports/body-views.test.ts` → FAIL (falta `part`).
- [ ] **Step 3:** en `rigCheckFromEngine`, mapear `part: finding.part`. En `RigCheckTab`, el `Act` de una fila con `item.part` llama `onSelectPart(item.part)`; una fila sin `part` (prueba de diseño fallida) queda como texto, sin botón. `RigCheckPanel` resuelve `onSelectPart` con `usePort(scenePort).selectObject({ scene, id: part })` vía `useEngineAction`, y refresca el árbol con el mismo `onSuccess` que usa `ExplorerPanel` (`useSceneCache(scene).objects`). `BodyScreen` pasa `config.scene`; la galería (`catalog.tsx`) pasa `scene="dance-copy"`.
- [ ] **Step 4:** el test pasa; `pnpm -F desktop exec tsc --noEmit -p tsconfig.json` sin errores.
- [ ] **Step 5:** actualizar la fila 462 de `app-gaps.md` a `works`; commit `fix(desktop): select the part of a rig check problem`.

### Task 2: El banner del cuerpo solo bloquea cuando de verdad no se puede entrenar

Cierra `STA-BODY-CHECK-FAILED` "Can't train yet" (broken). Las pruebas de diseño fallidas sí bloquean (el store rechaza el cambio); los hallazgos de la auditoría no.

**Files:**
- Modify: `apps/desktop/src/renderer/ports/body-port.ts` (`RigCheck`), `ports/body-views.ts`, `features/body-studio/check-failed-banner.tsx`
- Test: `apps/desktop/src/renderer/ports/body-views.test.ts`

**Interfaces:**
- Produces: `RigCheck` gana `blocking: number` (pruebas de diseño con `status === "fail"`); `problems` sigue siendo el total.

- [ ] **Step 1: Write the failing test:**

```ts
it("counts only failing design tests as blocking; audit findings are worth fixing but do not block", () => {
  const check = rigCheckFromEngine({ ...ENGINE_CHECK, findings: [{ id: "f1", part: "left_shin", text: "Left shin has no motor", fixable: true }] });
  expect([check.blocking, check.problems]).toEqual([0, 1]);
});
```

- [ ] **Step 2:** correr → FAIL.
- [ ] **Step 3:** calcular `blocking` en `rigCheckFromEngine`. En `CheckFailedBanner`: con `blocking > 0`, el texto actual ("Can't train yet, N problems in the body. Physics tests must pass so training is real."); con `blocking === 0` y `problems > 0`, el título pasa a `` `${problems} ${problems === 1 ? "thing" : "things"} worth fixing in the body.` `` y la frase a `"Training can start; fixing them usually trains better."`. Los botones "Fix … for me" y "Show me" no cambian (sus `data-cta` siguen iguales). El fixture del prototipo pone `blocking` igual a `problems` para que la referencia de diseño no cambie.
- [ ] **Step 4:** test en verde y `tsc` sin errores.
- [ ] **Step 5:** fila 468 → `works`; actualizar el bullet de `STA-BODY-CHECK-FAILED` en `screens.md`; commit `fix(desktop): only block training in the body banner when design tests fail`.

### Task 3: La exportación de animación no promete lo que no hace

Cierra `MOD-EXPORT-ANIMATION` "Target rig" (broken) y `SCR-BUILD` "Export animation target" (partial).

**Files:**
- Modify: `apps/desktop/src/renderer/features/motion-studio/export-dialog.tsx`, `ports/motion-port.ts` (`AnimationExport.target`), `ports/motion-views.ts`, `ports/motion.fixture.ts`
- Modify: `services/engine/src/icarus/hardware/build_targets.py`
- Test: `services/engine/tests/api/test_build_api.py`

- [ ] **Step 1: Write the failing test** en `test_build_api.py`, siguiendo `test_targets_without_a_brain_offer_robot_files_and_a_parts_list` (mismo proyecto humanoide de ese módulo o `new_project(client, "humanoid")`):

```python
def test_the_animation_target_names_the_formats_the_export_writes(tmp_path):
    ...
    animation = next(item for item in targets if item["kind"] == "animation")
    assert animation["detail"] == "JSON · BVH (for dancers)"
```

- [ ] **Step 2:** `pnpm engine:test -- tests/api/test_build_api.py -k animation_target` (o `uv run pytest` en `services/engine`) → FAIL ("glTF · FBX").
- [ ] **Step 3:** en `build_targets.py`, `detail="JSON · BVH (for dancers)"`. En el escritorio, quitar el campo `Target` del diálogo y `target` de `AnimationExport` en modo app: el motor no lo recibe y no hay rigs con nombre. Si el inventario de diseño tiene un ancla "Target", conservarla solo en el prototipo (`useRuntimeMode() === "prototype"`).
- [ ] **Step 4:** test del motor en verde; `tsc` sin errores.
- [ ] **Step 5:** filas 521 y 700 actualizadas; commit `fix: name only the animation formats the export writes`.

### Task 4: El estante Community de la biblioteca lista lo publicado

Cierra `TAB-LIBRARY-COMMUNITY` (broken). Una creación es un proyecto completo, no una pieza: la tarjeta abre su página, donde ya existe *Remix into my projects*.

**Files:**
- Modify: `apps/desktop/src/renderer/ports/library-engine.ts` (nueva `communityItems`), `ports/library-port.ts` (`listItems` en `app:`), `ports/library-port.ts` (`LibraryItem` gana `creation?: string`)
- Modify: `apps/desktop/src/renderer/features/world-studio/library/community-tab.tsx`
- Test: `apps/desktop/src/renderer/ports/library-engine.test.ts`

**Interfaces:**
- Consumes: `CommunityPort.listCreations(query: CreationQuery): Promise<CreationSummary[]>` (`ports/community-port.ts`).
- Produces: `communityItems(creations: readonly CreationSummary[]): LibraryItem[]`.

- [ ] **Step 1: Write the failing test:**

```ts
it("lists community creations with their author, each opening its page", () => {
  const items = communityItems([{ id: "c1", name: "Salsa Dancer", author: { handle: "lu", name: "Lu", initials: "LU" }, category: "Humanoids", votes: 3, remixes: 1, opensIn: "page", picture: null }]);
  expect(items).toEqual([{ id: "c1", name: "Salsa Dancer", kind: "body", source: "lu", group: "Humanoids", creation: "c1" }]);
});
```

(Ajustar la forma de `author` a `CreationAuthor` real. Categoría → `kind`: `"Worlds"`→`environment`, `"Brains"`→`brain`, cualquier otra→`body`; usar los nombres de categoría que devuelve `listCategories` del servicio.)

- [ ] **Step 2:** correr → FAIL.
- [ ] **Step 3:** `listItems` en `app:` para `shelf === "community"` llama `createCommunityCatalog().listCreations({ sort: "featured", search, limit: 24 })` y devuelve `communityItems(...)`; los demás estantes siguen igual. `CommunityTab`: una tarjeta con `creation` navega a `SCR-CREATION` con `params={{ creation }}` (mismo destino que `opensCreation` en `features/home/community-strip.tsx`). Errores de conexión: reutilizar el estado de comunidad no conectada de `features/community/community-screen.tsx` (Review Focus 3).
- [ ] **Step 4:** test en verde.
- [ ] **Step 5:** fila 307 → `works`; commit `fix(desktop): list community creations in the library`.

### Task 5: Imágenes reales en las tarjetas de Inicio y en la vista previa de publicación

Cierra `SCR-HOME` "Four community cards…" y `TAB-SHARE-TO-COMMUNITY` "Preview card" (partial).

**Files:**
- Modify: `apps/desktop/src/renderer/features/home/community-strip.tsx`
- Modify: `apps/desktop/src/renderer/features/build-studio/target-view/share-to-community-tab.tsx`

**Interfaces:**
- Consumes: `useCommunityPicture(picture: string | null): string | null` (`app/runtime/community-picture.ts`); `SceneThumbnail({ cacheKey, load, className })` (`scene/scene-thumbnail.tsx`) con `projectsPort.projectScene`.

- [ ] **Step 1:** en `community-strip.tsx`, extraer la tarjeta a un componente que llame `useCommunityPicture(creation.picture)` y dibuje `<img … className="size-full object-cover" />` dentro del `span` de `h-37.5`, igual que `community-screen.tsx:111`.
- [ ] **Step 2:** en `share-to-community-tab.tsx:79`, dibujar `SceneThumbnail` del proyecto dentro del `div role="img"` cuando `projectsPort.projectScene` existe (app); en el prototipo queda la superficie vacía.
- [ ] **Step 3:** verificar en la app real (Playwright con ventana oculta, como `tests/app/close-project.e2e.ts`) que ambas imágenes cargan; guardar las capturas para el PR.
- [ ] **Step 4:** `pnpm check` en verde.
- [ ] **Step 5:** filas 86 y 681 → `works`; commit `fix(desktop): show real pictures on Home community cards and the share preview`.

### Task 6: La cola de moderación muestra la miniatura

Cierra `SCR-MODERATION` "Report card with preview…" (partial). Zona comunidad primero, luego escritorio.

**Files:**
- Modify: `services/community/src/icarus_community/schemas/service.py` (`ModerationItem.picture: str | None = None`), `moderation.py` (llenarlo con el `thumbnail_path` de la creación)
- Test: `services/community/tests/test_moderation_api.py`
- Modify: `apps/desktop/src/renderer/community-client/` (tipo y validación de la respuesta), `ports/moderation-port.ts` (`ModerationItem.picture: string | null`), `features/moderation/moderation-screen.tsx:92`

- [ ] **Step 1: Write the failing test** junto a `test_only_moderators_see_the_queues`:

```python
def test_each_queued_report_carries_the_creation_picture(client, sign_in, ...):
    ...
    item = queue[0]
    assert item["picture"] == creation["thumbnail_path"]
```

- [ ] **Step 2:** `pnpm community:test` (o `uv run pytest` en `services/community`) → FAIL.
- [ ] **Step 3:** agregar el campo y llenarlo; en el escritorio validar `picture` como `string | null` y dibujarlo con `useCommunityPicture` en el `span` de `h-21.5 w-35`.
- [ ] **Step 4:** tests de comunidad en verde; `pnpm check`.
- [ ] **Step 5:** fila 128 → `works`; commit `feat(community): show the creation picture in the moderation queue`.

### Task 7: Importar sin un proyecto abierto

Cierra `SCR-HOME` "Import your own" y `SCR-PROJECTS` "Open a file" (pending).

**Files:**
- Modify: `apps/desktop/src/renderer/features/body-studio/import-dialog.tsx`
- Test: `apps/desktop/tests/app/import-without-project.e2e.ts` (nuevo)

**Interfaces:**
- Consumes: `projectsPort.createProject({ template: "empty_world", name }): Promise<ProjectSummary>`; `useNavigation((s) => s.replaceParams)`.

- [ ] **Step 1: Write the failing e2e** con el patrón de `tests/app/close-project.e2e.ts`: abrir la app con carpetas temporales, en Inicio pulsar `[data-cta^="import-your-own"]`, elegir con `setInputFiles` un `.glb` pequeño (generar uno en el test como `services/engine/tests/model_files.py`, o usar un archivo de `assets/`), pulsar *Import as static mesh* y esperar que el motor liste un proyecto nuevo cuyo mundo contiene el modelo importado.
- [ ] **Step 2:** `pnpm -F desktop test:app -- import-without-project` → FAIL (el diálogo dice que no hay proyecto).
- [ ] **Step 3:** en `ImportDialog`, cuando `projectKey === null` en modo app, mostrar el diálogo normal; al confirmar la importación, crear primero el proyecto (`createProject({ template: "empty_world", name: <nombre del archivo sin extensión> })`), poner su id en la ruta con `replaceParams({ project: id })` y luego importar en él. El proyecto se crea solo al confirmar, nunca al abrir el diálogo ni al cancelar (Review Focus 4).
- [ ] **Step 4:** e2e en verde.
- [ ] **Step 5:** filas 84 y 106 → `works`; quitar la fila "Import with no open project" de la sección 3; commit `feat(desktop): import a model without an open project`.

### Task 8: El video detrás del esqueleto en Motion

Cierra `TAB-SIDE-BY-SIDE` "Reference video with tracked skeleton" y `TAB-REFERENCE-ONLY` (partial). Overlay sigue con figuras de palitos: el resultado de la física no está en coordenadas de la imagen.

**Files:**
- Modify: `apps/desktop/src/renderer/ports/motion-port.ts` (`MotionPlayback`), `ports/motion-views.ts` (`motionCompare` recibe el `link`), `ports/motion-engine.ts` (`getCompare`, `setSpeed` pasan el `link` como ya hace `getTracking`)
- Modify: `apps/desktop/src/renderer/features/motion-studio/compare/motion-view.tsx`
- Test: `apps/desktop/src/renderer/ports/motion-views.test.ts`

**Interfaces:**
- Consumes: `FrameStrip`, `FramePoint`, `ClipFrame({ strip, index, points })` (`features/motion-studio/clip-frame.tsx`), `motionApi.frameLink(projectId, clipId)`.
- Produces: `MotionPlayback = { fps; reference; result; strip: FrameStrip | null; points: readonly (readonly FramePoint[])[] }`; `motionCompare(workspace, speed, link: FrameLink = null)`.

- [ ] **Step 1: Write the failing test:**

```ts
it("plays the reference over the clip's own frames once it is tracked", () => {
  const compare = motionCompare(workspace(), "1×", (index) => `http://engine/frames/${index}`);
  expect([compare.playback?.strip?.count, compare.playback?.points.length]).toEqual([4, 4]);
  expect(motionCompare(workspace(), "1×").playback?.strip).toBeNull();
});
```

- [ ] **Step 2:** correr → FAIL.
- [ ] **Step 3:** mapear `strip` con `frameStrip(workspace, link)` (ya existe en `motion-views.ts`) y `points` igual que `trackingProgress.poses`. En `MotionView`, cuando `figures` incluye `"reference"`, `playback.strip` existe y hay `points` para el índice actual, dibujar `ClipFrame` con esos puntos en lugar de la figura de referencia; si la imagen falla al cargar (`onError` del `img`), volver a la figura (Review Focus 5). La figura del resultado no cambia.
- [ ] **Step 4:** test en verde; verificar en la app con el proyecto Humanoid rastreado (captura para el PR).
- [ ] **Step 5:** filas 483 y 486 → `works`; commit `feat(desktop): draw the tracked video under the motion reference`.

### Task 9: Cambiar de checkpoint en la vista de red

Cierra `STA-BRAIN-NETWORK` "Live, 25k, 312k switch" (pending).

**Files:**
- Modify: `apps/desktop/src/renderer/features/brain-studio/network-diagram.tsx` (`networkKey`, `NetworkDiagram`, `useNetworkCheckpoints`), `features/brain-studio/brain-screen.tsx` (`BrainView`)
- Test: `apps/desktop/src/renderer/ports/brain-network-engine.test.ts`

**Interfaces:**
- Consumes: `BrainPort.getNetwork({ brain, checkpoint }: { brain: string; checkpoint?: string })` (ya elige el paso por etiqueta).
- Produces: `networkKey(brain: string, checkpoint: string | null)`; `NetworkDiagram({ brain, checkpoint }: { brain: string; checkpoint: string | null })`.

- [ ] **Step 1: Write the failing test** en `describe("engine network")`:

```ts
it("shows the checkpoint chosen by its label", async () => {
  const view = await network.getNetwork({ brain: "p1", checkpoint: "25k" });
  expect(view.checkpoint).toBe("25k");
});
```

(Usar el mismo doble de `api` del test existente con checkpoints `[25_000, 50_000]`; si ya pasa, el fallo está solo en la UI: escribir el test y seguir con el Step 3, anotando en el commit que el puerto ya lo soportaba.)

- [ ] **Step 2:** correr.
- [ ] **Step 3:** en `BrainView`, estado `const [checkpoint, setCheckpoint] = useState<string | null>(null)`; `ViewportPanel` recibe `onViewOption={setCheckpoint}` y marca la opción activa; `NetworkDiagram` consulta `getNetwork({ brain, checkpoint: checkpoint ?? undefined })` con `networkKey(brain, checkpoint)`.
- [ ] **Step 4:** tests en verde; verificar en la app que la red cambia al elegir otro checkpoint.
- [ ] **Step 5:** fila 393 → `works`; commit `feat(desktop): switch the network view between checkpoints`.

### Task 10: Notificación del sistema cuando termina un run

Cierra `SCR-SETTINGS-NOTIFICATIONS` "Notifications in the system tray" (missing) y la parte local de `POP-NOTIFICATIONS`.

**Files:**
- Modify: `apps/desktop/src/renderer/app/runtime/engine-event-effects.ts` (nueva función pura), `app/runtime/use-engine-events.ts`
- Modify: `apps/desktop/src/renderer/features/settings/notifications-settings-page.tsx` (texto)
- Test: `apps/desktop/src/renderer/app/runtime/engine-event-effects.test.ts`

**Interfaces:**
- Produces: `runEndedNotice(event: EngineEvent): { title: string; body: string } | null`.

- [ ] **Step 1: Write the failing test:**

```ts
it("turns the end of a run into a system notice and ignores everything else", () => {
  const ended = (state: RunState) => ({ type: "run_event", run_id: "r1", event: { type: "status", status: { ...RUN, name: "Run 3", state } } }) as const;
  expect(runEndedNotice(ended("done"))).toEqual({ title: "Run 3 finished", body: "Its best brain is ready in Results." });
  expect(runEndedNotice(ended("stopped"))).toEqual({ title: "Run 3 stopped", body: "Its best brain so far is kept." });
  expect(runEndedNotice(ended("failed"))).toEqual({ title: "Run 3 failed", body: "Open Train to see what went wrong." });
  expect(runEndedNotice(ended("running"))).toBeNull();
});
```

(`RUN` es un `RunStatus` completo de prueba; sin `as const` si el tipado lo permite sin aserción.)

- [ ] **Step 2:** correr → FAIL.
- [ ] **Step 3:** implementar; en `use-engine-events.ts`, por cada evento con aviso y solo si `document.hasFocus()` es falso (Review Focus 2), `new Notification(title, { body })`. Un run solo avisa una vez (recordar los `run_id` avisados en un `Set` del hook). En la página de ajustes, cambiar "Shown in the app and in your system tray." por "Runs that finish while Icarus is in the background show as a system notification."
- [ ] **Step 4:** test en verde; probar en la app real con un run corto y la ventana en segundo plano.
- [ ] **Step 5:** filas 136, 177 y 178 actualizadas; quitar "System tray notifications" de la sección 3; commit `feat(desktop): notify when a run ends in the background`.

### Task 11: Las pantallas de conectoma dicen qué cerebro muestran

Mitiga el primer hueco del top (`MOD-BRAIN-SOURCE`, `STA-BRAIN-CONNECTOME`) hasta el Sprint 11, sin construirlo.

**Files:**
- Modify: `apps/desktop/src/renderer/features/brain-studio/source-dialog.tsx`, `features/brain-studio/brain-screen.tsx` (variante `connectome`), `editor/brain-activity/brain-activity-panel.tsx`

- [ ] **Step 1:** en modo app (`useRuntimeMode() === "app"`): el botón "Load into the fly" dice "Use this brain" y vuelve a `SCR-BRAIN`; la variante `connectome` y el panel de actividad llevan el subtítulo "Showing the trained brain: connectome brains are not available yet". El prototipo conserva el texto del diseño (mismo `data-cta`).
- [ ] **Step 2:** `pnpm check` y verificar en la app las tres pantallas.
- [ ] **Step 3:** filas 410 y 416 actualizadas; ítem 1 del top de `app-gaps.md` reescrito; commit `fix(desktop): say which brain the connectome screens show`.

### Task 12: Cierre del sprint

- [ ] **Step 1:** recontar la tabla de resumen de `app-gaps.md` con el script de conteo por grupo (el mismo que se usó el 2026-11-03: contar la columna "App today" por sección).
- [ ] **Step 2:** en `roadmap.md`, agregar "Sprint 15 · Closing verified gaps" con su estado y la lista de lo que quedó fuera (tabla de arriba).
- [ ] **Step 3:** `pnpm check`; commit `docs: close sprint 15 in the roadmap and the app gaps`.

## Cómo correrlo

Las tareas 1–11 son independientes entre sí salvo 1 y 2 (mismo archivo `body-views.ts`: hacer 1 antes que 2) y 8 (usa `clip-frame.tsx` y `frameLink`, ya en `main`). Se pueden repartir en ramas paralelas por zona: escritorio (1–5, 7–11), motor (parte de 3), comunidad (6).
