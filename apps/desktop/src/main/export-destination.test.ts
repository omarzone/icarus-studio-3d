import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { saveChoice, suggestedZipName } from "./export-destination.ts";

const app = resolve("/apps/icarus");
const folders = new Set([resolve("/home/me"), app]);
const exists = (path: string) => folders.has(resolve(path));

it("passes a zip in an existing folder and adds the extension when it is missing", () => {
  const path = resolve("/home/me/robot.zip");
  expect(saveChoice({ canceled: false, filePath: path }, [app], exists)).toEqual({ kind: "chosen", path });
  expect(saveChoice({ canceled: false, filePath: resolve("/home/me/robot") }, [app], exists)).toEqual({
    kind: "chosen",
    path,
  });
});

it("reads a closed dialog as cancelled", () => {
  expect(saveChoice({ canceled: true }, [app], exists)).toEqual({ kind: "cancelled" });
  expect(saveChoice({ canceled: false, filePath: "" }, [app], exists)).toEqual({ kind: "cancelled" });
});

it("refuses relative paths, missing folders, folders and places inside the app", () => {
  const refused = (filePath: string) => saveChoice({ canceled: false, filePath }, [app], exists).kind;
  expect(refused("robot.zip")).toBe("refused");
  expect(refused(resolve("/nowhere/robot.zip"))).toBe("refused");
  expect(refused(join(app, "robot.zip"))).toBe("refused");
  expect(refused(resolve("/home/me"))).toBe("refused");
});

it("suggests a plain zip file name whatever the renderer sends", () => {
  expect(suggestedZipName("park-pilot-r3.zip")).toBe("park-pilot-r3.zip");
  expect(suggestedZipName("../../evil name")).toBe("evil-name.zip");
  expect(suggestedZipName(42)).toBe("export.zip");
});
