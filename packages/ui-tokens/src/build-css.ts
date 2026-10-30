import type { Tokens } from "./tokens.ts";

type Pair = readonly [name: string, value: string | number];

function colorVariables(t: Tokens): Pair[] {
  const c = t.color;
  return [
    ["bg-app", c.bg.app],
    ["bg-panel", c.bg.panel],
    ["bg-strip", c.bg.strip],
    ["bg-control", c.bg.control],
    ["bg-control-raised", c.bg["control-raised"]],
    ["bg-overlay", c.bg.overlay],
    ["bg-floating", c.bg.floating],
    ["scrim-modal", c.scrim.modal],
    ["scrim-popover", c.scrim.popover],
    ["fg", c.fg.default],
    ["fg-tool", c.fg.tool],
    ["fg-secondary", c.fg.secondary],
    ["fg-tertiary", c.fg.tertiary],
    ["fg-disabled", c.fg.disabled],
    ["fg-on-selected", c.fg["on-selected"]],
    ["line-subtle", c.line.subtle],
    ["line", c.line.default],
    ["line-strong", c.line.strong],
    ["line-divider", c.line.divider],
    ["line-dashed", c.line.dashed],
    ["fill-hover", c.fill.hover],
    ["fill-ghost", c.fill.ghost],
    ["fill-track-off", c.fill["track-off"]],
    ["selected", c.selected.bg],
    ["on-selected", c.selected.fg],
    ["ring", c.focus.ring],
    ["ok", c.ok.DEFAULT],
    ["ok-tint", c.ok.tint],
    ["warn", c.warn.DEFAULT],
    ["warn-tint", c.warn.tint],
    ["danger", c.danger.DEFAULT],
    ["danger-tint", c.danger.tint],
    ["danger-graphic", c.danger.graphic],
    ["destructive", c.destructive.DEFAULT],
    ["destructive-fg", c.destructive.fg],
    ["proposal", c.proposal.DEFAULT],
    ["proposal-tint", c.proposal.tint],
    ["banner-warn", c.banner.warn.DEFAULT],
    ["banner-warn-border", c.banner.warn.border],
    ["window-close", c.window.close],
    ["window-minimize", c.window.minimize],
    ["window-zoom", c.window.zoom],
  ];
}

const SHADCN: Pair[] = [
  ["background", "bg-app"],
  ["foreground", "fg"],
  ["card", "bg-panel"],
  ["card-foreground", "fg"],
  ["popover", "bg-panel"],
  ["popover-foreground", "fg"],
  ["primary", "selected"],
  ["primary-foreground", "on-selected"],
  ["secondary", "bg-control"],
  ["secondary-foreground", "fg"],
  ["input", "bg-control"],
  ["muted", "bg-control-raised"],
  ["muted-foreground", "fg-tertiary"],
  ["accent", "fill-hover"],
  ["accent-foreground", "fg"],
  ["destructive", "destructive"],
  ["border", "line"],
  ["ring", "ring"],
];

export function toCssVariables(t: Tokens): string {
  const lines = colorVariables(t).map(([name, value]) => `  --ic-${name}: ${value};`);
  lines.push(`  --ic-font-ui: ${t.font.ui};`, `  --ic-font-mono: ${t.font.mono};`);
  for (const [name, value] of Object.entries(t.shadow)) {
    lines.push(`  --ic-shadow-${name}: ${value};`);
  }
  for (const [name, ref] of SHADCN) {
    lines.push(`  --${name}: var(--ic-${ref});`);
  }
  lines.push(`  --radius: ${t.radius.button}px;`);
  return `:root {\n${lines.join("\n")}\n}\n`;
}

export function toTailwindTheme(t: Tokens): string {
  const lines = colorVariables(t).map(([name]) => `  --color-${name.replace(/^bg-/, "")}: var(--ic-${name});`);
  for (const [name, px] of Object.entries(t.radius)) {
    lines.push(`  --radius-${name}: ${px}px;`);
  }
  for (const [name, spec] of Object.entries(t.text)) {
    lines.push(`  --text-${name}: ${spec.size}px;`, `  --text-${name}--line-height: ${spec.line}px;`);
  }
  for (const name of Object.keys(t.shadow)) {
    lines.push(`  --shadow-${name}: var(--ic-shadow-${name});`);
  }
  lines.push("  --font-ui: var(--ic-font-ui);", "  --font-mono: var(--ic-font-mono);");
  return `@theme inline {\n${lines.join("\n")}\n}\n`;
}
