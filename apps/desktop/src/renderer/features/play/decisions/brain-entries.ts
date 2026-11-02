import type { PlayBrain, PlayBrainPick } from "../../../ports/play-port.ts";
import type { MenuEntry } from "../../../ui/menu.tsx";

// One menu entry per trained brain: the one playing is checked, one that does not fit the body is dimmed with why.
export function brainEntries(
  brains: readonly PlayBrain[],
  playing: PlayBrainPick | undefined,
  choose: (brain: PlayBrainPick) => void,
): MenuEntry[] {
  return brains.map((brain) => ({
    label: brain.label,
    hint: brain.fits ? (brain.isDefault ? "Plays by default" : undefined) : brain.reason,
    checked: playing?.runId === brain.runId && playing.step === brain.step,
    disabled: !brain.fits,
    run: () => choose({ runId: brain.runId, step: brain.step }),
  }));
}
