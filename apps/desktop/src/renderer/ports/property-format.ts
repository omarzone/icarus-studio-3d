import type { PropertyValue } from "./scene-port.ts";

function decimalsOf(step: number): number {
  const text = String(step);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

function withUnit(text: string, unit: string | undefined): string {
  if (!unit) {
    return text;
  }
  return unit === "°" ? `${text}°` : `${text} ${unit}`;
}

export function formatTime(hours: number): string {
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  return `${String(whole).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function formatNumber(value: number, step: number, unit?: string): string {
  return withUnit(value.toFixed(decimalsOf(step)), unit);
}

// Text of a property value as the inspector shows it; also used for "was …" and copilot diffs.
export function formatPropertyValue(value: PropertyValue): string {
  switch (value.type) {
    case "number":
      return withUnit(String(value.value), value.unit);
    case "slider":
      return value.format === "time" ? formatTime(value.value) : formatNumber(value.value, value.step, value.unit);
    case "range":
      return `${withUnit(String(value.low), value.unit)} … ${withUnit(String(value.high), value.unit)}`;
    case "choice":
    case "list":
    case "color":
    case "asset":
    case "panel":
    case "readonly":
      return value.value;
    case "switch":
      return value.value ? "on" : "off";
    case "vector":
      return value.value.map((part) => withUnit(String(part), value.unit)).join(", ");
    case "count":
      return String(value.value);
  }
}
