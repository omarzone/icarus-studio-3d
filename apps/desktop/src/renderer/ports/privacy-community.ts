import type { CommunityBridge } from "../../shared/community-bridge.ts";
import type { CommunityApi } from "../community-client/community-api.ts";
import { communityApi } from "../community-client/community-api.ts";
import { notificationSettingsView, privacyView } from "./community-views.ts";
import type { NotificationOption, PrivacyOption, SettingsPort } from "./settings-port.ts";

type PrivacyApi = Pick<
  CommunityApi,
  | "privacy"
  | "setPrivacy"
  | "unblock"
  | "exportData"
  | "deleteAccount"
  | "notificationSettings"
  | "setNotificationSettings"
>;

const PRIVACY_FIELDS: Record<PrivacyOption, "show_creations" | "allow_remix" | "allow_comments"> = {
  showCreations: "show_creations",
  allowRemix: "allow_remix",
  allowComments: "allow_comments",
};

const NOTIFICATION_FIELDS: Record<
  NotificationOption,
  "run_finished" | "copilot_needs_ok" | "remix_or_comment" | "community_news"
> = {
  runFinished: "run_finished",
  copilotNeedsOk: "copilot_needs_ok",
  remixOrComment: "remix_or_comment",
  communityNews: "community_news",
};

// Hands a file to the browser's download, which Electron answers with the system's save dialog.
function saveFile(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type PrivacyDeps = {
  api?: PrivacyApi;
  community?: () => CommunityBridge;
  save?: (name: string, text: string) => void;
};

// Privacy, blocking, notification choices, downloading your data and deleting your account, kept on the community
// account of the signed-in person.
export function createCommunityPrivacy({
  api = communityApi,
  community = () => window.icarus.community,
  save = saveFile,
}: PrivacyDeps = {}): Pick<
  SettingsPort,
  | "getPrivacy"
  | "setPrivacy"
  | "unblock"
  | "downloadMyData"
  | "deleteAccount"
  | "getNotificationSettings"
  | "setNotification"
> {
  return {
    getPrivacy: async () => privacyView(await api.privacy()),
    setPrivacy: async ({ option, value }) => privacyView(await api.setPrivacy({ [PRIVACY_FIELDS[option]]: value })),
    unblock: async (handle) => privacyView(await api.unblock(handle)),
    downloadMyData: async () => {
      const data = await api.exportData();
      save(`icarus-community-data-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
    },
    deleteAccount: async () => {
      await api.deleteAccount();
      await community().signOut();
    },
    getNotificationSettings: async () => notificationSettingsView(await api.notificationSettings()),
    setNotification: async ({ option, value }) =>
      notificationSettingsView(await api.setNotificationSettings({ [NOTIFICATION_FIELDS[option]]: value })),
  };
}
