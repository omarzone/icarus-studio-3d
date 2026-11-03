// STA-BUILD-HARDWARE page
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Act } from "../../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../../app/runtime/engine-query.tsx";
import { usePort } from "../../../app/runtime/port.tsx";
import { buildPort, type HardwareSession } from "../../../ports/build-port.ts";
import { rowNeedingAttention } from "../../../ports/build-views.ts";
import { QueryView } from "../../../ui/query-view.tsx";
import { CheckLine } from "../../copilot/chat-messages.tsx";
import { dialogButton } from "../dialog-button.tsx";
import { HardwareSteps } from "./hardware-steps.tsx";
import { PartCheck } from "./part-check.tsx";

const ALL_CLEAR = "Every joint and sensor fits this kit";

// Checks the body against real hardware step by step: steps on the side, the check and its fix, then safety and parts.
export function HardwarePage({ project, projectName }: { project: string; projectName: string }) {
  const port = usePort(buildPort);
  const client = useQueryClient();
  const key = ["build", "hardware", project] as const;
  const session = useQuery({ queryKey: key, queryFn: () => port.getHardware(project) });
  const recheck = useEngineAction(port.recheckPart);
  const skip = useEngineAction(port.skipPart);
  const saved = { onSuccess: (next: HardwareSession) => client.setQueryData(key, next) };
  return (
    <QueryView query={session}>
      {(data) => {
        const open = rowNeedingAttention(data.check.rows)?.id;
        return (
          <div className="grid h-full min-h-0 grid-cols-[208px_minmax(0,1fr)]">
            <HardwareSteps steps={data.steps} />
            <main className="grid min-h-0 grid-cols-2 gap-5 overflow-hidden pt-4 pr-1.5 pl-3">
              <div className="flex min-h-0 flex-col gap-3.5">
                <h1 className="text-title-2 leading-[29px]">Build {projectName} for real</h1>
                <p className="leading-4 text-fg-secondary">
                  Checked against <b className="font-semibold text-fg">{data.kit.name}</b> · {data.kit.board}
                </p>
                <PartCheck check={data.check} />
                {data.check.problem ? (
                  <p className="rounded-card-sm bg-warn-tint px-3.5 py-3 text-ui leading-4.5">
                    <b className="font-semibold">{data.check.problem.title}</b> {data.check.problem.fix}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <Act
                    cta="Recheck"
                    disabled={!open || recheck.isPending}
                    title={open ? "Check it again against the current revision" : ALL_CLEAR}
                    onClick={() => open && recheck.mutate({ project, part: open }, saved)}
                    className={dialogButton("primary")}
                  >
                    Recheck
                  </Act>
                  <Act
                    cta="Skip this part"
                    disabled={!open || skip.isPending}
                    title={open ? "Accept this gap and leave it out of the verdict" : ALL_CLEAR}
                    onClick={() => open && skip.mutate({ project, part: open }, saved)}
                    className={dialogButton("secondary")}
                  >
                    Skip this part
                  </Act>
                </div>
              </div>
              <div className="flex flex-col gap-3.5">
                <div
                  role="img"
                  aria-label={`${projectName} on the real hardware`}
                  className="h-50 rounded-[18px] bg-control-raised"
                />
                <section className="flex flex-col gap-2 rounded-[18px] bg-control px-4 py-3.5 text-ui">
                  <h2 className="text-body leading-4 font-semibold">Safety</h2>
                  {data.safety.map((rule) => (
                    <CheckLine key={rule} item={{ text: rule, tone: "ok" }} />
                  ))}
                </section>
                <PartsList parts={data.parts} />
              </div>
            </main>
          </div>
        );
      }}
    </QueryView>
  );
}

function PartsList({ parts }: { parts: HardwareSession["parts"] }) {
  const total = parts.reduce((sum, part) => sum + part.usd * part.count, 0);
  return (
    <section className="flex flex-col gap-1.5 rounded-[18px] bg-control px-4 py-3.5 text-ui leading-4">
      <h2 className="text-body leading-4 font-semibold">Parts list</h2>
      {parts.map((part) => (
        <div key={part.name} className="flex justify-between gap-3">
          <span className="truncate">{part.count > 1 ? `${part.count} × ${part.name}` : part.name}</span>
          <span className="shrink-0 font-mono text-fg-secondary">${Math.round(part.usd * part.count)}</span>
        </div>
      ))}
      <div className="flex justify-between pt-1 font-semibold">
        <span>Total, about</span>
        <span>${Math.round(total)}</span>
      </div>
    </section>
  );
}
