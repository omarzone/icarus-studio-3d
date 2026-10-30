import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";
import { useCloseOverlay } from "../app/navigation/go-to.tsx";
import { useEscape } from "./dialog.tsx";

type Props = {
  // Position of the popover inside the window, next to the control that opens it.
  anchor: Pick<CSSProperties, "top" | "left" | "right" | "bottom">;
  // Light 35% scrim, only for popovers that need focus.
  scrim?: boolean;
  // Tailwind width class on the spacing scale.
  width?: string;
  variant?: "popover" | "menu";
  children: ReactNode;
};

// Popover or menu from the style guide: closes on Escape or a click outside it.
export function Popover({ anchor, scrim = false, width = "w-80", variant = "popover", children }: Props) {
  const close = useCloseOverlay();
  const ref = useRef<HTMLDivElement>(null);
  useEscape(close);
  useEffect(() => {
    const listener = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) {
        close();
      }
    };
    window.addEventListener("pointerdown", listener);
    return () => window.removeEventListener("pointerdown", listener);
  }, [close]);
  const surface =
    variant === "menu"
      ? "rounded-card border border-line-strong bg-panel p-1.5 shadow-menu"
      : "rounded-[18px] border border-line-strong bg-panel p-4 shadow-popover";
  return (
    <div className={`absolute inset-0 z-40 ${scrim ? "bg-scrim-popover" : "pointer-events-none"}`}>
      <div ref={ref} role="dialog" style={anchor} className={`pointer-events-auto absolute ${width} ${surface}`}>
        {children}
      </div>
    </div>
  );
}
