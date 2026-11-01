# 003 · Screens before logic, behind ports

**Context.** Every screen, dialog and flow in `docs/design/screens.md` is designed, but most engine logic arrives sprint by sprint. Waiting for the logic leaves flows unusable and untested for weeks; drawing screens with sample data inside the app would break *Real or nothing*.

**Decision.** Build every catalog ID now. Screens never reach the engine directly: each one reads and acts through a **port** in `apps/desktop/src/renderer/ports/` (a typed interface). A port has two implementations: `app`, which is the engine client or a `pending(...)` stub that answers *Not available yet*, and `prototype`, an in-memory fixture with the mockups' sample data. The app always runs `app`; the design gallery, the e2e checks and `pnpm prototype` run `prototype`. Navigation is one typed store (`app/navigation/`), and every control that leads somewhere is a `GoTo` with its catalog destination.

**Consequences.** Every flow can be clicked and checked today (parity, catalog, flows and interaction e2e), and the app stays honest. `apps/desktop/PENDING.md` is generated from the `pending(...)` declarations, so the list of missing logic never drifts. Plugging in logic means replacing one `pending(...)` with the engine call; the screen does not change. Port view types are mapped from `@icarus/contracts` once those contracts exist.
