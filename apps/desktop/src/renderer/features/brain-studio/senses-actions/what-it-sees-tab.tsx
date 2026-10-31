// TAB-WHAT-IT-SEES
import type { SenseInput } from "../../../ports/brain-port.ts";
import { SwitchRow } from "./switch-row.tsx";

export function WhatItSeesTab({ inputs, onToggle }: { inputs: readonly SenseInput[]; onToggle: (id: string) => void }) {
  return (
    <div className="flex flex-col p-1.5">
      {inputs.map((input) => (
        <SwitchRow
          key={input.id}
          name={input.name}
          detail={input.detail}
          enabled={input.enabled}
          proposed={input.proposed}
          onToggle={() => onToggle(input.id)}
        />
      ))}
    </div>
  );
}
