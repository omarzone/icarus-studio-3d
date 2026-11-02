# Sprint 7 · The coach: watching, fixing and accelerating training

**Goal:** the copilot does not stop at building. While a brain trains it watches the run, sees the episodes, understands why the brain is not learning, fixes the design and trains again, and it uses what it knows to make training faster than starting from zero each time. Contracts already landed: `contracts/coach.py` (`Diagnosis`, `AutopilotStart`, `AutopilotStatus`) and `WarmStart` on `StartRun`/`RunConfig`.

**Spec:** `VISION.md`; `docs/architecture.md` › Coach and autopilot, Training and the Training Timeline, Run store (`diagnosis/<n>.json`); `docs/plans/copilot-agent-harness.md` (the agent loop the coach reuses); `docs/design/screens.md` › `SCR-RESULTS`, `PNL-FAILURES`, `TAB-WHERE-IT-FAILS`, `MOD-AUTOPILOT`, `PNL-LEARNED`, Train chat coaching.

## How the coach sees a run

- **Numbers:** metrics per checkpoint (success, failure, return, episode length, every reward term) and the recommended budget.
- **Frames:** at every checkpoint the worker renders frames of the first evaluation episodes with `sim/views.py` (start, middle, end, and the moment of failure when there is one) and stores them as attachments of the run. The vision model reads them.
- **Failure groups:** evaluation episodes are grouped by how they end (fell early / fell late / timed out far from the goal / touched an obstacle / reached the goal) with their share and example frames. Groups come from the run's data, not from the model.

## What the coach does

- **Diagnose** (`POST /runs/{id}/diagnosis`, and automatically at checkpoints while an autopilot runs): an agent turn with the run tools plus `look_episode` (frames of a checkpoint's episode) that returns a `Diagnosis` grounded in the run's numbers. It recommends `keep_training`, `stop_and_fix` or `done` and, for `stop_and_fix`, a tested proposal (the usual `try` → `propose`).
- **Detect early what is not working** instead of waiting for the full budget: a run whose success and return have not improved over the last checkpoints, a brain that collects reward without succeeding (reward hacking: return rises while success stays at zero), episodes that end in the first second every time. These rules live in code (`training/progress_watch.py`) and trigger a diagnosis; the model explains and proposes.
- **Accelerate**, in this order of impact:
  1. **Warm start:** after a fix that keeps what the body senses and how it acts (rewards, world, randomization, goal placement), the next run continues from the best checkpoint of the previous one instead of from zero. The worker refuses a warm start whose observation or action size differs, and says so.
  2. **Stop early:** stop a run that the watch rules flag, and a run that already holds the goal success for three evaluations.
  3. **Curriculum:** when a task is too hard from zero, start easier (goal closer, fewer obstacles, no per-copy variation) and widen it as success rises, each step a revision plus a warm start.
  4. **Reward fixes** from the per-term breakdown and the frames (a term that dominates, a term the brain exploits, a missing penalty).
- **Autopilot** (`POST /projects/{id}/autopilot` with `AutopilotStart`, `GET` for `AutopilotStatus`, `DELETE` to stop): train → watch → diagnose → fix → retrain (warm start when allowed) → compare against the previous run on the same evaluation seeds → keep the best brain, until the goal success or the budget (iterations, minutes) runs out. In `ask` mode it stops at each proposal (`waiting_approval`) and continues when the person applies it; in `fix` mode it applies by itself. Every step posts a copilot message in the project's conversation with what it saw (frames), what it changed and buttons (Apply, Watch training, Compare runs, Stop autopilot).

## Desktop

- **Results (`SCR-RESULTS`)** on the engine: runs, best brain, comparison of two runs on the same seeds, learning history, failure groups with their frames (`PNL-FAILURES`, `TAB-WHERE-IT-FAILS`) and the diagnoses.
- **Autopilot (`MOD-AUTOPILOT`)**: mode, goal, iterations and minutes; status while it runs; a clear Stop.
- **Train**: the coach's messages appear in the Train chat as the run goes; a "Diagnose now" action.

## Done when

The parking car and the walker each go from a fresh project to their goal with the autopilot in `fix` mode, with fewer total steps than training from zero with the default budget, and every diagnosis cites only real numbers and frames. Measured and reported, real numbers only.
