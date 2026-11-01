import type { ReactNode } from "react";
import { Switch } from "../../ui/switch.tsx";

type Props = {
  title: string;
  detail: ReactNode;
  checked: boolean;
  disabledReason?: string;
  onChange: (checked: boolean) => void;
};

// One setting with a sentence of context and its switch, on an info card.
export function SettingSwitchRow({ title, detail, checked, disabledReason, onChange }: Props) {
  return (
    <div className="flex items-center gap-3 rounded-card-sm bg-control px-3.5 py-3">
      <span className="flex flex-1 flex-col">
        <span className="leading-tight font-semibold">{title}</span>
        <span className="text-ui leading-normal text-fg-tertiary">{detail}</span>
      </span>
      <Switch
        label={title}
        checked={checked}
        disabled={disabledReason !== undefined}
        disabledReason={disabledReason}
        onChange={onChange}
      />
    </div>
  );
}
