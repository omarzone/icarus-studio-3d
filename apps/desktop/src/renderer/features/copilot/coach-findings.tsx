import { Act } from "../../app/navigation/go-to.tsx";
import type { CoachFinding, DesignArea } from "../../ports/copilot-port.ts";

const AREA_LABELS: Record<DesignArea, string> = {
  reward: "Reward",
  sensors: "Sensors",
  body: "Body",
  world: "World",
  brain: "Brain",
};

type Props = {
  findings: readonly CoachFinding[];
  busy: boolean;
  onApply: (id: string) => void;
};

// What the coach saw the body do, the design area each finding points to, and Apply for its tested fix.
export function CoachFindings({ findings, busy, onApply }: Props) {
  return (
    <ul aria-label="Coach findings" className="flex flex-col gap-1.5 self-stretch">
      {findings.map((finding) => (
        <li
          key={`${finding.area}-${finding.behavior}`}
          className="flex items-start gap-2 rounded-card-sm bg-control px-3 py-2 text-ui"
        >
          <span className="mt-0.5 shrink-0 rounded-full bg-fill-ghost px-2 text-meta text-fg-secondary">
            {AREA_LABELS[finding.area]}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-fg">{finding.behavior}</span>
            <span className="text-fg-secondary">{finding.change}</span>
          </span>
          <FindingFix finding={finding} busy={busy} onApply={onApply} />
        </li>
      ))}
    </ul>
  );
}

function FindingFix({
  finding,
  busy,
  onApply,
}: {
  finding: CoachFinding;
  busy: boolean;
  onApply: (id: string) => void;
}) {
  const proposal = finding.proposal;
  if (!proposal) {
    return null;
  }
  if (proposal.status !== "open") {
    return (
      <span className="shrink-0 text-meta text-fg-tertiary">
        {proposal.status === "applied" ? "Applied" : "Closed"}
      </span>
    );
  }
  return (
    <Act
      cta="Apply"
      disabled={busy}
      onClick={() => onApply(proposal.id)}
      className="inline-flex h-6.5 shrink-0 items-center rounded-full bg-selected px-3 text-meta font-semibold text-on-selected hover:opacity-90 active:opacity-80 disabled:opacity-50"
    >
      Apply
    </Act>
  );
}
