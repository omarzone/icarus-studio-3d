import { useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import type { AutopilotLimits, AutopilotProgress, AutopilotSettings } from "../../ports/training-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { Spinner } from "../../ui/spinner.tsx";
import { StatusPill } from "../../ui/status-pill.tsx";

type Props = {
  settings: AutopilotSettings;
  limits: AutopilotLimits;
  busy: boolean;
  onLimits: (limits: Partial<AutopilotLimits>) => void;
  onStart: () => void;
  onStop: () => void;
};

// On the engine: the autopilot's limits, Start or Stop, and how it is going while it runs.
export function AutopilotRun({ settings, limits, busy, onLimits, onStart, onStop }: Props) {
  const progress = settings.progress ?? null;
  const active = progress?.active === true;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <LimitField
          label="Goal success (%)"
          value={Math.round(limits.goal * 100)}
          disabled={active}
          onCommit={(value) => onLimits({ goal: value / 100 })}
        />
        <LimitField
          label="Max tries"
          value={limits.iterations}
          disabled={active}
          onCommit={(value) => onLimits({ iterations: value })}
        />
        <LimitField
          label="Max minutes"
          value={limits.minutes}
          disabled={active}
          onCommit={(value) => onLimits({ minutes: value })}
        />
      </div>
      {progress ? <ProgressCard progress={progress} /> : null}
      {active ? (
        <Act cta="Stop autopilot" disabled={busy} onClick={onStop} className={buttonClass("destructive", "self-start")}>
          {busy ? <Spinner /> : null}
          Stop autopilot
        </Act>
      ) : (
        <Act
          cta="Start autopilot"
          disabled={busy || settings.mode === "off"}
          title={
            settings.mode === "off" ? "Choose Ask first or Fix on its own" : "Train, diagnose and fix until the goal"
          }
          onClick={onStart}
          className={buttonClass("primary", "self-start")}
        >
          {busy ? <Spinner /> : null}
          Start autopilot
        </Act>
      )}
    </div>
  );
}

function ProgressCard({ progress }: { progress: AutopilotProgress }) {
  return (
    <section aria-live="polite" className="flex flex-col gap-2 rounded-card-sm bg-control px-3.5 py-3 text-ui">
      <span className="flex items-center gap-2">
        <StatusPill tone={progress.tone}>{progress.label}</StatusPill>
        {progress.active ? <Spinner /> : null}
      </span>
      <span className="text-fg-secondary">{progress.detail}</span>
      {progress.log.length > 0 ? (
        <ol className="flex flex-col gap-1 border-t border-line-subtle pt-2">
          {progress.log.map((line) => (
            <li key={line.id} className="flex gap-2 leading-normal">
              <time dateTime={line.time} className="shrink-0 font-mono text-meta text-fg-tertiary">
                {new Date(line.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </time>
              <span>{line.text}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

type FieldProps = { label: string; value: number; disabled: boolean; onCommit: (value: number) => void };

// A number the engine bounds; it is sent when the field loses focus or on Enter.
function LimitField({ label, value, disabled, onCommit }: FieldProps) {
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(String(value));
  }
  const commit = () => {
    const parsed = Number(text);
    if (text.trim() === "" || !Number.isFinite(parsed)) {
      setText(String(value));
      return;
    }
    if (parsed !== value) {
      onCommit(parsed);
    }
  };
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-ui leading-tight text-fg-secondary">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit();
          }
        }}
        className="h-9 rounded-button bg-control px-3 font-mono text-ui text-fg outline-none hover:bg-control-raised focus:bg-control-raised disabled:opacity-35"
      />
    </label>
  );
}
