# 004 · Dockable workspace panels

**Context.** Workspaces were fixed columns, while creators expect what every professional desktop tool offers: move a panel to another group, split, resize, float it or put it on another screen, close it and bring it back. Switching workspaces also rebuilt every panel and showed a blank frame.

**Decision.** Workspaces dock their panels with `dockview-react` (MIT, no dependencies; floating groups and popout windows are in the free core). Each workspace declares its panels once (`DockPanels`): a title, its content and a *home* that is both its place in the default layout and where it returns when reopened. A docked `Panel` draws its own tabs and options inside the dock's tab bar, so a group keeps the style guide's single strip; only the grip drags. Layouts are saved per workspace and panel set; the design gallery always opens the default. The router keeps the leaving screen on view until the next one has its data.

**Consequences.** Users can arrange and restore every workspace (header *Panels* menu, *Reset layout*, ⋯ menu per panel), and the default layout still matches the design. The header gains *Panels* and anchors the workspace tabs, so docked routes allow 4.5% parity difference instead of 3%. Popped-out windows open the bundled `popout.html` only; the main process denies every other window.
