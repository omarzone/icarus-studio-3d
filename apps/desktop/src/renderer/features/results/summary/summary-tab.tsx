// TAB-SUMMARY
import { GoTo } from "../../../app/navigation/go-to.tsx";
import type { ResultSummary, Tone } from "../../../ports/results-port.ts";
import { buttonClass } from "../../../ui/button-styles.ts";
import { Meter, type MeterTone } from "../../../ui/meter.tsx";
import { EmptyState } from "../../../ui/states.tsx";

const METER: Record<Tone, MeterTone> = { ok: "ok", warn: "warn", danger: "danger", neutral: "main" };

// The best brain so far, its key scores, or the overall match for reference brains.
export function SummaryTab({ summary }: { summary: ResultSummary }) {
  switch (summary.kind) {
    case "best":
      return (
        <div className="flex flex-col gap-2.5 px-3.5 py-3">
          <span className="font-semibold">{summary.title}</span>
          <span className="text-ui text-fg-secondary">{summary.detail}</span>
          <div className="flex gap-1.5">
            <GoTo to="SCR-BUILD" cta="Use this brain" className={buttonClass("primary", "px-3.75!")}>
              Use this brain
            </GoTo>
            <GoTo to="SCR-TRAIN" cta="Keep training" className={buttonClass("secondary")}>
              Keep training
            </GoTo>
          </div>
        </div>
      );
    case "scores":
      return (
        <div className="flex flex-col gap-2.5 px-3.5 py-3 text-ui">
          <span className="text-body font-semibold">{summary.title}</span>
          {summary.scores.map((score) => (
            <div key={score.label} className="flex flex-col gap-1">
              <span className="flex">
                <span>{score.label}</span>
                <span className="ml-auto">{score.value}</span>
              </span>
              <Meter ratio={score.ratio} tone={METER[score.tone]} label={score.label} />
            </div>
          ))}
          <p className="leading-normal text-fg-tertiary">{summary.note}</p>
        </div>
      );
    case "match":
      return (
        <div className="flex flex-col gap-2 px-3.5 py-3">
          <span className="font-semibold">{summary.title}</span>
          <span className="text-title-1 font-bold">{summary.value}</span>
          <p className="text-ui leading-normal text-fg-tertiary">{summary.detail}</p>
          {summary.nextTest ? (
            <GoTo
              to="STA-BRAIN-CONNECTOME"
              cta={`Run ${summary.nextTest}`}
              className={buttonClass("primary", "h-8.5! justify-start px-4! text-body!")}
            >
              Run {summary.nextTest}
            </GoTo>
          ) : null}
        </div>
      );
    case "empty":
      return <EmptyState title={summary.title} body={summary.detail} />;
  }
}
