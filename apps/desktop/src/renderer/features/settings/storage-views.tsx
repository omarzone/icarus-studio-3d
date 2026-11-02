import { Act } from "../../app/navigation/go-to.tsx";
import type { DataFolderCheck, DataFolderMove, StorageSettings } from "../../ports/settings-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { formatBytes } from "../../ui/byte-size.ts";
import { Meter } from "../../ui/meter.tsx";

// Views of the Storage section on SCR-SETTINGS-TRAINING; they take plain props and run nothing themselves.

const card = "flex flex-col gap-2 rounded-card-sm bg-control p-3.5";
const action = buttonClass("secondary", "h-8.5 px-4 text-body");

export const ENVIRONMENT_REASON = "Set by ICARUS_PROJECTS_DIR or ICARUS_RUNS_DIR, which always win";

type FolderProps = { storage: StorageSettings; busy: boolean; onChange: () => void };

export function DataFolderCard({ storage, busy, onChange }: FolderProps) {
  const used = storage.projectsBytes + storage.runsBytes;
  const reason = storage.setByEnvironment ? ENVIRONMENT_REASON : undefined;
  return (
    <div className={card}>
      <div className="flex items-start gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="leading-tight font-semibold">Data folder</span>
          <span className="font-mono text-ui leading-normal break-all text-fg-secondary">{storage.dataFolder}</span>
        </span>
        <Act
          cta="Change folder…"
          disabled={busy || reason !== undefined}
          title={reason ?? "Choose another folder, on any drive, for projects and runs"}
          onClick={onChange}
          className={action}
        >
          Change folder…
        </Act>
      </div>
      <Meter ratio={used / Math.max(1, used + storage.freeBytes)} tone="minor" label="Space used by Icarus" />
      <span className="text-ui leading-normal text-fg-tertiary">
        Projects {formatBytes(storage.projectsBytes)} · Runs {formatBytes(storage.runsBytes)} ·{" "}
        {formatBytes(storage.freeBytes)} free on this drive
      </span>
      {reason ? <span className="text-ui leading-normal text-fg-tertiary">{reason}.</span> : null}
    </div>
  );
}

type ConfirmProps = {
  check: DataFolderCheck;
  busy: boolean;
  onMove: () => void;
  onStartEmpty: () => void;
  onCancel: () => void;
};

export function MoveConfirm({ check, busy, onMove, onStartEmpty, onCancel }: ConfirmProps) {
  return (
    <section aria-label="Change the data folder" className={card}>
      <span className="leading-tight font-semibold">Use {check.folder}?</span>
      <span className="text-ui leading-normal text-fg-secondary">
        Moving copies every project and run there, checks each copy byte for byte and only then removes the original.{" "}
        {formatBytes(check.neededBytes)} to copy, {formatBytes(check.freeBytes)} free there. Nothing can train while it
        moves, and the engine restarts to use the new folder.
      </span>
      <div className="flex gap-2">
        <Act cta="Move projects and runs" disabled={busy} onClick={onMove} className={buttonClass("primary", "h-8.5")}>
          Move projects and runs
        </Act>
        <Act
          cta="Start empty there"
          disabled={busy}
          title="Keep the current projects and runs where they are"
          onClick={onStartEmpty}
          className={action}
        >
          Start empty there
        </Act>
        <Act cta="Cancel" disabled={busy} onClick={onCancel} className={buttonClass("ghost", "h-8.5")}>
          Cancel
        </Act>
      </div>
    </section>
  );
}

export function MoveProgress({ move, restarting }: { move: DataFolderMove; restarting: boolean }) {
  return (
    <div role="status" className={card}>
      <span className="leading-tight font-semibold">
        {restarting ? "Restarting the engine to use the new folder" : "Moving projects and runs"}
      </span>
      <Meter ratio={restarting ? 1 : move.progress} label="Moved" />
      <span className="text-ui leading-normal text-fg-tertiary">{restarting ? "Almost done" : move.text}</span>
    </div>
  );
}

export function MoveResult({ move, onDismiss }: { move: DataFolderMove; onDismiss: () => void }) {
  return (
    <div role="status" className={card}>
      <span className="leading-tight font-semibold">
        {move.state === "done" ? "The data folder changed" : "The data folder did not change"}
      </span>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-ui leading-normal text-fg-secondary">
        {(move.state === "done" ? move.lines : [move.text, ...move.lines]).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div>
        <Act cta="OK" onClick={onDismiss} className={action}>
          OK
        </Act>
      </div>
    </div>
  );
}

export function StorageProblem({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-3 rounded-card-sm bg-control px-3.5 py-3">
      <span className="flex-1 text-ui leading-normal text-warn">{text}</span>
      <Act cta="OK" onClick={onDismiss} className={action}>
        OK
      </Act>
    </div>
  );
}
