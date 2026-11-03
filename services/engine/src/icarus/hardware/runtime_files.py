"""The README and the reference script template of a runtime package: data and text, never a binary."""

from typing import Any

from icarus.contracts.build import ExportBrain, HardwareCheck

RUN_POLICY = '''"""Reference loop to run an exported Icarus brain on a device. A template: fill in the two functions.

Needs Python 3.10+, numpy and onnxruntime (pip install numpy onnxruntime). Nothing here talks to hardware until you
write read_observation() and send_command() for your device.
"""

import json
import time
from pathlib import Path

import numpy as np
import onnxruntime

HERE = Path(__file__).parent
SPEC = json.loads((HERE / "brain.json").read_text(encoding="utf-8"))


def read_observation() -> np.ndarray:
    """One reading per entry of SPEC["inputs"], in that order and in the units and scale it states."""
    raise NotImplementedError("Read your sensors and estimates here")


def send_command(commands: np.ndarray) -> None:
    """One command per entry of SPEC["outputs"], already scaled to its low..high range and unit."""
    raise NotImplementedError("Drive your motors here, with your own limits and stop switch")


def main() -> None:
    session = onnxruntime.InferenceSession(str(HERE / "brain.onnx"))
    low = np.array([output["low"] for output in SPEC["outputs"]], dtype=np.float32)
    high = np.array([output["high"] for output in SPEC["outputs"]], dtype=np.float32)
    period = 1.0 / SPEC["rate_hz"]
    while True:
        started = time.monotonic()
        observation = read_observation().astype(np.float32).reshape(1, -1)
        (action,) = session.run([SPEC["output"]["name"]], {SPEC["input"]["name"]: observation})
        send_command(low + (np.clip(action[0], -1.0, 1.0) + 1.0) / 2.0 * (high - low))
        time.sleep(max(0.0, period - (time.monotonic() - started)))


if __name__ == "__main__":
    main()
'''


def _hardware(check: HardwareCheck) -> list[str]:
    lines = [
        "## Hardware check",
        "",
        f"Checked against **{check.kit.name}** (runs on {check.kit.board}). Verdict: **{check.verdict}**.",
    ]
    if check.measured_from:
        lines.append(f"Motor needs were measured with the trained brain: {check.measured_from}.")
    else:
        lines.append("No trained brain was measured: motor needs are the design's limits.")
    lines += ["", "| Part | Kit part | Status | Gap |", "|---|---|---|---|"]
    lines += [f"| {row.part} | {row.hardware or 'none'} | {row.status} | {row.gap} |" for row in check.rows]
    return lines


def readme(
    project_name: str,
    revision: int,
    files: list[tuple[str, str]],
    brain: ExportBrain | None,
    spec: dict[str, Any] | None,
    check: HardwareCheck | None,
    notes: list[str],
) -> str:
    lines = [
        f"# {project_name}, revision {revision}",
        "",
        "Exported by Icarus Studio 3D. Everything here comes from the project and its runs; nothing was hand-made.",
        "",
        "## Files",
        "",
        *[f"- `{path}`: {description}" for path, description in files],
        "",
    ]
    if brain is not None and spec is not None:
        estimated = [item["label"] for item in spec["inputs"] if item["source"] == "estimate"]
        lines += [
            "## Running the brain",
            "",
            f"The brain is {brain.run_name} at step {brain.step:,}. It reads {brain.inputs} numbers and returns "
            f"{brain.outputs} actions in -1..1, {brain.rate_hz:g} times a second. `brain.json` lists each input and "
            "output with its meaning, unit and range; `command = low + (action + 1) / 2 * (high - low)`.",
            "",
            "`run_policy.py` is a reference loop: write `read_observation()` and `send_command()` for your device, "
            "then run it with `python run_policy.py`.",
            "",
        ]
        if estimated:
            lines += [
                "Inputs the simulator gave exactly, which your device must estimate itself: "
                + ", ".join(estimated)
                + ".",
                "",
            ]
    else:
        lines += ["## Running the brain", "", "This export has no trained brain: train one, then export again.", ""]
    lines += [
        "## Simulation and reality",
        "",
        "The brain learned in MuJoCo. Real motors have backlash, delay and heat; real sensors are noisy and late; "
        "friction and masses differ. Start slow, limit torque and speed, keep a stop switch in reach, and expect to "
        "train again with more variation if the device behaves differently.",
        "",
    ]
    if check is not None:
        lines += [*_hardware(check), ""]
    if notes:
        lines += ["## Notes", "", *[f"- {note}" for note in notes], ""]
    return "\n".join(lines)
