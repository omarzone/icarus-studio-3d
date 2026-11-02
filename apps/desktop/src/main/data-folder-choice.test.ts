import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { folderChoice } from "./data-folder-choice.ts";

const app = resolve("/apps/icarus");
const exists = () => true;

it("passes on an existing folder the person picked", () => {
  const folder = resolve("/data/icarus");
  expect(folderChoice({ canceled: false, filePaths: [folder] }, [app], exists)).toEqual({ kind: "chosen", folder });
});

it("reads a closed picker as cancelled", () => {
  expect(folderChoice({ canceled: true, filePaths: [] }, [app], exists)).toEqual({ kind: "cancelled" });
});

it("refuses a folder inside the app, a relative path and a missing folder", () => {
  const refused = (path: string, found = true) =>
    folderChoice({ canceled: false, filePaths: [path] }, [app], () => found).kind;
  expect(refused(join(app, "resources"))).toBe("refused");
  expect(refused(app)).toBe("refused");
  expect(refused("data")).toBe("refused");
  expect(refused(resolve("/data/icarus"), false)).toBe("refused");
  expect(refused(resolve("/apps/icarus-data"))).toBe("chosen");
});
