import type { Catalog } from "../../app/navigation/route-registry.ts";
import { NotificationsPopover } from "./notifications-popover.tsx";

export const catalog: Catalog = {
  routes: [{ id: "POP-NOTIFICATIONS", component: NotificationsPopover, over: "SCR-HOME", maxDiff: 0.03 }],
};
