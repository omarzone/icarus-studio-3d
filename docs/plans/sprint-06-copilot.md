# Sprint 6 · Copilot Implementation Plan

> **For agentic workers:** two workstreams run in parallel, one per zone: engine (`copilot`, `engine-api`, plus one `sim` fix) and desktop. Both start from the copilot contracts already on this branch (`services/engine/src/icarus/contracts/copilot.py`, generated into `@icarus/contracts`). Never edit the contracts; report a missing field instead.

**Goal:** Type "a little car that learns to park itself", get three compiled ideas, pick one and watch it build, then ask "make it night" and apply the proposal. The copilot designs, explains and proposes, always through validated edit operations.

**Spec:**
- [`roadmap.md`](./roadmap.md) › Sprint 6
- [`docs/architecture.md`](../architecture.md) › Copilot, The contract, HTTP API
- `docs/design/screens.md` for `PNL-CHAT` (`TAB-CHAT`, `TAB-HISTORY`), `STA-WORLD-PROPOSAL`, `SCR-IDEAS`, `PNL-IDEAS`, `STA-WORLD-BUILDING`, `SCR-SETTINGS-MODELS`, and the home prompt
- the root, engine and desktop `AGENTS.md` files (product invariants: the copilot proposes, validation decides; provider-neutral by capability; real or nothing)

## Decisions

