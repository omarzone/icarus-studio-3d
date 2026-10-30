import type { ReactNode } from "react";
import type { Catalog } from "../../app/navigation/route-registry.ts";
import { DecisionsPanel } from "./decisions/decisions-panel.tsx";
import { EventsPanel } from "./events/events-panel.tsx";
import { PlayHeader } from "./play-header/play-header.tsx";
import { PlayScreen } from "./play-screen.tsx";
import { SensesPanel } from "./senses/senses-panel.tsx";
import { VisionPanel } from "./vision/vision-panel.tsx";

function Column({ width, children }: { width: string; children: ReactNode }) {
  return <div className={`flex h-[900px] flex-col gap-2.5 p-3 ${width}`}>{children}</div>;
}

export const catalog: Catalog = {
  routes: [
    { id: "SCR-PLAY", maxDiff: 0.03, component: PlayScreen },
    { id: "SCR-PLAY.b", maxDiff: 0.03, component: PlayScreen },
  ],
  modules: [
    {
      id: "HDR-PLAY",
      component: () => (
        <div className="grid grid-cols-1">
          <PlayHeader project="Park Pilot" returnTo="SCR-WORLD" />
        </div>
      ),
    },
    {
      id: "PNL-PLAY-SENSES",
      component: () => (
        <Column width="w-69">
          <SensesPanel project="fruit-fly" />
        </Column>
      ),
    },
    {
      id: "PNL-PLAY-DECISIONS",
      component: () => (
        <Column width="w-69">
          <DecisionsPanel project="park-pilot" />
        </Column>
      ),
    },
    {
      id: "PNL-PLAY-VISION",
      component: () => (
        <Column width="w-69">
          <VisionPanel project="fruit-fly" />
        </Column>
      ),
    },
    {
      id: "PNL-PLAY-EVENTS",
      component: () => (
        <Column width="w-200">
          <EventsPanel project="park-pilot" />
        </Column>
      ),
    },
  ],
};
