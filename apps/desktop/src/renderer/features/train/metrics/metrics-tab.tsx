// TAB-METRICS
import type { LiveMetrics, MetricSeries, RewardTerm } from "../../../ports/training-port.ts";
import { LineChart } from "../../../ui/line-chart.tsx";
import { Meter } from "../../../ui/meter.tsx";
import { StatusPill } from "../../../ui/status-pill.tsx";

const VALUE_TONE: Record<RewardTerm["tone"], string> = {
  main: "text-fg-secondary",
  minor: "text-fg-secondary",
  warn: "text-warn",
  danger: "text-danger",
};

// Mean reward and failure-rate charts with their change, and the reward breakdown by term.
export function MetricsTab({ metrics }: { metrics: LiveMetrics }) {
  return (
    <div className="grid h-full min-h-0 grid-cols-[1.3fr_1fr_1.1fr] gap-2.5 p-2.5">
      {metrics.series.map((series) => (
        <SeriesCard key={series.label} series={series} />
      ))}
      <div className="flex min-h-0 flex-col gap-2.25 overflow-hidden rounded-card-sm bg-control px-3.5 py-3">
        <span className="text-ui text-fg-secondary">{metrics.breakdown.title}</span>
        {metrics.breakdown.terms.map((term) => (
          <div key={term.label} className="flex flex-col gap-0.75">
            <span className="flex justify-between text-ui">
              <span>{term.label}</span>
              <span className={`font-mono text-meta ${VALUE_TONE[term.tone]}`}>{term.value}</span>
            </span>
            <Meter ratio={term.ratio} tone={term.tone} label={term.label} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SeriesCard({ series }: { series: MetricSeries }) {
  return (
    <div className="flex min-h-0 flex-col gap-1 overflow-hidden rounded-card-sm bg-control px-3.5 pt-3 pb-2">
      <span className="text-ui text-fg-secondary">{series.label}</span>
      <div className="flex items-center gap-2">
        <span className="text-title-3 font-semibold">{series.value}</span>
        <StatusPill tone={series.change.tone}>{series.change.text}</StatusPill>
      </div>
      <LineChart
        label={`${series.label} trend`}
        samples={series.samples}
        min={series.min}
        max={series.max}
        meaning={series.meaning}
        className="h-24 w-full shrink-0"
      />
    </div>
  );
}
