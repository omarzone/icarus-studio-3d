import { buttonClass } from "../../ui/button-styles.ts";

// Dialog and page buttons in Build are 34 px with 13 px labels (style guide: Buttons).
export const dialogButton = (variant: "primary" | "secondary") => buttonClass(variant, "h-8.5! px-4! text-body!");

// Build dialog titles sit on the close button's center line, as in the design.
export function DialogTitle({ text }: { text: string }) {
  return <span className="-mt-0.5 block">{text}</span>;
}
