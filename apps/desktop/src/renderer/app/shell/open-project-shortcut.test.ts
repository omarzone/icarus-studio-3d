import { expect, it } from "vitest";
import { isOpenProjectShortcut } from "./open-project-shortcut.ts";

const key = (
  init: Partial<{ key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }>,
) => ({
  key: "o",
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...init,
});

it.each([
  [key({ ctrlKey: true }), true],
  [key({ metaKey: true, key: "O" }), true],
  [key({}), false],
  [key({ ctrlKey: true, shiftKey: true }), false],
  [key({ ctrlKey: true, altKey: true }), false],
  [key({ ctrlKey: true, key: "p" }), false],
])("Ctrl O opens a project: %o → %s", (keys, expected) => {
  expect(isOpenProjectShortcut(keys)).toBe(expected);
});
