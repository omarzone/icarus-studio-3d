// TAB-CONSOLE
import type { ConsoleLine } from "../../../ports/training-port.ts";

const LEVEL: Record<ConsoleLine["level"], string> = { info: "", warn: "text-warn", error: "text-danger" };

// Timestamped log of the run and the engine.
export function ConsoleTab({ lines }: { lines: readonly ConsoleLine[] }) {
  return (
    <div className="flex flex-col gap-1 px-3.5 py-2.5 font-mono text-mono select-text">
      {lines.map((line) => (
        <p key={`${line.time} ${line.text}`} className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
          <span className="text-fg-tertiary">{line.time}</span>
          <span className={LEVEL[line.level]}>{line.text}</span>
        </p>
      ))}
    </div>
  );
}
