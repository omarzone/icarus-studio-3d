import type { ReactNode } from "react";
import type { RouteId } from "../../app/navigation/catalog-id.ts";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import type { Proposal } from "../../ports/copilot-port.ts";
import { CheckLine, RichTextView } from "./chat-messages.tsx";

// Where each proposal action leads in this workspace; without a route the action stays in place.
export type ProposalRoutes = { apply?: RouteId; discard?: RouteId; edit?: RouteId };

type Props = {
  proposal: Proposal;
  routes?: ProposalRoutes;
  onApply: () => void;
  onDiscard: () => void;
  // Width limit on wide boards.
  className?: string;
};

const primary =
  "inline-flex h-7.5 items-center rounded-full bg-selected px-3.5 text-ui font-semibold text-on-selected hover:opacity-90";
const ghost =
  "inline-flex h-7.5 items-center rounded-full bg-fill-ghost px-3.5 text-ui text-fg hover:bg-control-raised";

// Every difference as old → new with the new value in blue, side effects as amber checks, then Apply, Discard, Edit by hand.
export function ProposalCard({ proposal, routes = {}, onApply, onDiscard, className = "" }: Props) {
  return (
    <div
      className={`flex flex-col gap-2.5 rounded-bubble bg-control px-3.5 py-3 text-body leading-[1.55] ${className}`}
    >
      <RichTextView text={proposal.intro} />
      {proposal.changes.map((change) =>
        change.kind === "diff" ? (
          <div key={change.label} className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 text-ui">
            <span className="text-fg-tertiary">{change.label}</span>
            <span>
              {change.from} <span className="text-fg-tertiary">→</span>{" "}
              <b className="font-semibold text-proposal">{change.to}</b>
            </span>
          </div>
        ) : (
          <CheckLine key={change.text} item={{ text: change.text, tone: "ok" }} />
        ),
      )}
      {proposal.warnings.map((warning) => (
        <CheckLine key={warning} item={{ text: warning, tone: "warn" }} />
      ))}
      {proposal.status === "open" ? (
        <div className="flex gap-1.5">
          <ProposalAction label="Apply" to={routes.apply} onClick={onApply} className={primary} />
          <ProposalAction label="Discard" to={routes.discard} onClick={onDiscard} className={ghost} />
          {proposal.editable ? <ProposalAction label="Edit by hand" to={routes.edit} className={ghost} /> : null}
        </div>
      ) : (
        <p className="text-ui text-fg-tertiary">
          {proposal.status === "applied" ? "Applied as a new revision." : "Discarded. Nothing changed."}
        </p>
      )}
    </div>
  );
}

function ProposalAction({
  label,
  to,
  onClick,
  className,
}: {
  label: string;
  to?: RouteId;
  onClick?: () => void;
  className: string;
}) {
  const children: ReactNode = label;
  return to ? (
    <GoTo to={to} cta={label} onClick={onClick} className={className}>
      {children}
    </GoTo>
  ) : (
    <Act cta={label} onClick={onClick} className={className}>
      {children}
    </Act>
  );
}
