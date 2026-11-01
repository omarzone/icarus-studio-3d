// Button looks from the style guide ("Buttons" and "Interaction states"). Apply to GoTo, Act or a plain button.
export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "icon";

const base =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap active:opacity-80 disabled:pointer-events-none disabled:opacity-35";

const variants: Record<ButtonVariant, string> = {
  primary: "h-8 rounded-button bg-selected px-4 text-ui font-semibold text-on-selected hover:opacity-90",
  secondary: "h-8 rounded-button bg-control px-3.5 text-ui text-fg hover:bg-control-raised",
  ghost: "h-8 rounded-button px-3 text-ui text-fg-secondary hover:bg-fill-hover hover:text-fg",
  destructive: "h-8 rounded-button bg-destructive px-4 text-ui font-semibold text-destructive-fg hover:opacity-90",
  icon: "size-8 rounded-button text-fg-tool hover:bg-fill-hover hover:text-fg",
};

export function buttonClass(variant: ButtonVariant, extra = ""): string {
  return `${base} ${variants[variant]} ${extra}`.trim();
}
