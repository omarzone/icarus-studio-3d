import { type ButtonVariant, buttonClass } from "./button-styles.ts";

// Dialog buttons are 34 px with 13 px labels (style guide: Buttons).
export function dialogButtonClass(variant: ButtonVariant, extra = ""): string {
  return buttonClass(variant, `h-8.5! px-4! text-body! ${extra}`);
}
