// TAB-HISTORY
import { GoTo } from "../../app/navigation/go-to.tsx";
import { panelTabClass } from "../../ui/panel.tsx";

// Every revision of the project; the tab opens the History dialog (MOD-HISTORY).
export function HistoryTab() {
  return (
    <GoTo to="MOD-HISTORY" cta="History" role="tab" aria-selected={false} className={panelTabClass(false)}>
      History
    </GoTo>
  );
}
