import type { Catalog } from "../../app/navigation/route-registry.ts";
import { ProfileScreen } from "./profile-screen.tsx";
import { SignInDialog } from "./sign-in-dialog.tsx";

export const catalog: Catalog = {
  routes: [
    { id: "SCR-PROFILE", component: ProfileScreen, maxDiff: 0.03 },
    { id: "MOD-SIGN-IN", component: SignInDialog, over: "SCR-HOME", maxDiff: 0.03 },
  ],
};
