// TAB-DIAGNOSES
import { useQuery } from "@tanstack/react-query";
import { Stethoscope } from "lucide-react";
import { Act } from "../../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../../app/runtime/engine-query.tsx";
import { usePort } from "../../../app/runtime/port.tsx";
import { copilotPort } from "../../../ports/copilot-port.ts";
import { type DiagnosisView, type ProposalStatus, resultsPort } from "../../../ports/results-port.ts";
import { buttonClass } from "../../../ui/button-styles.ts";
import { QueryView } from "../../../ui/query-view.tsx";
import { Spinner } from "../../../ui/spinner.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { StatusPill } from "../../../ui/status-pill.tsx";
import { resultsKeys, useAfterDiagnosis } from "../use-results.ts";

const PROPOSAL_WORDS: Readonly<Record<Exclude<ProposalStatus, "open">, string>> = {
  applied: "Applied",
  discarded: "Discarded",
  outdated: "Outdated: the project changed since",
};

// What the coach found in each diagnosis of the project's runs, newest first, with its proposed fix.
export function DiagnosesTab({ project }: { project: string }) {
  const port = usePort(resultsPort);
  const copilot = usePort(copilotPort);
  const refresh = useAfterDiagnosis(project);
  const diagnoses = useQuery({ queryKey: resultsKeys.diagnoses(project), queryFn: () => port.listDiagnoses(project) });
  const diagnose = useEngineAction(port.diagnose);
  const apply = useEngineAction(copilot.applyProposal);
  return (
    <div className="flex flex-col gap-2 p-2">
      <Act
        cta="Diagnose now"
        title="Ask the coach why the newest run behaves as it does"
        disabled={diagnose.isPending}
        onClick={() => diagnose.mutate({ project }, { onSuccess: refresh })}
        className={buttonClass("secondary", "w-full")}
      >
        {diagnose.isPending ? <Spinner /> : <Stethoscope size={14} strokeWidth={1.75} aria-hidden />}
        {diagnose.isPending ? "Diagnosing…" : "Diagnose now"}
      </Act>
      <QueryView
        query={diagnoses}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            title="No diagnoses yet"
            body="Diagnose now, or start the autopilot, and the coach explains what it sees in the run."
          />
        }
      >
        {(data) =>
          data.map((item) => (
            <DiagnosisCard
              key={item.id}
              diagnosis={item}
              applying={apply.isPending}
              onApply={(id) => apply.mutate({ key: project, id }, { onSettled: refresh })}
            />
          ))
        }
      </QueryView>
    </div>
  );
}

type CardProps = { diagnosis: DiagnosisView; applying: boolean; onApply: (id: string) => void };

function DiagnosisCard({ diagnosis, applying, onApply }: CardProps) {
  const proposal = diagnosis.proposal;
  return (
    <article className="flex flex-col gap-2 rounded-card-sm bg-control px-3 py-2.5 text-ui">
      <header className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-semibold">{diagnosis.title}</span>
        <StatusPill tone={diagnosis.nextStep.tone}>{diagnosis.nextStep.label}</StatusPill>
      </header>
      <time dateTime={diagnosis.createdAt} className="text-meta text-fg-tertiary">
        {new Date(diagnosis.createdAt).toLocaleString()}
      </time>
      <p className="leading-normal">{diagnosis.summary}</p>
      <p className="leading-normal text-fg-secondary">
        <span className="text-fg-tertiary">Why: </span>
        {diagnosis.hypothesis}
      </p>
      {diagnosis.observations.length > 0 ? (
        <ul className="flex list-disc flex-col gap-0.5 pl-4 text-fg-secondary">
          {diagnosis.observations.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {proposal ? (
        <div className="flex items-center gap-2 rounded-button bg-control-raised px-2.5 py-2">
          <span className="min-w-0 flex-1">{proposal.summary}</span>
          {proposal.status === "open" ? (
            <Act
              cta="Apply"
              title="Apply this fix as a new revision"
              disabled={applying}
              onClick={() => onApply(proposal.id)}
              className={buttonClass("primary", "h-7! px-3!")}
            >
              Apply
            </Act>
          ) : (
            <span className="text-meta text-fg-tertiary">{PROPOSAL_WORDS[proposal.status]}</span>
          )}
        </div>
      ) : null}
    </article>
  );
}
