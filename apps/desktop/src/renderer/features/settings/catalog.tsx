import type { Catalog } from "../../app/navigation/route-registry.ts";
import { ModelsPage } from "./models-page.tsx";
import { NotificationsSettingsPage } from "./notifications-settings-page.tsx";
import { PrivacyPage } from "./privacy-page.tsx";
import { ProfileSettingsPage } from "./profile-settings-page.tsx";
import { TrainingPage } from "./training-page.tsx";

export const catalog: Catalog = {
  routes: [
    { id: "SCR-SETTINGS-MODELS", component: ModelsPage, maxDiff: 0.03 },
    { id: "SCR-SETTINGS-PROFILE", component: ProfileSettingsPage, maxDiff: 0.03 },
    { id: "SCR-SETTINGS-PRIVACY", component: PrivacyPage, maxDiff: 0.03 },
    { id: "SCR-SETTINGS-TRAINING", component: TrainingPage, maxDiff: 0.03 },
    { id: "SCR-SETTINGS-NOTIFICATIONS", component: NotificationsSettingsPage, maxDiff: 0.03 },
  ],
};
