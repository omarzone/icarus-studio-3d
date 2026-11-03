import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NavigationProvider } from "../../app/navigation/navigation-store.tsx";
import type { ContextUsageView } from "../../ports/copilot-port.ts";
import { ContextBreakdown } from "./context-popover.tsx";

const USAGE: ContextUsageView = {
  model: "reasoner",
  window: 64_000,
  windowKnown: false,
  used: 30_000,
  reserve: 9_600,
  free: 24_400,
  categories: [
    { part: "system", tokens: 1_800, items: [] },
    {
      part: "tools",
      tokens: 22_000,
      items: [
        { label: "look", tokens: 900 },
        { label: "try", tokens: 21_100 },
      ],
    },
    { part: "summary", tokens: 0, items: [] },
    { part: "history", tokens: 6_200, items: [{ label: "Your messages (3)", tokens: 6_200 }] },
  ],
  compaction: { historyTokens: 6_000, foldAt: 19_040, folding: false, foldsNextTurn: false, pruneAt: 38_080 },
};

const noop = () => {};

describe("context breakdown", () => {
  it("shows used and total tokens, every part with its share, the reserve, free room and the next fold", () => {
    const html = renderToStaticMarkup(<ContextBreakdown state={{ status: "ready", usage: USAGE }} />);
    expect(html).toContain("30k / 64k tokens · 47%");
    expect(html).toContain("64k token window assumed");
    for (const label of ["System prompt", "Tool definitions", "Conversation summary", "Conversation", "Free"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Reserved for the answer");
    expect(html).toContain("after about 13k more tokens of conversation");
    expect(html).toMatch(/data-cta="tool-definitions"[^>]*aria-expanded="false"/);
    expect(html).not.toMatch(/data-cta="system-prompt"/);
  });

  it("points to the model settings when no model is connected", () => {
    const html = renderToStaticMarkup(
      <NavigationProvider initial={{ screen: "SCR-WORLD", overlay: null, params: {} }}>
        <ContextBreakdown state={{ status: "ready", usage: { ...USAGE, model: null } }} />
      </NavigationProvider>,
    );
    expect(html).toContain("No model is connected yet");
    expect(html).toContain('data-goes-to="SCR-SETTINGS-MODELS"');
  });

  it("has a loading and an error state with a way to try again", () => {
    expect(renderToStaticMarkup(<ContextBreakdown state={{ status: "loading" }} />)).toContain("Counting the context");
    const failed = renderToStaticMarkup(
      <ContextBreakdown state={{ status: "error", message: "The engine did not answer", retry: noop }} />,
    );
    expect(failed).toContain("The engine did not answer");
    expect(failed).toContain('data-cta="try-again"');
  });
});
