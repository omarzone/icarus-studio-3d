import { type CSSProperties, type RefObject, useLayoutEffect, useState } from "react";

const GAP = 6;
const EDGE = 8;

const HIDDEN: CSSProperties = { top: 0, left: 0, visibility: "hidden" };

// Places a floating surface under its anchor, flipped above or nudged sideways so it never leaves the window.
export function useAnchoredStyle(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  floating: RefObject<HTMLElement | null>,
  align: "start" | "end",
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>(HIDDEN);
  useLayoutEffect(() => {
    const target = anchor.current;
    const surface = floating.current;
    const view = target?.ownerDocument.defaultView;
    if (!open || !target || !surface || !view) {
      setStyle(HIDDEN);
      return;
    }
    const box = target.getBoundingClientRect();
    const width = surface.offsetWidth;
    const height = surface.offsetHeight;
    const preferred = align === "end" ? box.right - width : box.left;
    const left = Math.min(Math.max(EDGE, preferred), view.innerWidth - width - EDGE);
    const fitsBelow = box.bottom + GAP + height <= view.innerHeight - EDGE;
    const fitsAbove = box.top - GAP - height >= EDGE;
    const top =
      fitsBelow || !fitsAbove ? Math.min(box.bottom + GAP, view.innerHeight - height - EDGE) : box.top - GAP - height;
    setStyle({ top: Math.max(EDGE, top), left, minWidth: align === "start" ? box.width : undefined });
  }, [open, anchor, floating, align]);
  return style;
}
