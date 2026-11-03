// POP-MATERIAL-PALETTE
import { ChevronDown } from "lucide-react";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Act } from "../../../app/navigation/go-to.tsx";
import type { ListOption } from "../../../ports/scene-port.ts";
import { useAnchoredStyle } from "../../../ui/anchored.ts";
import { ColorPicker } from "./color-picker.tsx";
import { swatchImage } from "./material-swatches.ts";
import { type ControlTone, fieldClass, toneText } from "./value-field.tsx";

export type ColorCompanion = { value: string; onChange: (hex: string) => void };

type Props = {
  label: string;
  value: string;
  options: readonly ListOption[];
  tone: ControlTone;
  onPick: (value: string) => void;
  color?: ColorCompanion;
};

// Closes on Escape or a press outside, except inside the color picker the palette opens over itself.
function usePaletteDismiss(
  open: boolean,
  button: RefObject<HTMLButtonElement | null>,
  surface: RefObject<HTMLDivElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const doc = button.current?.ownerDocument ?? document;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || button.current?.contains(target) || surface.current?.contains(target)) {
        return;
      }
      if (!target.closest('[role="dialog"]')) {
        onClose();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    doc.addEventListener("pointerdown", onPointer);
    doc.addEventListener("keydown", onKey);
    return () => {
      doc.removeEventListener("pointerdown", onPointer);
      doc.removeEventListener("keydown", onKey);
    };
  }, [open, button, surface, onClose]);
}

function Swatch({ preset, color, large = false }: { preset: string; color: string; large?: boolean }) {
  const image = swatchImage(preset);
  return (
    <span
      aria-hidden
      style={{
        backgroundColor: color,
        backgroundImage: image ? `url(${image})` : undefined,
        backgroundBlendMode: "multiply",
        backgroundSize: "cover",
      }}
      className={`shrink-0 shadow-[inset_0_0_0_1px_var(--ic-line-strong)] ${large ? "size-9 rounded-control" : "size-3.5 rounded-[4px]"}`}
    />
  );
}

// The palette of materials a part can be made of: a swatch per material, drawn with its pattern in the part's color,
// and the color picker that tints them all. Picking one sets the look and, in the engine, the grip.
export function MaterialPalette({ label, value, options, tone, onPick, color }: Props) {
  const button = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  usePaletteDismiss(open, button, surface, close);
  const placement = useAnchoredStyle(open, button, surface, "end");
  const body = button.current?.ownerDocument.body;
  const tint = color?.value ?? "#ffffff";
  const current = options.find((option) => option.value === value);
  return (
    <>
      <Act
        ref={button}
        cta={label}
        aria-label={`${label}: ${current?.label ?? value}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((shown) => !shown)}
        className={`${fieldClass} flex w-full items-center gap-1.5 px-2 text-left text-meta hover:bg-control-raised active:opacity-80 ${toneText[tone]}`}
      >
        <Swatch preset={value} color={tint} />
        <span className="min-w-0 flex-1 truncate">{current?.label ?? value}</span>
        <ChevronDown size={10} strokeWidth={2} className="shrink-0 text-fg-tertiary" aria-hidden />
      </Act>
      {open && body
        ? createPortal(
            <div
              ref={surface}
              role="dialog"
              aria-label={`${label} palette`}
              style={placement}
              className="fixed z-50 flex w-80 flex-col gap-2.5 rounded-card border border-line-strong bg-panel p-2.5 text-fg shadow-menu"
            >
              <div className="grid grid-cols-4 gap-1">
                {options.map((option) => {
                  const chosen = option.value === value;
                  return (
                    <Act
                      key={option.value}
                      cta={`${label} ${option.label}`}
                      aria-pressed={chosen}
                      aria-current={chosen ? "true" : undefined}
                      title={option.label}
                      onClick={() => {
                        onPick(option.value);
                        close();
                      }}
                      className={`flex flex-col items-center gap-1 rounded-control p-1.5 text-micro ${
                        chosen ? "bg-selected text-on-selected" : "text-fg-secondary hover:bg-fill-hover hover:text-fg"
                      } active:opacity-80`}
                    >
                      <Swatch preset={option.value} color={tint} large />
                      <span className="w-full truncate text-center">{option.label}</span>
                    </Act>
                  );
                })}
              </div>
              {color ? (
                <div className="flex items-center gap-2 border-t border-line-subtle pt-2.5 text-ui text-fg-secondary">
                  <span className="flex-1">Color</span>
                  <span className={`${fieldClass} flex items-center gap-1.5 px-2`}>
                    <ColorPicker label={`${label} color`} tone={tone} value={color.value} onCommit={color.onChange} />
                    <span className="font-mono text-meta text-fg">{color.value}</span>
                  </span>
                </div>
              ) : null}
            </div>,
            body,
          )
        : null}
    </>
  );
}
