import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadingSteps, loadingTitle, PlayLoading } from "./play-loading.tsx";

describe("opening Play", () => {
  it("follows the stages the engine reports: the world, then the brain, then starting", () => {
    expect(loadingSteps(undefined).map((step) => step.state)).toEqual(["todo", "todo", "todo"]);
    expect(loadingSteps("world").map((step) => step.state)).toEqual(["running", "todo", "todo"]);
    expect(loadingSteps("brain").map((step) => step.state)).toEqual(["done", "running", "todo"]);
    expect(loadingSteps("starting").map((step) => step.state)).toEqual(["done", "done", "running"]);
    expect(loadingTitle(undefined)).toBe("Connecting to the engine…");
    expect(loadingTitle("brain")).toBe("Loading the brain…");
  });

  it("covers the view with the current step as a status", () => {
    const html = renderToStaticMarkup(<PlayLoading stage="world" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Preparing the world…"');
    expect(html).toContain("Loading the brain…");
  });
});
