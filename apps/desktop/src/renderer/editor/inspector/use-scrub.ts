import { type PointerEvent, useRef } from "react";
import type { Property, PropertyValue } from "../../ports/scene-port.ts";

type ScrubHandlers = {
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove?: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp?: (event: PointerEvent<HTMLElement>) => void;
};

// Dragging a numeric property's name left or right changes it, like in Blender; Shift for fine steps.
export function useScrub(property: Property, onChange: (value: PropertyValue) => void): ScrubHandlers {
  const start = useRef<{ x: number; value: number } | null>(null);
  const next = useRef<number | null>(null);
  if (
    property.state === "locked" ||
    (property.type !== "slider" && property.type !== "number" && property.type !== "count")
  ) {
    return {};
  }
  const step = property.type === "slider" ? property.step : property.type === "count" ? 1 : 0.1;
  const clamp = (value: number) =>
    property.type === "number" ? value : Math.min(property.max, Math.max(property.min, value));
  return {
    onPointerDown: (event) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      start.current = { x: event.clientX, value: property.value };
    },
    onPointerMove: (event) => {
      if (!start.current) {
        return;
      }
      const pixels = event.shiftKey ? 20 : 4;
      const steps = Math.round((event.clientX - start.current.x) / pixels);
      next.current = clamp(Number((start.current.value + steps * step).toFixed(6)));
    },
    // One edit per scrub, sent when the pointer is released.
    onPointerUp: () => {
      if (next.current !== null && next.current !== property.value) {
        onChange({ ...property, value: next.current });
      }
      start.current = null;
      next.current = null;
    },
  };
}
