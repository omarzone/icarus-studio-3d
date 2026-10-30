// MOD-REPORT
import { useState } from "react";
import { Act, CloseOverlay } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { communityPort, type ReportReason } from "../../ports/community-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { Dialog } from "../../ui/dialog.tsx";
import { Switch } from "../../ui/switch.tsx";
import { useCreation } from "./creation-screen.tsx";

const REASONS: readonly { reason: ReportReason; label: string }[] = [
  { reason: "offensive", label: "Inappropriate or offensive content" },
  { reason: "stolen", label: "Stolen work, not credited" },
  { reason: "spam", label: "Spam or scam" },
  { reason: "harmful", label: "Harmful or dangerous" },
  { reason: "other", label: "Something else" },
];

export function ReportDialog() {
  const creation = useCreation().data;
  const community = usePort(communityPort);
  const report = useEngineAction(community.report);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [blockAuthor, setBlockAuthor] = useState(false);
  return (
    <Dialog
      title={creation ? `Report ${creation.name}` : "Report a creation"}
      width="w-125"
      footer={
        <>
          <CloseOverlay cta="Cancel" className={buttonClass("secondary", "h-8.5 px-4 text-body")}>
            Cancel
          </CloseOverlay>
          <CloseOverlay
            cta="Send report"
            disabled={reason === null || !creation}
            title={reason === null ? "Choose a reason first" : undefined}
            onClick={() => {
              if (reason !== null && creation) {
                report.mutate({ id: creation.id, reason, details, blockAuthor });
              }
            }}
            className={buttonClass("primary", "h-8.5 text-body")}
          >
            Send report
          </CloseOverlay>
        </>
      }
    >
      <div role="radiogroup" aria-label="Reason" className="flex flex-col gap-2">
        {REASONS.map((item) => {
          const checked = item.reason === reason;
          return (
            <Act
              key={item.reason}
              cta={item.label}
              role="radio"
              aria-checked={checked}
              aria-current={checked ? "true" : undefined}
              onClick={() => setReason(item.reason)}
              className={`flex items-center gap-2.5 rounded-card-sm bg-control px-3 py-2.5 text-left leading-tight ${checked ? "shadow-[inset_0_0_0_1.5px_var(--ic-fg)]" : "hover:bg-control-raised active:opacity-80"}`}
            >
              <span
                aria-hidden
                className={`grid size-4 place-items-center rounded-full border-2 ${checked ? "border-fg" : "border-fg-disabled"}`}
              >
                {checked ? <span className="size-2 rounded-full bg-fg" /> : null}
              </span>
              {item.label}
            </Act>
          );
        })}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-ui leading-tight text-fg-secondary">Tell us more (optional)</span>
        <textarea
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          placeholder="What should the reviewers know?"
          className="h-17.5 resize-none rounded-button bg-control px-3 py-6.5 leading-tight text-fg outline-none placeholder:text-fg-tertiary hover:bg-control-raised focus:bg-control-raised"
        />
      </label>
      {creation ? (
        <div className="flex items-center gap-2.5">
          <Switch label={`Also block @${creation.author.handle}`} checked={blockAuthor} onChange={setBlockAuthor} />
          <span>Also block @{creation.author.handle} · you will not see their creations</span>
        </div>
      ) : null}
    </Dialog>
  );
}
