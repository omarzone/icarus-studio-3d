// TAB-WHAT-IT-SEES
import type { SenseInput } from "../../../ports/brain-port.ts";
import { SwitchRow } from "./switch-row.tsx";

type Props = {
  inputs: readonly SenseInput[];
  onToggle: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
};

export function WhatItSeesTab({ inputs, onToggle, onRename, onRemove }: Props) {
  return (
    <div className="flex flex-col p-1.5">
      {inputs.map((input) => (
        <SwitchRow
          key={input.id}
          name={input.name}
          detail={input.detail}
          enabled={input.enabled}
          proposed={input.proposed}
          lockedReason={input.lockedReason}
          onToggle={() => onToggle(input.id)}
          onRename={input.renamable ? (name) => onRename(input.id, name) : undefined}
          onRemove={input.removable ? () => onRemove(input.id) : undefined}
        />
      ))}
    </div>
  );
}
