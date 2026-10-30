# 001 · Default training budget for navigation on CPU

**Context.** Training must work on CPU-only machines, and the first experience of Icarus is a car learning to park. We measured a throwaway parking task before building the trainer: a small car with 8 distance rays, speed, steering and the goal in the car frame (15 observations), a lot with 6 spots and 5 randomly parked cars, reward from getting closer, +10 for parking (within 0.15 m, 20° and 0.05 m/s), −1 and termination on contact, −0.01 per step, 20 Hz control, 30 s episodes. PPO from Stable-Baselines3, separate policy and value networks of 2 × 256 tanh, lr 3e-4, 1024 steps per environment, batch 2048, 10 epochs, γ 0.99, GAE 0.95, on a 6-core, 12-thread desktop CPU without a GPU.

**Decision.** Navigation tasks default to **1M steps with 16 parallel copies** (about 8–10 minutes), with a *polish* option of 3M steps (about 25 minutes) and early stopping when evaluation success holds for 3 evaluations. Evaluation runs every 100k steps on 50 fixed seeds.

**Consequences.** A first trained car is a coffee break, not an overnight job, so the copilot loop (train, diagnose, fix, retrain) fits in a single session. PPO updates, not physics, take most of the time, so more than 16 copies does not help on this class of CPU. The measured task is forgiving (both parking directions count, wide gaps, instant braking); stricter tasks and other families need their own measurement before their defaults are set.

## Measurements

Throughput, environment steps per second:

| Parallel copies | Physics only | PPO end to end |
|---|---|---|
| 8 | 4,363 | 1,642 |
| 12 | 4,897 | 1,801 |
| 16 | 4,817 | 2,182 |

Learning, 16 copies, deterministic policy on 50 fixed seeds (one training seed):

| Steps | Wall time | Parks | Collides |
|---|---|---|---|
| 100k | 1.3 min | 4% | 58% |
| 300k | 3.0 min | 40% | 54% |
| 400k | 3.8 min | 76% | 20% |
| 600k | 5.4 min | 90% | 10% |
| 1M | 8.8 min | 90% | 8% |
| 2.5M | 20.5 min | 96% | 4% |
