# AGENTS.md

Icarus Studio 3D is a 3D studio for embodied AI: an Electron editor and a local Python engine where an AI copilot designs worlds, bodies, rewards and brains from a conversation, trains them with reinforcement learning on MuJoCo, diagnoses what went wrong and fixes it, with an online community for sharing creations. Product truth lives in [`VISION.md`](./VISION.md); how it is built lives in [`docs/architecture.md`](./docs/architecture.md). Folders with their own `AGENTS.md` add rules for that folder: read it before changing anything there.

# Useful Commands

- **Before handoff**: `pnpm check` (Biome, TypeScript, Vitest, file-size warnings, contract staleness, ruff, pyright, pytest without `slow`/`live`)
- **Install**: `pnpm install && pnpm engine:sync`
- **Dev**: `pnpm dev` (desktop app + engine); engine only: `pnpm engine:dev`
- **Contracts**: `pnpm gen:contracts` after any change in `services/engine/src/icarus/contracts/`
- **Slow tests** (short real training): `pnpm engine:test:slow`
- **Live tests** (real model providers, need credentials): `pnpm engine:test:live`

# Ensure main is always green

Never break `main`: it always passes `pnpm check`. Do not commit, push or merge unless a maintainer asks. Review `git status` and the staged diff before every commit; never commit `.env` files, credentials, `runs/` output or personal data.

# Product Invariants

- **Real or nothing.** Every metric, curve, checkpoint, rollout and analysis must come from a real run in `runs/`. Never hardcode demo data, hand-animate behavior or describe a result that was not produced. Anything that did not run is reported as "not run".
- **MuJoCo is the only physical truth.** The renderer replays states the engine computed; it never simulates, corrects or extrapolates physics.
- **The copilot is the product, not a feature.** New capabilities should be reachable by talking to the copilot as well as through the editor. A feature that only works by hand is incomplete.
- **One edit model.** Projects change only through `EditOperation`s applied by `services/engine/src/icarus/projects/`. The editor and the copilot emit the same operations; never add a second path that writes project data.
- **The copilot proposes, validation decides.** All model calls go through `services/engine/src/icarus/copilot/client.py`. Model output only reaches a project as validated edit operations built from the library, and never reaches the simulator directly. Never execute code, paths or commands produced by a model.
- **Generated designs are physically tested.** Every revision is compiled and passes the design tests in `icarus/design/` before it is shown or trained.
- **Provider-neutral by capability.** Models are configured per capability (`reasoning`, `vision`, `image`, `pose`) through OpenAI-compatible connections. Never add provider-specific SDKs or environment variables when the generic connection can express the behavior.
- **Frontends express intent and render state.** The engine owns validation, orchestration, training, storage and model calls. The API process never trains; the worker subprocess does.
- **Reproducible runs.** Every run freezes its project revision, seed, versions and git revision. Changing a reward or environment creates a new revision instead of silently altering old results.
- **Bundles carry data, never code.** Anything shared through the community is validated on import against the library and contract versions.
- **Scope follows `VISION.md`.** If a change does not strengthen worlds, bodies, brains or projects, propose it in your report instead of building it.

# Contracts and Zones

The contract is defined once in `services/engine/src/icarus/contracts/` and generated into `packages/contracts/src/generated.ts`. Never edit generated files. A contract change is its own task: land it first, regenerate, and only then let other zones consume it.

Each task works inside one zone (see "Working in parallel" in `docs/architecture.md`). If a task needs changes in another zone, stop and report it instead of making them.

# Code Style

## Reuse Before Reimplementing

Before writing new logic at any scale, check whether something in the repo already does the job. Extend it instead of building a parallel version.

## Avoid Comments

- Only when the code cannot describe itself
- One line, the why and not the how

## File and Module Naming

Never use `utils`, `helpers`, `common`, `misc` or `manager` for files, folders or modules. Name files after the domain concept they contain (`rollout-player.ts`, `reward_spec.py`). Reaching for a vague name usually means the file has more than one responsibility.

## No Speculative Abstractions

Add an interface only when it protects a real boundary (language model, engine ↔ desktop, file formats). Remove unused flexibility.

## File Size

Keep files small enough to read in one sitting. These are guidelines, not hard limits, counting code lines only (no blanks or comments):

| Files | Aim for at most |
|---|---|
| `*.ts` | ~300 |
| `*.tsx` | ~400 |
| `*.py` | ~400 |
| Tests (`*.test.ts(x)`, `test_*.py`) | ~800 |

When a file grows past its guideline, it usually has more than one responsibility: split it by concept (a component and its hooks, a compiler and its validators) instead of letting it keep growing. If it is genuinely one concept, leave it and say why in your report. `pnpm check:max-lines` lists oversized files as warnings; it does not fail the check. Generated files are exempt.

