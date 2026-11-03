import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { ctaSlug } from "../../../app/navigation/catalog-id.ts";
import { Act } from "../../../app/navigation/go-to.tsx";
import { Switch } from "../../../ui/switch.tsx";

type Props = {
  name: string;
  detail: string;
  enabled: boolean;
  proposed?: boolean;
  // Why the switch cannot change; it is dimmed and says so on hover.
  lockedReason?: string;
  onToggle: () => void;
  onRename?: (name: string) => void;
  onRemove?: () => void;
};

// A sense or action with its switch, name and a plain description; copilot proposals are blue.
export function SwitchRow({
  name,
  detail,
  enabled,
  proposed = false,
  lockedReason,
  onToggle,
  onRename,
  onRemove,
}: Props) {
  const tone = proposed ? "text-proposal" : "";
  return (
    <div className="flex items-center gap-2.5 rounded-control px-2 py-1.75">
      <Switch
        label={name}
        checked={enabled}
        disabled={lockedReason !== undefined}
        disabledReason={lockedReason}
        onChange={onToggle}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        {onRename ? (
          <NameField name={name} className={tone} onRename={onRename} />
        ) : (
          <span className={`truncate text-body leading-4 ${tone}`}>{name}</span>
        )}
        <span className="truncate text-meta leading-3.25 text-fg-tertiary">{detail}</span>
      </span>
      {onRemove ? (
        <Act
          cta={`Remove ${name}`}
          aria-label={`Remove ${name}`}
          title={`Remove ${name} from the body`}
          onClick={onRemove}
          className="grid size-5 shrink-0 place-items-center rounded-control text-fg-tertiary hover:bg-fill-hover hover:text-fg active:opacity-80"
        >
          <X size={12} strokeWidth={1.75} aria-hidden />
        </Act>
      ) : null}
    </div>
  );
}

// The name typed in place: Enter or leaving the field renames, Escape keeps the old name.
function NameField({
  name,
  className,
  onRename,
}: {
  name: string;
  className: string;
  onRename: (name: string) => void;
}) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const commit = () => {
    const next = draft.trim();
    if (next && next !== name) {
      onRename(next);
    }
    setDraft(name);
  };
  return (
    <input
      type="text"
      aria-label={`Rename ${name}`}
      data-cta={ctaSlug(`Rename ${name}`)}
      value={draft}
      maxLength={40}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(name);
        }
      }}
      className={`-mx-1 h-4 min-w-0 rounded-control bg-transparent px-1 text-body leading-4 outline-none hover:bg-control focus:bg-control-raised ${className}`}
    />
  );
}
