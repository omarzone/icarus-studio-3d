import type { Catalog } from "../../app/navigation/route-registry.ts";
import { ModerationScreen } from "./moderation-screen.tsx";

export const catalog: Catalog = {
  routes: [{ id: "SCR-MODERATION", component: ModerationScreen, maxDiff: 0.03 }],
};
