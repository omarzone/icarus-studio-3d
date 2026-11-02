import { describe, expect, it } from "vitest";
import type { ProjectSummary } from "../../ports/projects-port.ts";
import { recentProjects } from "./recent-order.ts";

const project = (id: string, updatedAt?: string): ProjectSummary => ({
  id,
  name: id,
  description: "",
  status: "draft",
  statusLine: "",
  revision: "rev 1",
  updatedAt,
});

describe("recent projects", () => {
  it("puts the project opened or edited last first and keeps only a few", () => {
    const projects = [
      project("edited-monday", "2026-11-02T09:00:00Z"),
      project("edited-sunday", "2026-11-01T09:00:00Z"),
      project("never-edited"),
      project("old", "2026-10-01T09:00:00Z"),
    ];
    const opened = (id: string) => (id === "edited-sunday" ? Date.parse("2026-11-02T10:00:00Z") : null);

    expect(recentProjects(projects, opened, 3).map((item) => item.id)).toEqual([
      "edited-sunday",
      "edited-monday",
      "old",
    ]);
  });
});
