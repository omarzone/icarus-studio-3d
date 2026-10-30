import type { Catalog } from "../../app/navigation/route-registry.ts";
import { DeleteProjectDialog } from "./delete-project-dialog.tsx";
import { DuplicateDialog } from "./duplicate-dialog.tsx";
import { HistoryDialog } from "./history-dialog.tsx";
import { ProjectMenu } from "./project-menu.tsx";
import { RenameDialog } from "./rename-dialog.tsx";
import { ShareDialog } from "./share-dialog.tsx";

export const catalog: Catalog = {
  routes: [
    { id: "POP-PROJECT-MENU", component: ProjectMenu, over: "SCR-WORLD", maxDiff: 0.05 },
    { id: "MOD-RENAME", component: RenameDialog, over: "SCR-WORLD", maxDiff: 0.05 },
    { id: "MOD-DUPLICATE", component: DuplicateDialog, over: "SCR-WORLD", maxDiff: 0.05 },
    { id: "MOD-HISTORY", component: HistoryDialog, over: "SCR-WORLD", maxDiff: 0.05 },
    { id: "MOD-SHARE", component: ShareDialog, over: "SCR-WORLD", maxDiff: 0.05 },
    { id: "MOD-DELETE-PROJECT", component: DeleteProjectDialog, over: "SCR-WORLD", maxDiff: 0.05 },
  ],
};
