// SYS-ENGINE-DOWN
import { Power } from "lucide-react";

type Props = {
  lastLog: string[];
  onRestart: () => void;
  onCopy: (text: string) => void;
};

export function EngineDown({ lastLog, onRestart, onCopy }: Props) {
  const details = lastLog.length > 0 ? lastLog.join("\n") : "No output from the engine.";
  return (
    <div data-ui-id="SYS-ENGINE-DOWN" className="grid h-full place-items-center bg-app text-fg">
      <div className="flex w-130 flex-col items-center gap-3.5 text-center">
        <span className="grid size-16 place-items-center rounded-bubble bg-control">
          <Power size={30} strokeWidth={1.75} aria-hidden />
        </span>
        <h1 className="m-0 text-title-1 font-semibold">The Icarus engine stopped</h1>
        <p className="m-0 text-body text-fg-secondary">
          Your projects are saved. Training runs pause until the engine is back. This usually happens after the computer
          sleeps.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            data-cta="restart-engine"
            data-goes-to="SCR-HOME"
            onClick={onRestart}
            className="h-8.5 rounded-button bg-selected px-4 text-body font-semibold text-on-selected"
          >
            Restart engine
          </button>
          <button
            type="button"
            data-cta="copy-error-details"
            onClick={() => onCopy(details)}
            className="h-8.5 rounded-button bg-control px-4 text-body text-fg"
          >
            Copy error details
          </button>
        </div>
        <pre className="m-0 w-full whitespace-pre-wrap rounded-card-sm bg-control px-3 py-2.5 text-left font-mono text-meta text-fg-secondary">
          {details}
        </pre>
      </div>
    </div>
  );
}