## TypeScript

- Strict mode with `noUncheckedIndexedAccess`. No `any`. No type assertions except `as const`; an unavoidable cast needs a line-specific `// SAFETY:` explanation.
- Use `type`, not `interface`. Use top-level `import type`, never inline type imports.
- `switch` over a union is exhaustive without a `default` branch, so adding a variant breaks the build where it must be handled.
- Always use braces, no `else` after `return`, template literals over string concatenation.
- Heavy or rarely used modules load with dynamic `import()` at the point of use, never at app startup.
- Validate untrusted data at the boundary (engine responses, community downloads, files) with the generated contract types and a runtime check; trust types only after that.

## Dependencies

- Add a dependency only when it removes real work and comes from a reputable, maintained source. Prefer the platform, the standard library or what the repo already uses.
- Every new dependency is named and justified in the task report or PR: what it does, why the existing stack cannot, and its size.
- pnpm installs only versions published at least three days ago (`minimumReleaseAge`), and only allowlisted packages may run install scripts (`allowBuilds`).
- Python dependencies are added with `uv add` and pinned in `uv.lock`; never `pip install`.
- shadcn components come only from the official registry.

## Python

Fully typed (pyright `standard`). Pydantic v2 with `extra="forbid"` on every model that crosses a boundary. `pathlib` for paths.

## UI

Use the design tokens through semantic Tailwind and shadcn classes; no hex values or off-scale sizes in components. Interface labels are generic; only project data names examples. Add shadcn components only from the official registry. Every view that queries the engine handles loading, empty, error and engine-unavailable states.

# Electron UI Validation

Never steal focus or reveal windows from automated tasks: no `show()`, `focus()` or OS activation in tests or agent-launched apps. Validate rendered UI with Playwright screenshots of hidden windows, or ask a maintainer to look.

# Tests

Tests are deterministic and offline by default: the copilot uses the `fake` provider with fixtures, seeds are fixed and nothing touches the network. Tests that need credentials are marked `live`; long training tests are marked `slow`. A skipped test is reported as not run, never as passed. Read [`docs/agents/test-antipatterns.md`](./docs/agents/test-antipatterns.md) before adding tests, and do not add low-value ones.

# First Class Citizens

## Cross-Platform Support

Support Windows, macOS and Linux. Use `pathlib`/`path` APIs, never hand-built path strings. Python entrypoints that spawn subprocess environments need an `if __name__ == "__main__":` guard because Windows uses the spawn start method.

## CPU-Only Machines

Training must work on CPU without CUDA. Never assume a GPU; use one only when it is detected and results do not depend on it.

# Git

Branches are `feat/<zone>-<topic>` or `fix/<zone>-<topic>`, one worktree per branch when tasks run in parallel. Commits follow Conventional Commits (`feat(sim): add slope range to ice world`).

Commit messages, PR descriptions and issues are public. Never include local paths, usernames, machine names, account emails, API key ids or anything that identifies a person or machine; describe test results in words instead of pasting raw tool output.

PR descriptions use `## What` (plain-language summary), `## Why` (the product reason), `## Changes` (behavior and decisions, at most about eight bullets), `## Risk` (only when there is one) and `## Tested` (what kinds of tests ran and what was not tested), in under about 350 words. UI changes include a screenshot.

When a review asks for more code to support something speculative, unrun or out of scope, remove it instead. Flag any change a PR does not mention: new dependencies, environment variables, providers or edits to shared tooling.

Every task ends with a report: **What** (at most five bullets), **Why**, **How it was verified** (real commands and their results), **Risks and follow-ups**.

# Read This When

| If you are about to… | Read |
|---|---|
| Change the Python engine | [`services/engine/AGENTS.md`](./services/engine/AGENTS.md) |
| Change the desktop app | [`apps/desktop/AGENTS.md`](./apps/desktop/AGENTS.md) |
| Change the contract, edit operations or the copilot | `docs/architecture.md`, sections "Core idea", "The contract" and "Copilot" |
| Add a part, sensor, reward term or task family | `docs/architecture.md`, sections "Library" and "Simulation" |
| Write tests | [`docs/agents/test-antipatterns.md`](./docs/agents/test-antipatterns.md) |
| Add or change a screen, dialog, panel or tab | [`docs/design/screens.md`](./docs/design/screens.md) (find or add its ID first) |
| Style any UI | [`docs/design/STYLEGUIDE.md`](./docs/design/STYLEGUIDE.md) and [`docs/design/tokens.md`](./docs/design/tokens.md) |
| Make an architecture decision | Add an ADR in `docs/decisions/NNN-title.md`: context, decision, consequences, at most ten lines |
