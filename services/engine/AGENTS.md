# AGENTS.md — services/engine (Python)

Inherits everything from `/AGENTS.md`. This file covers only what is specific to the engine.

## Stack and commands

Python 3.12 pinned by uv (never use the system Python). FastAPI · Pydantic v2 · MuJoCo · Gymnasium · Stable-Baselines3 · PyTorch · ONNX.

| What | Command (from `services/engine`) |
|---|---|
| Install | `uv sync` |
| Dev API | `uv run icarus-engine --reload` |
| Full check | `uv run ruff check && uv run ruff format --check && uv run pyright && uv run pytest -m "not slow and not live"` |
| Real PPO smoke | `uv run pytest -m slow` |
| Train manually | `uv run python -m icarus.training.worker runs/<id>` |

Add dependencies with `uv add`, never `pip install`. Justify any new dependency in your report.

## Module map

| Module | Responsibility | Does not |
|---|---|---|
| `contracts/` | Pydantic models that cross boundaries | contain logic |
| `library/` | Parts, joints, actuators, sensors, surfaces, reward terms, brain templates, hardware components | read user input |
| `projects/` | Project store, revision log, applying and validating `EditOperation`s | compile physics |
| `design/` | Spec → MJCF compiler, design tests, `DesignReport` | train |
| `copilot/` | Model client per capability, roles (architect, coach, motion, builder, artist, guide), prompts | write project data except through operations |
| `experiments/` | Run store (`runs/<id>/`), subprocess runner, autopilot loop | train in-process |
| `sim/` | Gymnasium envs from compiled projects, reward composition, randomization, offscreen render, scene export | know about PPO |
| `training/` | Worker, PPO, imitation, checkpoints, evaluation, rollouts | serve HTTP |
| `motion/` | Pose extraction calls, retargeting, motion clips, animation export | train |
| `hardware/` | Hardware profiles, parts lists, URDF/MJCF/ONNX export, runtime package | talk to physical devices during tests |
| `bundles/` | Pack, unpack and validate shareable bundles | execute bundle content |
| `api/` | Thin routers: parse, delegate, respond | contain business logic |

## Rules

- **Library first.** A new kind of part, sensor, reward term or task family is added to `library/` with ranges, documentation and a test, never invented inside a single project or prompt.
- **Operations are the only writer.** Project documents change only through `projects/` applying `EditOperation`s; every applied batch is validated, compiled and design-tested before it becomes a revision.
- **Atomic writes** for `status.json`, project documents and `rollouts/*.json` (write to `.tmp`, then `os.replace`). `metrics.jsonl` and revision logs are append-only.
- **Reproducibility:** every run freezes its project revision, seed, library versions and git sha. Evaluations use fixed seeds.
- **Units:** SI throughout the engine (m, kg, rad, s). Quaternions are **wxyz** (MuJoCo convention); conversion to Three.js (xyzw, Y-up) happens only in the desktop app.
- **Device:** CPU by default with an explicit `device="cpu"` in PPO. Use a GPU only when detected, and never let results depend on it.
- **Parallelism:** `SubprocVecEnv` with `n_envs` from the brain spec, capped below the machine's logical core count.
- **Reward:** composed only from library reward terms. Changing a term's implementation bumps its version; older runs are no longer comparable.
- **Copilot:** always request `response_format` with the target Pydantic model's JSON Schema. Validate, retry **once** passing the error, then return a readable error. Split model reasoning from the final answer in the client, not in each caller. Numbers cited about a run must exist in that run's data.
- **Windows:** `if __name__ == "__main__":` is mandatory in entrypoints that use `SubprocVecEnv` (spawn start method). Use `pathlib` for paths.
- **Headless:** never open the MuJoCo viewer in tests or in the worker; use offscreen rendering.

## Traps that already cost us

*(Fill in as we go: symptom → cause → rule.)*
