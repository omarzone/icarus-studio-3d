import { expect, it } from "vitest";
import { shortcutAction } from "./undo-shortcuts.ts";

const key = (
  init: Partial<{ key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; typing: boolean }>,
) => ({
  key: "z",
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  typing: false,
  ...init,
});

it.each([
  [key({ ctrlKey: true }), "undo"],
  [key({ metaKey: true }), "undo"],
  [key({ ctrlKey: true, shiftKey: true, key: "Z" }), "redo"],
  [key({ ctrlKey: true, key: "y" }), "redo"],
  [key({}), null],
  [key({ ctrlKey: true, typing: true }), null],
  [key({ ctrlKey: true, key: "s" }), null],
])("%o is %s", (event, expected) => {
  expect(shortcutAction(event)).toBe(expected);
});
