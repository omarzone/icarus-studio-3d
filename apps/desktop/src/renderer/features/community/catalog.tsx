import type { Catalog } from "../../app/navigation/route-registry.ts";
import { CommunityScreen } from "./community-screen.tsx";
import { CreationScreen } from "./creation-screen.tsx";
import { ReportDialog } from "./report-dialog.tsx";

export const catalog: Catalog = {
  routes: [
    { id: "SCR-COMMUNITY", component: CommunityScreen, maxDiff: 0.03 },
    { id: "SCR-CREATION", component: CreationScreen, maxDiff: 0.03 },
    { id: "MOD-REPORT", component: ReportDialog, over: "SCR-CREATION", maxDiff: 0.03 },
  ],
};
