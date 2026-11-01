// TAB-WHAT-IT-DECIDES
import { Act, GoTo } from "../../../app/navigation/go-to.tsx";
import type { LiveBar } from "../../../ports/play-port.ts";
import { buttonClass } from "../../../ui/button-styles.ts";
import { NOT_YET_CLASS, useNotYet } from "../../../ui/not-yet.ts";
import { LiveBarList } from "../live-bar-list.tsx";

// Live outputs of the brain and which brain is playing.
export function WhatItDecidesTab({ bars, brain }: { bars: readonly LiveBar[]; brain: string }) {
  const notYet = useNotYet();
  const className = buttonClass("secondary", `h-8.5! justify-start px-4! text-body! ${NOT_YET_CLASS}`);
  return (
    <div className="flex flex-col gap-2.25 px-3.5 py-3">
      <LiveBarList bars={bars} />
      <p className="text-meta leading-normal text-fg-tertiary">{brain}</p>
      {notYet ? (
        // Play always runs the best brain of this revision; picking another one comes with Results.
        <Act
          cta="Use another brain"
          className={className}
          {...notYet("Use another brain", "Choose which trained brain plays")}
        >
          Use another brain
        </Act>
      ) : (
        <GoTo to="SCR-RESULTS" cta="Use another brain" className={className}>
          Use another brain
        </GoTo>
      )}
    </div>
  );
}
