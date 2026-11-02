# Sprint 5 · Training and the Training Timeline Implementation Plan

> **For agentic workers:** two workstreams run in parallel, one per zone: engine (`training`, `experiments`, `engine-api`, `sim`) and desktop. Both start from the training contracts already on this branch (`services/engine/src/icarus/contracts/training.py`, generated into `@icarus/contracts`). Never edit the contracts; report a missing field instead.

**Goal:** Train the parking car from zero on the CPU and watch it learn. The engine runs PPO in a worker subprocess with parallel copies, saves and evaluates checkpoints on a log-spaced schedule, records a rollout per checkpoint and streams status, metrics, checkpoints, live copies and log lines over server-sent events. The desktop starts a run, shows every copy training live, plots the metrics, replays any checkpoint, and stops a run while keeping the best brain. Play uses the best trained brain once one exists.

**Spec:**
- [`roadmap.md`](./roadmap.md) › Sprint 5
- [`docs/architecture.md`](../architecture.md) › Training and the Training Timeline, Run store, HTTP API, Processes
- [ADR 001](../decisions/001-cpu-training-budget.md) for defaults
- `docs/design/screens.md` for `MOD-START-TRAINING`, `SCR-TRAIN`, `PNL-RUNS`, `PNL-METRICS`, `TAB-LIVE-TRAINING`, `TAB-REPLAY`, `MOD-STOP-RUN`, `STA-TRAIN-FAILED`, `SCR-SETTINGS-TRAINING`
- the root, engine and desktop `AGENTS.md` files

## Decisions

