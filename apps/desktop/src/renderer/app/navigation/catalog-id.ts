// Identifiers from docs/design/screens.md.
export type ScreenId = `SCR-${string}` | `STA-${string}` | `SYS-${string}` | `REF-${string}`;
export type OverlayId = `MOD-${string}` | `POP-${string}`;
export type ModuleId = `HDR-${string}` | `PNL-${string}`;
export type RouteId = ScreenId | OverlayId;

export function isOverlay(id: RouteId): id is OverlayId {
  return id.startsWith("MOD-") || id.startsWith("POP-");
}

export function ctaSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
