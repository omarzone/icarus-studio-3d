import { useQueryClient } from "@tanstack/react-query";
import { GoTo } from "../../app/navigation/go-to.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { bodyPort } from "../../ports/body-port.ts";
import { ActionButton } from "../../ui/action-button.tsx";
import { dialogButtonClass } from "../../ui/dialog-button.ts";
import { rigCheckKey, useRigCheck } from "./rig-check/rig-check-panel.tsx";

// Amber banner over the view that blocks training until the body passes its physics tests, with the fix.
export function CheckFailedBanner({ body }: { body: string }) {
  const port = usePort(bodyPort);
  const client = useQueryClient();
  const check = useRigCheck(body);
  const problems = check.data?.checks.filter((item) => item.tone === "warn").length ?? 0;
  if (problems === 0) {
    return null;
  }
  return (
    <div
      role="alert"
      className="absolute inset-x-5.75 top-4 flex items-center gap-3 rounded-[14px] border border-banner-warn-border bg-banner-warn px-3.5 py-3"
    >
      <span aria-hidden className="font-bold text-warn">
        !
      </span>
      <span className="flex-1 text-body">
        <b className="font-semibold">
          Can’t train yet, {problems} {problems === 1 ? "problem" : "problems"} in the body.
        </b>{" "}
        <span className="text-fg-secondary">Physics tests must pass so training is real.</span>
      </span>
      <ActionButton
        cta={problems === 2 ? "Fix both for me" : "Fix them for me"}
        to="SCR-BODY"
        run={async () => client.setQueryData(rigCheckKey(body), await port.fixProblems(body))}
        className={dialogButtonClass("primary")}
      >
        {problems === 2 ? "Fix both for me" : "Fix them for me"}
      </ActionButton>
      <GoTo to="SCR-BODY" cta="Show me" className={dialogButtonClass("secondary")}>
        Show me
      </GoTo>
    </div>
  );
}
