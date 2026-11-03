import type { SceneDisplay } from "@icarus/contracts";

// What a display shows for the value the engine reported; the view formats, it never makes a value up.

export const NO_VALUE = "--";

type Shown = Pick<SceneDisplay, "source" | "format"> & Partial<Pick<SceneDisplay, "decimals" | "label" | "text">>;

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  return `${String(minutes).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

function formatted(display: Shown, value: number): string {
  switch (display.format) {
    case "integer":
      return String(Math.round(value));
    case "decimal":
      return value.toFixed(Math.min(3, Math.max(0, display.decimals ?? 0)));
    case "time":
      return clock(value);
    case "text":
      return String(value);
  }
}

// The panel's text: a fixed display shows its own text, any other the engine's value or "--" while there is none.
export function displayText(display: Shown, value: number | null | undefined): string {
  const body =
    display.source === "fixed"
      ? (display.text ?? "")
      : value === null || value === undefined
        ? NO_VALUE
        : formatted(display, value);
  return display.label ? `${display.label} ${body}` : body;
}

// How full a bar display is, 0 to 1; empty while the engine reports no value.
export function barFill(value: number | null | undefined, fullScale: number): number {
  if (value === null || value === undefined || fullScale <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, value / fullScale));
}
