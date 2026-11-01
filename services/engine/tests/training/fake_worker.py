"""A stand-in for the training worker: writes run files the way the real one does, without training."""

import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

from icarus.contracts.training import LogLine, MetricPoint, Rollout, TrainingSnapshot
from icarus.training.lifeline import watch_parent
from icarus.training.run_store import RunFolder

LIMIT = 120.0
LINGER = 5.0


def main() -> int:
    folder, mode = RunFolder(Path(sys.argv[1])), sys.argv[2]
    watch_parent(folder, grace=float(sys.argv[3]) if len(sys.argv) > 3 else LIMIT)
    status = folder.stored_status()
    folder.write_status(status.model_copy(update={"state": "running", "step": 0}))
    folder.append_log(LogLine(elapsed=0.0, level="info", text="Fake training started"))
    folder.write_rollout(
        Rollout(step=0, seed=10_000, geoms=["car"], frames=[], episode_return=0, outcome="Time ran out")
    )
    folder.append_metric(
        MetricPoint(kind="eval", step=0, elapsed=0.1, episode_return=0, episode_length=600, reward_terms={})
    )
    folder.write_snapshot(TrainingSnapshot(step=0, geoms=["car"], copies=[]))
    if mode == "crash":
        print("Fake worker crashed on purpose", file=sys.stderr)
        return 3
    if mode == "linger":
        # Ends its run, then takes a while to exit, like a worker closing its environment copies.
        done = folder.stored_status().model_copy(update={"state": "done", "finished_at": datetime.now(UTC)})
        folder.write_status(done)
        time.sleep(LINGER)
        return 0
    if mode == "ignore":
        child = subprocess.Popen([sys.executable, "-c", f"import time; time.sleep({LIMIT})"])
        (folder.path / "child.pid").write_text(str(child.pid), encoding="utf-8")
    started = time.monotonic()
    while time.monotonic() - started < LIMIT:
        if mode == "obey" and folder.stop_requested():
            final = folder.stored_status().model_copy(
                update={"state": "stopped", "step": 2048, "best_step": 0, "finished_at": datetime.now(UTC)}
            )
            folder.write_status(final)
            return 0
        time.sleep(0.02)
    return 0


if __name__ == "__main__":
    sys.exit(main())
