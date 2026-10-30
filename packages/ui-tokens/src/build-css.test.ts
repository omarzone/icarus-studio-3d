import { expect, it } from "vitest";
import { toCssVariables, toTailwindTheme } from "./build-css.ts";
import { tokens } from "./tokens.ts";

it("emits css variables and the shadcn mapping", () => {
  const css = toCssVariables(tokens);
  expect(css).toContain("--ic-bg-app: #121212;");
  expect(css).toContain("--background: var(--ic-bg-app);");
  expect(css).toContain("--radius: 10px;");
});

it("exposes token utilities to Tailwind", () => {
  const theme = toTailwindTheme(tokens);
  expect(theme).toContain("--color-panel: var(--ic-bg-panel);");
  expect(theme).toContain("--color-fg-secondary: var(--ic-fg-secondary);");
  expect(theme).toContain("--radius-card: 16px;");
});
