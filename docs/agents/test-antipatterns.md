# Test anti-patterns

A test is worth having if it fails when behavior breaks and passes when it works. Avoid:

1. **Tests without real assertions:** they only call the function, or assert `is not None`.
2. **Tests of the mock:** if the result depends only on what the mock returns, nothing is tested.
3. **Tests that reimplement the logic:** computing the expected value with the same algorithm as the code.
4. **Real-time waits** (`sleep`) for synchronization: use events, bounded polling or injected clocks.
5. **Production code added only for tests** (flags, public getters). Test through the real interface.
6. **Huge snapshots** nobody reviews: assert the properties that matter.
7. **Non-deterministic tests:** no fixed seed, network access, or order dependence.
8. **PPO tests expecting the robot to "learn"** in a smoke test. The smoke test verifies the pipeline runs and saves a checkpoint, a rollout and well-formed metrics. Learning is judged on real runs, not in CI.

## Worth testing here

- Edit operations: unknown library ids, out-of-range values, dangling references and extra fields → rejected; undo and redo restore exact documents.
- Design tests: a body that explodes, a joint with no actuator effect or a part outside its hardware profile → a `DesignReport` with a readable reason.
- Gymnasium env: `check_env` passes; reset with the same seed → same observation; terminations fire when they should.
- Reward composition: each library term returns the documented value on hand-built states.
- Scene export: bodies and geoms match the `MjModel`.
- Rollout: same seed and checkpoint → same rollout.
- Copilot with the `fake` provider: invalid JSON → retry → readable error; proposals become operations that pass validation.
- Coach: a diagnosis citing a number that is not in the run → rejected.
- Bundles: tampered checksums, unknown library versions or embedded code → rejected on import.
- Desktop: operation building from gizmo edits, coordinate conversion, player interpolation and SSE parsing.
