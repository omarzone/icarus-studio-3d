import { describe, expect, it } from "vitest";
import { countCodeLines } from "./count-code-lines.ts";

describe("countCodeLines", () => {
  it("ignores blank lines and comments in TypeScript", () => {
    expect(countCodeLines("const a = 1;\n\n// note\n/* block\n still */\nconst b = 2;\n", "ts")).toBe(2);
  });

  it("ignores blank lines, comments and docstrings in Python", () => {
    expect(countCodeLines('"""Module."""\n\n# note\nx = 1\n', "py")).toBe(1);
  });
});
