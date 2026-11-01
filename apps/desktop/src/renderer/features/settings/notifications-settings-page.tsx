// SCR-SETTINGS-NOTIFICATIONS
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type NotificationOption, type NotificationSettings, settingsPort } from "../../ports/settings-port.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { SettingSwitchRow } from "./setting-switch-row.tsx";
import { SettingsLayout } from "./settings-layout.tsx";

const OPTIONS: readonly { option: NotificationOption; title: string; detail: string }[] = [
  { option: "runFinished", title: "A training run finishes", detail: "Also when it stops with an error" },
  { option: "copilotNeedsOk", title: "The copilot needs your OK", detail: "When Autopilot is set to Ask first" },
  { option: "remixOrComment", title: "Someone remixes or comments", detail: "On your public creations" },
  { option: "communityNews", title: "Community news", detail: "At most once a week" },
];

export function NotificationsSettingsPage() {
  const settings = usePort(settingsPort);
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["settings", "notifications"], queryFn: settings.getNotificationSettings });
  const setNotification = useEngineAction(settings.setNotification);
  return (
    <SettingsLayout
      section="notifications"
      title="Notifications"
      description="Shown in the app and in your system tray."
    >
      <QueryView query={query}>
        {(values) =>
          OPTIONS.map(({ option, title, detail }) => (
            <SettingSwitchRow
              key={option}
              title={title}
              detail={detail}
              checked={values[option]}
              onChange={(value) =>
                setNotification.mutate(
                  { option, value },
                  {
                    onSuccess: (next: NotificationSettings) => client.setQueryData(["settings", "notifications"], next),
                  },
                )
              }
            />
          ))
        }
      </QueryView>
    </SettingsLayout>
  );
}
