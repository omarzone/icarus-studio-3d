import { Switch } from "../../../ui/switch.tsx";

type Props = { name: string; detail: string; enabled: boolean; proposed?: boolean; onToggle: () => void };

// A sense or action with its switch, name and a plain description; copilot proposals are blue.
export function SwitchRow({ name, detail, enabled, proposed = false, onToggle }: Props) {
  return (
    <div className="flex items-center gap-2.5 rounded-control px-2 py-1.75">
      <Switch label={name} checked={enabled} onChange={onToggle} />
      <span className="flex min-w-0 flex-col">
        <span className={`truncate text-body leading-4 ${proposed ? "text-proposal" : ""}`}>{name}</span>
        <span className="truncate text-meta leading-3.25 text-fg-tertiary">{detail}</span>
      </span>
    </div>
  );
}