- **Defaults.** Navigation: 1M steps, 16 copies. Locomotion: 2M steps, 16 copies (not measured yet; the start dialog says the estimate is rough). The estimate is `total_steps / 2000` seconds on 16 copies (ADR 001), scaled by copies below 16.
- **PPO.** Stable-Baselines3 PPO, `MlpPolicy` with separate policy and value nets of 2 × 256 tanh, lr 3e-4, `n_steps` 1024 per copy, batch 2048, 10 epochs, γ 0.99, GAE 0.95. `device="cpu"` unless the training settings allow the graphics card and torch detects CUDA. `torch.set_num_threads(threads)`.
- **Copies.** `SubprocVecEnv` of `ProjectEnv(project, randomize=True)` with seeds `seed + i`, wrapped in `VecMonitor`. One copy uses `DummyVecEnv`.
- **Checkpoints.** Schedule `0, 25k, 50k, 100k, 250k, 500k, 1M, 2.5M, 5M, …` up to `total_steps`, always including the last step. At each one the worker saves `checkpoints/<step>.zip`, runs `evaluation_episodes` deterministic episodes (default 20; ADR 001's 50 is for the final verdict and costs too much per checkpoint) on fixed seeds `10_000 + k` without randomization, writes `rollouts/<step>.json` from the first episode, appends an `eval` metric and updates `best_step` by success rate, then by return.
- **Live copies.** About every 0.5 s the worker writes `live.json` (a `TrainingSnapshot` of every copy's geom poses) atomically. The copies' poses come from the subprocess envs through `env_method`, so they are real states.
- **Stopping.** Stop writes `stop.request`. The worker finishes the current rollout, saves a final checkpoint at the current step (evaluated like the others), writes `stopped` and exits. If it does not exit within 60 s the supervisor kills the process tree. A worker exception writes `failed` with a plain reason and the last log lines; the last good checkpoint stays usable.
- **Pause** is a stop that keeps the run resumable later. Resume is not in this sprint; the dialog offers Stop only, and `training.pause` stays pending for a later sprint.
- **Reproducibility.** `run.json` (RunConfig), `project.json` (the frozen revision), `meta.json` (package versions of mujoco, gymnasium, stable-baselines3 and torch, the git revision when available, timestamps).
- **Processes.** The API never imports `stable_baselines3` or `torch`. `POST /projects/{id}/runs` spawns `python -m icarus.training.worker <run_dir>` as a subprocess. One run trains at a time; a second start answers 409 with a plain message. On engine shutdown the supervisor requests stop, waits, then kills.
- **Joint state.** Locomotion observations gain joint positions and velocities (sin/cos for hinges is not needed; raw angle and velocity), so walkers can learn. Navigation observations keep ADR 001's shape.
- **Play.** When a project has a stopped or done run of its current revision with a checkpoint, Play loads the best one and labels the brain `"Trained brain: <run name> at <step>"`. Loading happens in a thread; the API process may import SB3 there only, on the Play path, never on request paths.

---

## Workstream A · Engine

New dependency: `stable-baselines3` (`uv add stable-baselines3`), which brings `torch` (CPU wheels on Windows and Linux by default). The architecture names SB3 PPO.

1. **`training/schedule.py`.** `checkpoint_steps(total) -> list[int]`. Test: `checkpoint_steps(1_000_000) == [0, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000]`; `checkpoint_steps(300_000)` ends at 300_000.
2. **`training/run_store.py`.** Create, read and list runs under the runs folder (`ICARUS_RUNS_DIR`, default `<engine root>/runs`), atomic `status.json`, append-only `metrics.jsonl`, `checkpoints/`, `rollouts/`, `live.json`, `worker.log`, `stop.request`. Run ids are `run-<utc timestamp>-<4 hex>`; names are "Run N" per project. Tests for round trips and listing by project.
3. **`training/evaluation.py`.** Deterministic evaluation and rollout recording with any `Policy`. Test with `RandomPolicy`: same seeds give the same returns; the rollout has one frame per control step and the outcome sentence.
4. **`training/worker.py`.** The PPO loop with an SB3 callback that writes train metrics every rollout (mean episode return, length, success and failure rates from env infos, mean reward terms from infos, steps per second), checkpoints by schedule, live snapshots, log lines, and honours `stop.request`. `if __name__ == "__main__":` guard. Slow test (`@pytest.mark.slow`): 20k steps with 2 copies on the parking car produces checkpoints 0 and 20k, two rollouts, eval metrics and `done`. Fast test: a stop request before the first rollout ends the run `stopped` with a final checkpoint (use a tiny `n_steps` through a test-only config).
5. **`training/supervisor.py`.** Start, stop, kill the process tree (psutil if already a dependency, otherwise `subprocess` plus `taskkill /T` on Windows and process groups elsewhere), detect a dead worker and mark the run failed. Shutdown hook in the app lifespan.
6. **`api/runs.py`.** `POST /projects/{id}/runs` (StartRun → RunStatus), `GET /projects/{id}/runs` (list[RunStatus], newest first), `GET /runs/{id}`, `POST /runs/{id}/stop`, `GET /runs/{id}/metrics` (list[MetricPoint]), `GET /runs/{id}/checkpoints` (list[CheckpointInfo]), `GET /runs/{id}/rollouts/{step}` (Rollout), `GET /runs/{id}/events` (SSE of `RunEventEnvelope` JSON: status on change, each new metric and checkpoint, snapshots at about 2 per second while running, log lines; it ends after a final status). `GET /settings/training`, `PUT /settings/training` (threads 1..cpu count, stored in a settings file next to the runs folder). Tests with TestClient and a fake worker that writes files.
7. **Play with a trained brain** (`sim/policy.py`: `CheckpointPolicy` from an SB3 zip) and joint state in locomotion observations, with tests.

Verify: `uv run ruff check`, `uv run ruff format --check`, `uv run pyright`, `uv run pytest -m "not slow and not live"`, and `uv run pytest -m slow -k training` once.

## Workstream B · Desktop

1. **`engine-client/`.** Typed functions for every run route and the settings routes, with structural checks, and `openRunEvents(runId, handlers)` over `EventSource` (inject the constructor for tests) that parses each `RunEventEnvelope`.
2. **`ports/training-engine.ts` and `ports/training-views.ts`.** Implement the existing `TrainingPort` on the engine with pure mappers: runs to `RunSummary` (status, progress, detail like "parks 71%"), metrics to `MetricSeries` (Return, Success, Failures, Episode length), reward terms to the breakdown, log lines to the console, the start plan from defaults and `StartRun`, the stop summary, the failure. Add a streaming function for the live view (snapshots, latest checkpoint) and replay (rollout by step). `getAutopilot` and `setAutopilot` stay pending (Sprint 7); `pauseRun` stays pending. Settings: `getTraining` and `setTraining` on the engine.
3. **Screens.** `MOD-START-TRAINING` starts a run and goes to `SCR-TRAIN`. `TAB-LIVE-TRAINING` draws every copy's poses in a grid (offset copies by their index; reuse `scene/scene-view.tsx` with poses). `TAB-REPLAY` plays a rollout with play, scrub and speed through a `RolloutPlayer` (pure, tested: time → frame). `PNL-METRICS` plots the series. `MOD-STOP-RUN` stops. `STA-TRAIN-FAILED` shows the failure. Every view handles loading, empty, error and engine-unavailable states.
4. **Header.** The primary action is Train before a run and Stop while one runs.

Verify: `pnpm -F desktop typecheck`, `pnpm -F desktop test`, Biome on changed files. Do not run `electron-vite build` or Playwright; integration does.

## Integration

- `pnpm gen:pending`, `pnpm check`.
- App end-to-end test `tests/app/train.e2e.ts`: create a parking car, start a run with 30k steps and 4 copies, see the live view and a metric, see checkpoint 0 and a later one in the timeline, open the replay, stop, and see the run stopped with its best brain.
- The design suite; a whole-branch review; the fix pass; the PR.
