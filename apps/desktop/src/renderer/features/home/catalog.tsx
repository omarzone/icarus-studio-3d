import type { Catalog } from "../../app/navigation/route-registry.ts";
import { HomeScreen } from "./home-screen.tsx";

export const catalog: Catalog = {
  routes: [
    { id: "SCR-HOME", component: HomeScreen, maxDiff: 0.03 },
    { id: "STA-HOME-EMPTY", component: HomeScreen, maxDiff: 0.03 },
  ],
};
