import type { InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: string;
  mono?: boolean;
  className?: string;
};

// Labeled text field: 40 px, bg.control, takes its hover background while focused.
export function TextField({ label, mono = false, className = "", ...input }: Props) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-ui leading-tight text-fg-secondary">{label}</span>
      <input
        {...input}
        className={`h-10 rounded-button bg-control px-3 text-fg outline-none placeholder:text-fg-tertiary hover:bg-control-raised focus:bg-control-raised ${mono ? "font-mono text-ui" : "text-body"}`}
      />
    </label>
  );
}
