import { type RefObject, useEffect } from "react";

// Closes a floating surface on Escape or a press outside it, in the document of its anchor (popped-out panels have their own).
export function useDismiss(open: boolean, inside: readonly RefObject<HTMLElement | null>[], onClose: () => void): void {
  useEffect(() => {
    if (!open) {
      return;
    }
    const doc = inside[0]?.current?.ownerDocument ?? document;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !inside.some((ref) => ref.current?.contains(target))) {
        onClose();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    doc.addEventListener("pointerdown", onPointer);
    doc.addEventListener("keydown", onKey);
    return () => {
      doc.removeEventListener("pointerdown", onPointer);
      doc.removeEventListener("keydown", onKey);
    };
  }, [open, inside, onClose]);
}
