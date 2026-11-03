import type { ExportChoice, ExportPlan, HardwareCheck, HardwareCheckRequest, HardwareRow } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import type { SaveChoice } from "../../shared/export-bridge.ts";
import type { BuildApi } from "../engine-client/build-api.ts";
import { isExportPlan, isHardwareCheck } from "../engine-client/build-api.ts";
import { createEngineBuild } from "./build-engine.ts";
import { hardwareSessionView, rowNeedingAttention, rowReading } from "./build-views.ts";

const row = (id: string, status: HardwareRow["status"], extra: Partial<HardwareRow> = {}): HardwareRow => ({
  id,
  part: id,
  kind: "joint",
  role: "joint",
  hardware: "Metal-gear servo",
  need: 0.4,
  limit: 1,
  unit: "N·m",
  fraction: 0.4,
  status,
  measured: true,
  gap: `${id} gap`,
  ...extra,
});

const check = (rows: HardwareRow[], verdict: HardwareCheck["verdict"]): HardwareCheck => ({
  project_id: "p",
  revision: 2,
  kit: { id: "servo_humanoid", name: "Servo kit", board: "Pi" },
  kits: [{ id: "servo_humanoid", name: "Servo kit", board: "Pi" }],
  rows,
  verdict,
  problem: verdict === "pass" ? null : { title: "Knee does not fit this kit.", fix: "Stronger parts." },
  parts: [{ name: "Servo", count: 6, usd: 10 }],
  safety: ["Start at half torque"],
  measured_from: "Run 2 at step 50,000, one evaluation episode",
});

function fakeApi(saves: string[] = []) {
  const plans: ExportChoice[] = [];
  const checks: HardwareCheckRequest[] = [];
  const api: BuildApi = {
    targets: async () => [{ kind: "export-brain", detail: "ONNX file · 9.5 KB" }],
    plan: async (_project, choice) => {
      plans.push(choice);
      const files = (choice.options ?? []).map((option) => ({ path: `${option}.txt`, bytes: 10, description: option }));
      return {
        format: choice.format ?? "package",
        options: choice.options ?? [],
        name: "walker-r2.zip",
        files,
        total_bytes: files.length * 10,
        brain: null,
        notes: ["No trained brain yet"],
      } satisfies ExportPlan;
    },
    write: async (_project, body) => {
      saves.push(body.destination);
      return { path: body.destination, files: [], total_bytes: 30 };
    },
    hardware: async (_project, body) => {
      checks.push(body);
      const skipped = new Set(body.skipped ?? []);
      return check(
        [row("knee", skipped.has("knee") ? "skipped" : "fail"), row("hip", "warn")],
        skipped.has("knee") ? "warn" : "fail",
      );
    },
  };
  return { api, plans, checks };
}

describe("export", () => {
  it("keeps the format and options per project and asks the engine for the plan of that choice", async () => {
    const { api, plans } = fakeApi();
    const build = createEngineBuild(api, async () => ({ kind: "cancelled" }));
    expect((await build.getExportPlan("p")).format).toBe("package");
    await build.setExportFormat({ project: "p", format: "urdf" });
    const plan = await build.setExportOption({ project: "p", id: "history", on: true });
    expect(plans.at(-1)).toEqual({ format: "urdf", options: ["spec", "runtime", "parts", "history"] });
    expect(plan.options.find((option) => option.id === "history")?.on).toBe(true);
    expect(plan.files.map((file) => file.path)).toContain("history.txt");
    expect(plan.notes).toEqual(["No trained brain yet"]);
    expect((await build.getExportPlan("other")).format).toBe("package");
  });

  it("writes the zip only where the save dialog chose and does nothing when it is closed", async () => {
    const saves: string[] = [];
    const answers: SaveChoice[] = [{ kind: "cancelled" }, { kind: "chosen", path: "/home/me/walker.zip" }];
    const names: string[] = [];
    const build = createEngineBuild(fakeApi(saves).api, async (name) => {
      names.push(name);
      return answers.shift() ?? { kind: "cancelled" };
    });
    expect(await build.downloadExport("p")).toEqual({ kind: "cancelled" });
    expect(saves).toEqual([]);
    expect(await build.downloadExport("p")).toEqual({ kind: "saved", path: "/home/me/walker.zip", bytes: 30 });
    expect(saves).toEqual(["/home/me/walker.zip"]);
    expect(names).toEqual(["walker-r2.zip", "walker-r2.zip"]);
  });

  it("fails with the main process's reason when it refuses the place", async () => {
    const build = createEngineBuild(fakeApi().api, async () => ({ kind: "refused", reason: "Not inside the app" }));
    await expect(build.downloadExport("p")).rejects.toThrow("Not inside the app");
  });
});

describe("hardware", () => {
  it("skips a part by sending it with every later check, and rechecks the current revision", async () => {
    const { api, checks } = fakeApi();
    const build = createEngineBuild(api, async () => ({ kind: "cancelled" }));
    const first = await build.getHardware("p");
    expect(rowNeedingAttention(first.check.rows)?.id).toBe("knee");
    const skipped = await build.skipPart({ project: "p", part: "knee" });
    expect(skipped.check.rows.map((item) => item.status)).toEqual(["skipped", "warn"]);
    expect(rowNeedingAttention(skipped.check.rows)?.id).toBe("hip");
    await build.recheckPart({ project: "p", part: "hip" });
    expect(checks.map((item) => item.skipped)).toEqual([[], ["knee"], ["knee"]]);
  });

  it("shows steps from the verdict and readings from need and rating", () => {
    const failing = hardwareSessionView(check([row("knee", "fail")], "fail"));
    expect(failing.steps.map((step) => step.status)).toEqual(["done", "current", "todo", "todo"]);
    expect(failing.check.instructions).toContain("Run 2 at step 50,000");
    const passing = hardwareSessionView(check([row("knee", "pass")], "pass"));
    expect(passing.steps.map((step) => step.status)).toEqual(["done", "done", "current", "todo"]);
    expect(rowReading(row("knee", "pass"))).toBe("0.40 / 1.00 N·m");
    expect(rowReading(row("goal", "warn", { hardware: null, role: "estimate" }))).toBe("estimate");
    expect(rowReading(row("wheel", "fail", { hardware: null }))).toBe("no part");
    expect(rowReading(row("imu", "pass", { need: null, limit: null }))).toBe("covered");
  });

  it("accepts the engine's documents and refuses broken ones", () => {
    expect(isHardwareCheck(check([row("knee", "fail")], "fail"))).toBe(true);
    expect(isHardwareCheck({ ...check([row("knee", "fail")], "fail"), verdict: "maybe" })).toBe(false);
    const plan = { format: "onnx", options: [], name: "a.zip", files: [], total_bytes: 0, brain: null, notes: [] };
    expect(isExportPlan(plan)).toBe(true);
    expect(isExportPlan({ ...plan, files: [{ path: 1 }] })).toBe(false);
  });
});
