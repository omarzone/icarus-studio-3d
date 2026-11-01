// TAB-WHAT-IT-SENSES
import type { PlaySession } from "../../../ports/play-port.ts";
import { LiveBarList } from "../live-bar-list.tsx";

// Every sense of the body as a live bar, built from its sensor components.
export function WhatItSensesTab({ senses }: { senses: PlaySession["senses"] }) {
  return (
    <div className="flex flex-col gap-2.25 px-3.5 py-3">
      <LiveBarList bars={senses.bars} />
      {senses.note ? <p className="text-meta leading-normal text-fg-tertiary">{senses.note}</p> : null}
    </div>
  );
}
