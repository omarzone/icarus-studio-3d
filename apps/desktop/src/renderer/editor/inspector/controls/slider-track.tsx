import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import { Act } from "../../../app/navigation/go-to.tsx";
import type { ControlTone } from "./value-field.tsx";

const fill: Record<ControlTone, string> = {
  default: "bg-fg",
  proposed: "bg-proposal",
  danger: "bg-danger-graphic",
};

const clamp = (ratio: number) => Math.min(1, Math.max(0, ratio));

const percent = (ratio: number) => `${clamp(ratio) * 100}%`;

function ratioAt(track: HTMLElement, event: PointerEvent): number {
  const box = track.getBoundingClientRect();
  return clamp((event.clientX - box.left) / box.width);
}

type ThumbProps = {
  label: string;
  ratio: number;
  tone: ControlTone;
  valueText: string;
  onRatio: (ratio: number) => void;
  // Keyboard step as a share of the track.
  step: number;
};

function Thumb({ label, ratio, tone, valueText, onRatio, step }: ThumbProps) {
  const onKeyDown = (event: KeyboardEvent) => {
    const delta =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? step
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -step
          : 0;
    if (delta !== 0) {
      event.preventDefault();
      onRatio(clamp(ratio + delta));
    }
  };
  return (
    <Act
      cta={label}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamp(ratio) * 100)}
      aria-valuetext={valueText}
      onKeyDown={onKeyDown}
      style={{ left: percent(ratio) }}
      className={`absolute -top-1.25 -ml-1.75 size-3.5 rounded-full ring-3 ring-panel hover:opacity-90 ${fill[tone]}`}
    />
  );
}

type SliderProps = Omit<ThumbProps, "onRatio"> & { onChange: (ratio: number) => void };

// Slider from the inspector: 4 px track, white fill and thumb; click or drag anywhere on it.
export function SliderTrack({ label, ratio, tone, valueText, onChange, step }: SliderProps) {
  const track = useRef<HTMLDivElement>(null);
  // While dragging, the slider shows where the pointer is; the value is committed once, on release.
  const [dragging, setDragging] = useState<number | null>(null);
  const follow = (event: PointerEvent<HTMLDivElement>) => {
    if (track.current && event.buttons === 1) {
      setDragging(ratioAt(track.current, event));
    }
  };
  const shown = dragging ?? ratio;
  return (
    <div
      ref={track}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        follow(event);
      }}
      onPointerMove={follow}
      onPointerUp={() => {
        if (dragging !== null) {
          onChange(dragging);
        }
        setDragging(null);
      }}
      onPointerCancel={() => setDragging(null)}
      className="relative h-1 min-w-0 flex-1 rounded-bar bg-control-raised"
    >
      <span className={`block h-1 rounded-bar ${fill[tone]}`} style={{ width: percent(shown) }} />
      <Thumb label={label} ratio={shown} tone={tone} valueText={valueText} onRatio={onChange} step={step} />
    </div>
  );
}

type RangeProps = {
  label: string;
  low: number;
  high: number;
  lowText: string;
  highText: string;
  tone: ControlTone;
  step: number;
  onChange: (low: number, high: number) => void;
};

// Range from the inspector: one track with two thumbs and their values underneath.
export function RangeTrack({ label, low, high, lowText, highText, tone, step, onChange }: RangeProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="relative mx-1.75 mt-1.5 h-1 rounded-bar bg-control-raised">
        <span
          className={`absolute h-1 rounded-bar ${fill[tone]}`}
          style={{ left: percent(low), width: percent(high - low) }}
        />
        <Thumb
          label={`${label} from`}
          ratio={low}
          tone={tone}
          valueText={lowText}
          step={step}
          onRatio={(ratio) => onChange(Math.min(ratio, high), high)}
        />
        <Thumb
          label={`${label} to`}
          ratio={high}
          tone={tone}
          valueText={highText}
          step={step}
          onRatio={(ratio) => onChange(low, Math.max(ratio, low))}
        />
      </div>
      <span className="flex justify-between font-mono text-micro text-fg-secondary">
        <span>{lowText}</span>
        <span>{highText}</span>
      </span>
    </div>
  );
}
