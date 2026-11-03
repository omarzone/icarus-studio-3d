import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Act } from "../../../app/navigation/go-to.tsx";
import { useAnchoredStyle } from "../../../ui/anchored.ts";
import { useDismiss } from "../../../ui/dismiss.ts";
import { type Hsv, hexToHsv, hsvToHex, parseHex } from "./color-math.ts";
import { type ControlTone, ValueField } from "./value-field.tsx";

// Starting colors offered before any have been picked; they are values, not interface styling.
const PRESETS = ["#F5F5F5", "#1F1F1F", "#E5484D", "#F5A524", "#46A758", "#3E8ED0", "#8E4EC6", "#D6409F"];
const SWATCH_COUNT = 8;
const KEY_STEP = 0.02;
const HUE_STEP = 2;

// Colors picked in this session, newest first, shared by every color property.
let recent: string[] = [];

function remember(hex: string) {
  recent = [hex, ...recent.filter((color) => color !== hex)].slice(0, SWATCH_COUNT);
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function pointAt(area: HTMLElement, event: PointerEvent): { x: number; y: number } {
  const box = area.getBoundingClientRect();
  return { x: clamp01((event.clientX - box.left) / box.width), y: clamp01((event.clientY - box.top) / box.height) };
}

function arrowDelta(event: KeyboardEvent): { x: number; y: number } | null {
  const deltas: Record<string, { x: number; y: number }> = {
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
  };
  const delta = deltas[event.key];
  return delta ? { x: delta.x * (event.shiftKey ? 5 : 1), y: delta.y * (event.shiftKey ? 5 : 1) } : null;
}

// Follows the pointer while the button is held and reports once on release.
function useDrag(
  area: RefObject<HTMLDivElement | null>,
  onMove: (x: number, y: number) => void,
  onRelease: () => void,
) {
  const follow = (event: PointerEvent<HTMLDivElement>) => {
    if (area.current && event.buttons === 1) {
      const { x, y } = pointAt(area.current, event);
      onMove(x, y);
    }
  };
  return {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      follow(event);
    },
    onPointerMove: follow,
    onPointerUp: onRelease,
  };
}

type Props = {
  label: string;
  value: string;
  tone: ControlTone;
  // Receives "#RRGGBB" on release, on picking a swatch or hex, and on closing with an uncommitted change.
  onCommit: (hex: string) => void;
};

