import { createContext } from "react";

// Lets a card over the view open the Replay tab playing one checkpoint's recorded episode.
export type ViewportTabs = { replay: (step: number) => void };

export const ViewportTabsContext = createContext<ViewportTabs | null>(null);
