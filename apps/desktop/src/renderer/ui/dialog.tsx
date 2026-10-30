import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { CloseOverlay, useCloseOverlay } from "../app/navigation/go-to.tsx";
import { buttonClass } from "./button-styles.ts";

type Props = {
  title: ReactNode;
  // Tailwind width class on the spacing scale (w-120 is 480 px).
  width?: string;
  children: ReactNode;
  footer?: ReactNode;
};

// Modal from the style guide: centered, 60% scrim, Escape and × close it and return to the screen underneath.
export function Dialog({ title, width = "w-120", children, footer }: Props) {
  const close = useCloseOverlay();
  useEscape(close);
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-scrim-modal">
      <section
        role="dialog"
        aria-modal="true"
        className={`${width} flex max-h-[calc(100%-48px)] flex-col gap-4 overflow-auto rounded-dialog border border-line-strong bg-panel p-5.5 shadow-dialog`}
      >
        <header className="flex items-start justify-between gap-3">
          <h2 className="text-title-3 font-semibold">{title}</h2>
          <CloseOverlay cta="Close" aria-label="Close" className={buttonClass("icon", "-my-1 -mr-1")}>
            <X size={16} strokeWidth={1.75} aria-hidden />
          </CloseOverlay>
        </header>
        {children}
        {footer ? <footer className="flex items-center justify-end gap-2">{footer}</footer> : null}
      </section>
    </div>
  );
}

export function useEscape(onEscape: () => void): void {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onEscape();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [onEscape]);
}
