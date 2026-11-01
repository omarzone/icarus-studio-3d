import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import { Act } from "../../app/navigation/go-to.tsx";

const clamp = (ratio: number) => Math.min(1, Math.max(0, ratio));

type Props = {
  label: string;
  // Fill and thumb color class, from the meaning of the value (white by default).
  fill?: string;
  ratio: number;
  valueText: string;
  onRatio: (ratio: number) => void;
};

// Slider with a 6 px track and a 14 px thumb; drag, click or use the arrow keys.
export function ValueSlider({ label, fill = "bg-fg", ratio, valueText, onRatio }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const drag = (event: PointerEvent<HTMLDivElement>) => {
    const box = track.current?.getBoundingClientRect();
    if (box && event.buttons === 1) {
      onRatio(clamp((event.clientX - box.left) / box.width));
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const delta = event.key === "ArrowRight" ? 0.05 : event.key === "ArrowLeft" ? -0.05 : 0;
    if (delta !== 0) {
      event.preventDefault();
      onRatio(clamp(ratio + delta));
    }
  };
  const left = `${clamp(ratio) * 100}%`;
  return (
    <div
      ref={track}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag(event);
      }}
      onPointerMove={drag}
      className="relative h-1.5 rounded-bar bg-control-raised"
    >
      <span className={`block h-1.5 rounded-bar ${fill}`} style={{ width: left }} />
      <Act
        cta={label}
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamp(ratio) * 100)}
        aria-valuetext={valueText}
        onKeyDown={onKeyDown}
        style={{ left }}
        className={`absolute -top-1 -ml-1.75 size-3.5 rounded-full hover:opacity-90 active:opacity-80 ${fill}`}
      />
    </div>
  );
}
