// TAB-TIMELAPSE
import { GoTo } from "../../../app/navigation/go-to.tsx";
import { panelTabClass } from "../../../ui/panel.tsx";

// The timelapse opens full screen as its own presentation (SCR-TIMELAPSE).
export function TimelapseTab() {
  return (
    <GoTo to="SCR-TIMELAPSE" cta="Timelapse" role="tab" aria-selected={false} className={panelTabClass(false)}>
      Timelapse
    </GoTo>
  );
}
