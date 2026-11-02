import { describe, expect, it } from "vitest";
import { openProjectId, sampleDocumentKey } from "./project-key.ts";

describe("sampleDocumentKey", () => {
  it("uses the open project in the app instead of the sample", () => {
    expect(sampleDocumentKey("app", "proj-1", "park-pilot-run")).toBe("proj-1");
  });

  it("has no key in the app while no project is open", () => {
    expect(sampleDocumentKey("app", undefined, "park-pilot-run")).toBeNull();
  });

  it("keeps the sample in the prototype, even with a project in the route", () => {
    expect(sampleDocumentKey("prototype", undefined, "park-pilot-run")).toBe("park-pilot-run");
    expect(sampleDocumentKey("prototype", "park-pilot", "park-pilot-run")).toBe("park-pilot-run");
  });
});

describe("openProjectId", () => {
  it("uses the open project in the app", () => {
    expect(openProjectId("app", "proj-1", "park-pilot")).toBe("proj-1");
  });

  it("has no project in the app while none is open", () => {
    expect(openProjectId("app", undefined, "park-pilot")).toBeNull();
  });

  it("prefers the route project in the prototype and falls back to the sample", () => {
    expect(openProjectId("prototype", "fruit-fly", "park-pilot")).toBe("fruit-fly");
    expect(openProjectId("prototype", undefined, "park-pilot")).toBe("park-pilot");
  });
});
