// TAB-WHAT-IT-CAN-DO
import type { ActionOutput } from "../../../ports/brain-port.ts";
import { SwitchRow } from "./switch-row.tsx";

export function WhatItCanDoTab({
  outputs,
  onToggle,
}: {
  outputs: readonly ActionOutput[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-col p-1.5">
      {outputs.map((output) => (
        <SwitchRow
          key={output.id}
          name={output.name}
          detail={output.detail}
          enabled={output.enabled}
          onToggle={() => onToggle(output.id)}
        />
      ))}
    </div>
  );
}