// Swatch that opens the color picker: saturation and value area, hue slider, hex field and swatches.
export function ColorPicker({ label, value, tone, onCommit }: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const hueTrack = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Hsv>(() => hexToHsv(value));
  const draftHex = hsvToHex(draft);
  const latest = useRef({ draftHex, value, onCommit });
  latest.current = { draftHex, value, onCommit };

  // Keeps the picked hue while the stored color matches it (greys and black have no hue of their own).
  useEffect(() => {
    setDraft((current) => (hsvToHex(current) === value ? current : hexToHsv(value)));
  }, [value]);

  const commit = useCallback((hex: string) => {
    remember(hex);
    if (hex !== latest.current.value) {
      latest.current.onCommit(hex);
    }
  }, []);
  const close = useCallback(() => {
    if (latest.current.draftHex !== latest.current.value) {
      commit(latest.current.draftHex);
    }
    setOpen(false);
  }, [commit]);
  const inside = useMemo(() => [trigger, surface], []);
  useDismiss(open, inside, close);
  const placement = useAnchoredStyle(open, trigger, surface, "start");

  useEffect(() => {
    if (open) {
      area.current?.focus({ preventScroll: true });
    }
  }, [open]);

  const releaseDraft = () => commit(latest.current.draftHex);
  const areaDrag = useDrag(area, (x, y) => setDraft((d) => ({ ...d, s: x, v: 1 - y })), releaseDraft);
  const hueDrag = useDrag(hueTrack, (x) => setDraft((d) => ({ ...d, h: Math.min(x * 360, 359.9) })), releaseDraft);
  const nudgeArea = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = arrowDelta(event);
    if (delta) {
      event.preventDefault();
      setDraft((d) => ({ ...d, s: clamp01(d.s + delta.x * KEY_STEP), v: clamp01(d.v - delta.y * KEY_STEP) }));
    } else if (event.key === "Enter") {
      close();
      trigger.current?.focus();
    }
  };
  const nudgeHue = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = arrowDelta(event);
    if (delta) {
      event.preventDefault();
      const step = (delta.x - delta.y) * HUE_STEP;
      setDraft((d) => ({ ...d, h: (d.h + step + 360) % 360 }));
    }
  };
  const pick = (hex: string) => {
    setDraft(hexToHsv(hex));
    commit(hex);
  };
  const swatches = [...recent, ...PRESETS.filter((color) => !recent.includes(color))].slice(0, SWATCH_COUNT);
  const pureHue = `hsl(${draft.h} 100% 50%)`;

  return (
    <>
      <Act
        ref={trigger}
        cta={`${label} picker`}
        aria-label={`Pick ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        style={{ background: open ? draftHex : value }}
        className="size-4 shrink-0 rounded-[5px] shadow-[inset_0_0_0_1px_var(--ic-line-strong)] hover:opacity-90 active:opacity-80"
      />
      {open
        ? createPortal(
            <div
              ref={surface}
              role="dialog"
              aria-label={`${label} color`}
              style={placement}
              className="fixed z-50 flex w-56 flex-col gap-2.5 rounded-card-sm border border-line-strong bg-panel p-2.5 text-fg shadow-popover"
            >
              <div
                ref={area}
                role="slider"
                tabIndex={0}
                aria-label={`${label} saturation and brightness`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(draft.s * 100)}
                aria-valuetext={`Saturation ${Math.round(draft.s * 100)}%, brightness ${Math.round(draft.v * 100)}%`}
                data-cta={`${label}-saturation`}
                onKeyDown={nudgeArea}
                {...areaDrag}
                style={{
                  background: `linear-gradient(to top, hsl(0 0% 0%), transparent), linear-gradient(to right, hsl(0 0% 100%), ${pureHue})`,
                }}
                className="relative h-32 cursor-crosshair touch-none rounded-control"
              >
                <span
                  aria-hidden
                  style={{ left: `${draft.s * 100}%`, top: `${(1 - draft.v) * 100}%`, background: draftHex }}
                  className="pointer-events-none absolute -mt-1.5 -ml-1.5 size-3 rounded-full ring-2 ring-fg shadow-menu"
                />
              </div>
              <div
                ref={hueTrack}
                role="slider"
                tabIndex={0}
                aria-label={`${label} hue`}
                aria-valuemin={0}
                aria-valuemax={360}
                aria-valuenow={Math.round(draft.h)}
                data-cta={`${label}-hue`}
                onKeyDown={nudgeHue}
                {...hueDrag}
                style={{
                  background:
                    "linear-gradient(to right, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))",
                }}
                className="relative h-2.5 cursor-pointer touch-none rounded-bar"
              >
                <span
                  aria-hidden
                  style={{ left: `${(draft.h / 360) * 100}%`, background: pureHue }}
                  className="pointer-events-none absolute -top-0.5 -ml-1.75 size-3.5 rounded-full ring-2 ring-fg"
                />
              </div>
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  style={{ background: draftHex }}
                  className="size-6 shrink-0 rounded-control shadow-[inset_0_0_0_1px_var(--ic-line-strong)]"
                />
                <ValueField
                  label={`${label} hex`}
                  tone={tone}
                  value={draftHex}
                  onCommit={(text) => {
                    const hex = parseHex(text);
                    if (hex) {
                      pick(hex);
                    }
                    return hex !== null;
                  }}
                  className="h-6.5 flex-1 rounded-control bg-control px-2 text-meta hover:bg-control-raised focus:bg-control-raised"
                />
              </span>
              <fieldset aria-label="Swatches" className="m-0 grid min-w-0 grid-cols-8 gap-1 border-0 p-0">
                {swatches.map((color) => (
                  <Act
                    key={color}
                    cta={`${label} swatch ${color}`}
                    aria-label={`Use ${color}`}
                    aria-current={color === draftHex ? "true" : undefined}
                    onClick={() => pick(color)}
                    style={{ background: color }}
                    className={`aspect-square rounded-[5px] shadow-[inset_0_0_0_1px_var(--ic-line-strong)] hover:opacity-90 active:opacity-80 ${
                      color === draftHex ? "ring-2 ring-fg ring-offset-1 ring-offset-panel" : ""
                    }`}
                  />
                ))}
              </fieldset>
            </div>,
            trigger.current?.ownerDocument.body ?? document.body,
          )
        : null}
    </>
  );
}