- **Connections.** One OpenAI-compatible endpoint and key (the settings screen has one endpoint and one key), and one model name per capability. Stored by the engine in `<settings dir>/models.json`, where the settings dir is `ICARUS_SETTINGS_DIR` or `~/.icarus`, never in the repo. The key never leaves the engine: answers carry only its last four characters. Environment fallback for development: `ICARUS_MODEL_ENDPOINT`, `ICARUS_MODEL_API_KEY`, `ICARUS_MODEL_REASONING`, `ICARUS_MODEL_VISION` (documented in `.env.example`). `reasoning` is required; the others are optional this sprint.
- **The client.** `copilot/client.py` is the only module that calls models: `POST {endpoint}/chat/completions` with `response_format: {type: "json_schema", json_schema: {name, schema, strict: true}}` built from the Pydantic output model. Parse and validate; on failure retry once, sending the validation error back; then raise a readable `CopilotError`. Reasoning text (a `reasoning_content` field or `<think>` blocks) is split from the answer and returned as `thinking`. Use `httpx` if it is already a dependency (FastAPI's test client brings it); otherwise justify adding it. Timeout 60 s.
- **The fake provider.** With `ICARUS_COPILOT_PROVIDER=fake` (the default in tests), the client answers from fixtures in `tests/copilot/fixtures/<role>/<name>.json`, picked by a keyword match on the last user text, with a default fixture per role. No network. Without a connection and outside tests, every copilot route answers 503 `not_connected` with "Connect a model in Settings › AI models to use the copilot."
- **Roles this sprint.**
  - **Architect.** `ideas(prompt) -> 3 DesignIdea`. The model picks a library template for each idea and returns customizing operations (names, colors, sizes, obstacles from library pieces). The engine applies each to a fresh template project in memory, compiles it and runs the design checks. An idea that fails is retried once with the error; if it still fails, it is dropped. Fewer than one valid idea is an error. The estimate is `default_steps / 2000 / 60` minutes (ADR 001). The first valid idea is recommended.
  - **Build.** `POST /builds` creates the project from the idea's template, applies its operations as one copilot revision, and runs the design checks. Steps, each marked done only when it really happened: "Reading the idea", "Building the world", "Building the body", "Setting the task", "Testing the physics". It runs in a background task; `GET /builds/{id}` is polled.
  - **Chat.** One structured output: `{answer, proposal?: {summary, explanation, operations}, suggestions: [≤3 short questions]}`. The context is the project summary (objects, components, property values), the relevant library entries, the selected object, the workspace, and the latest run's status and metrics if any. A proposal is validated by a dry run: apply the operations to a copy of the current project, compile, and run the design checks. Invalid output is retried once with the error, and otherwise answered in words without a proposal. In `autopilot` mode a valid proposal is applied at once.
  - **Guide.** The same chat role. When the user asks about the selection ("what does this do?"), the answer explains it from the library schema and the current values.
- **Numbers must exist.** `copilot/grounding.py`: every number in an answer with a decimal point or with value ≥ 10 must appear in the context facts or the user's text (after rounding to the precision shown). Otherwise the answer is rejected, retried once with the list of unsupported numbers, and then replaced with a plain sentence that the copilot could not back its answer with data.
- **Storage.** The conversation and its proposals live in `<projects dir>/.copilot/<project_id>.json` (atomic writes), never in the project document. A proposal becomes `outdated` when the project head moves past its base revision.
- **Proposal preview.** `GET /proposals/{id}/scene` returns the scene compiled with the proposal applied, so the viewport can draw the changed geoms in blue before Apply.
- **Routes.**
  - `GET /projects/{id}/conversation`
  - `POST /projects/{id}/conversation/messages` (SendMessage → Conversation)
  - `POST /projects/{id}/conversation/autonomy`
  - `POST /proposals/{id}/apply` (→ Conversation, with the applied revision)
  - `POST /proposals/{id}/discard`
  - `GET /proposals/{id}/scene`
  - `POST /ideas` (IdeaRequest → IdeaSet)
  - `GET /ideas/{id}`
  - `POST /builds` (BuildIdea → BuildStatus)
  - `GET /builds/{id}`
  - `GET /settings/models`, `PUT /settings/models`, `POST /settings/models/test` (a tiny real call; "connected" only if it answers)
- **The parking task must be learnable, not trivial.** Navigation `reset` places the agent at a seeded random start: ±1.5 m across, 0 to 2 m back, ±35° heading. A fixed seed is still deterministic, so evaluation seeds stay comparable. Measure again: 16 copies, 300k steps, and report the success rate per checkpoint. This is the sim zone, so the engine workstream owns it.

---

## Workstream A · Engine

1. **Sim fix** (above), with tests: different seeds give different starts; the same seed gives the same start; `check_env` still passes.
2. **`copilot/settings.py` and `copilot/client.py`**, with the fake provider and fixtures. Tests:
   - schema-constrained request body;
   - retry once with the validation error, then `CopilotError`;
   - thinking split;
   - the key never appears in `ModelSettings`;
   - 503 when not connected.
   - One `@pytest.mark.live` test calls the configured endpoint (not run without credentials).
3. **`copilot/context.py`** (project summary, library entries, run facts) and **`copilot/grounding.py`**, with tests for supported and unsupported numbers.
4. **`copilot/architect.py`** (ideas and build), with tests on fixtures: three compiled ideas with scenes; a fixture with a bad operation is retried and then dropped; the build creates a project whose head revision is authored by `copilot` and whose design checks pass.
5. **`copilot/chat.py` and `copilot/conversation_store.py`**, with tests:
   - "make it night" on the parking car gives a proposal that dims the light, validated;
   - apply creates a copilot revision;
   - discard;
   - an outdated proposal is refused with 409;
   - autopilot applies at once;
   - an answer citing a number that is not in the context is rejected.
6. **`api/copilot.py`, `api/ideas.py` and `api/model_settings.py`**, with TestClient tests on the fake provider.

Verify: `uv run ruff check`, `uv run ruff format --check`, `uv run pyright`, `uv run pytest -m "not slow and not live"`.

## Workstream B · Desktop

1. **`engine-client/`**: typed functions with structural checks for every route above.
2. **Ports on the engine**, with pure tested mappers:
   - `copilot-engine.ts` + `copilot-views.ts`: conversation key → project id from the navigation `project` param; proposals → `Proposal` view (changes, warnings, status); autonomy.
   - `ideas-engine.ts`: the latest idea set; `useIdea` starts a build and navigates to `STA-WORLD-BUILDING`.
   - `build-progress-engine.ts`: poll `GET /builds/{id}` every 500 ms until ready, then open `SCR-WORLD` with the new project.
   - The models part of `settings-engine.ts`.
   - Not this sprint: `attachFile`, and the `tweakIdea` and `mixAndBuild` ideas; they stay pending.
3. **Screens.**
   - The home prompt sends `POST /ideas` and opens `SCR-IDEAS` with the set id.
   - `SCR-IDEAS` shows the three ideas with their compiled scene previews (reuse `scene/scene-view.tsx`).
   - `STA-WORLD-BUILDING` shows real steps.
   - `PNL-CHAT` sends messages, shows answers, proposals with Apply and Discard, the thinking toggle, suggestion chips and the autonomy switch.
   - `STA-WORLD-PROPOSAL` draws the proposal scene's changed geoms with the `selected` (blue) material over the current scene.
   - `SCR-SETTINGS-MODELS` saves the endpoint and key and tests the connection.
   - A not-connected copilot shows a clear state that links to Settings › AI models.
   - Every view handles loading, empty, error and engine-unavailable states.

Verify: `pnpm -F desktop typecheck`, `pnpm -F desktop test`, Biome on changed files. Do not run `electron-vite build` or Playwright.

## Integration

- `pnpm gen:pending`, `pnpm check`.
- App end-to-end test `tests/app/copilot.e2e.ts`, with the engine on the fake provider (`ICARUS_COPILOT_PROVIDER=fake`):
  1. Type the prompt on home and see three ideas.
  2. Use one and watch the build steps finish.
  3. In World, ask "make it night", see the proposal, and apply it.
  4. A new revision by the copilot appears in history.
- The design suite; a whole-branch review; the fix pass; the PR.
