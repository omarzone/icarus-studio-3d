// TAB-WHAT-IT-DECIDES
import { GoTo } from "../../../app/navigation/go-to.tsx";
import type { LiveBar } from "../../../ports/play-port.ts";
import { buttonClass } from "../../../ui/button-styles.ts";
import { LiveBarList } from "../live-bar-list.tsx";

// Live outputs of the brain and which brain is playing.
export function WhatItDecidesTab({ bars, brain }: { bars: readonly LiveBar[]; brain: string }) {
  return (
    <div className="flex flex-col gap-2.25 px-3.5 py-3">
      <LiveBarList bars={bars} />
      <p className="text-meta leading-normal text-fg-tertiary">{brain}</p>
      <GoTo
        to="SCR-RESULTS"
        cta="Use another brain"
        className={buttonClass("secondary", "h-8.5! justify-start px-4! text-body!")}
      >
        Use another brain
      </GoTo>
    </div>
  );
}
