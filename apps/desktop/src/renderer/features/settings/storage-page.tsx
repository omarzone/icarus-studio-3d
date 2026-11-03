// SCR-SETTINGS-TRAINING with page=storage: its own page in the side navigation.
import { SettingsLayout } from "./settings-layout.tsx";
import { StorageSection } from "./storage-section.tsx";

export function StoragePage() {
  return (
    <SettingsLayout
      section="storage"
      title="Storage"
      description="Where your projects, trained brains and checkpoints are saved on this computer."
    >
      <StorageSection />
    </SettingsLayout>
  );
}
