import { Box } from "lucide-react";
import { describe, expect, it } from "vitest";
import { toolBehavior, toolTitle } from "./tool-behavior.ts";
import type { Tool } from "./toolbar.tsx";

const mode: Tool = { label: "Paint", icon: Box, hint: "Choose the material of a surface" };
const opener: Tool = { label: "Copies", icon: Box, hint: "Set the parallel copies", to: "POP-TRAINING-COPIES" };

describe("toolBehavior", () => {
  it("keeps the selectable mode tools of the prototype", () => {
    expect(toolBehavior({ tool: mode, mode: "prototype", hasAction: false })).toEqual({ kind: "mode" });
  });

  it("marks a mode tool with nothing behind it as not available yet in the app", () => {
    expect(toolBehavior({ tool: mode, mode: "app", hasAction: false })).toEqual({ kind: "not-yet" });
  });

  it("runs the workspace's action in the app before any destination", () => {
    expect(toolBehavior({ tool: opener, mode: "app", hasAction: true })).toEqual({ kind: "act" });
    expect(toolBehavior({ tool: opener, mode: "prototype", hasAction: true })).toEqual({
      kind: "go",
      to: "POP-TRAINING-COPIES",
    });
  });

  it("follows a screen override, and a null override leaves the tool without destination", () => {
    expect(toolBehavior({ tool: mode, mode: "app", hasAction: false, override: "MOD-START-TRAINING" })).toEqual({
      kind: "go",
      to: "MOD-START-TRAINING",
    });
    expect(toolBehavior({ tool: opener, mode: "prototype", hasAction: false, override: null })).toEqual({
      kind: "mode",
    });
    expect(toolBehavior({ tool: opener, mode: "app", hasAction: false, override: null })).toEqual({
      kind: "not-yet",
    });
  });

  it("dims a tool that cannot act right now in the app with its reason, and keeps the prototype's design", () => {
    const reason = "No run is training right now";
    expect(toolBehavior({ tool: opener, mode: "app", hasAction: false, unavailable: reason })).toEqual({
      kind: "unavailable",
      reason,
    });
    expect(toolBehavior({ tool: opener, mode: "prototype", hasAction: false, unavailable: reason })).toEqual({
      kind: "go",
      to: "POP-TRAINING-COPIES",
    });
  });
});

describe("toolTitle", () => {
  it("names the tool and its purpose, and says when it is not available yet", () => {
    expect(toolTitle(mode, false)).toBe("Paint: choose the material of a surface");
    expect(toolTitle(mode, true)).toBe("Paint: choose the material of a surface. Not available yet.");
  });
});
