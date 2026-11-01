import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./markdown.ts";

describe("markdown inline", () => {
  it("reads bold, italic, strikethrough and inline code", () => {
    expect(parseInline("a **b** *c* ~~d~~ `e*f`")).toEqual([
      { type: "text", text: "a " },
      { type: "strong", children: [{ type: "text", text: "b" }] },
      { type: "text", text: " " },
      { type: "em", children: [{ type: "text", text: "c" }] },
      { type: "text", text: " " },
      { type: "strike", children: [{ type: "text", text: "d" }] },
      { type: "text", text: " " },
      { type: "code", text: "e*f" },
    ]);
  });

  it("nests emphasis and leaves snake_case words and lone stars alone", () => {
    expect(parseInline("**bold _and_ more**")).toEqual([
      {
        type: "strong",
        children: [
          { type: "text", text: "bold " },
          { type: "em", children: [{ type: "text", text: "and" }] },
          { type: "text", text: " more" },
        ],
      },
    ]);
    expect(parseInline("set max_speed_limit to 2 * 3")).toEqual([
      { type: "text", text: "set max_speed_limit to 2 * 3" },
    ]);
  });

  it("reads links, autolinks and bare web addresses without trailing punctuation", () => {
    expect(parseInline("see [docs](https://example.org/a) or https://example.org/b.")).toEqual([
      { type: "text", text: "see " },
      { type: "link", href: "https://example.org/a", children: [{ type: "text", text: "docs" }] },
      { type: "text", text: " or " },
      { type: "link", href: "https://example.org/b", children: [{ type: "text", text: "https://example.org/b" }] },
      { type: "text", text: "." },
    ]);
  });

  it("keeps escaped characters and raw HTML as plain text", () => {
    expect(parseInline("\\*not em\\* <b>hi</b>")).toEqual([{ type: "text", text: "*not em* <b>hi</b>" }]);
  });

  it("turns soft line breaks into spaces and hard breaks into breaks", () => {
    expect(parseInline("one\ntwo  \nthree")).toEqual([
      { type: "text", text: "one two" },
      { type: "break" },
      { type: "text", text: "three" },
    ]);
  });
});

describe("markdown blocks", () => {
  it("reads headings, paragraphs and rules", () => {
    expect(parseMarkdown("## Plan\n\nFirst line\nsame paragraph\n\n---\nAfter")).toEqual([
      { type: "heading", level: 2, children: [{ type: "text", text: "Plan" }] },
      { type: "paragraph", children: [{ type: "text", text: "First line same paragraph" }] },
      { type: "rule" },
      { type: "paragraph", children: [{ type: "text", text: "After" }] },
    ]);
  });

  it("keeps fenced code verbatim with its language", () => {
    expect(parseMarkdown("Run:\n```python\nx = 1  # **no**\n\ny = 2\n```")).toEqual([
      { type: "paragraph", children: [{ type: "text", text: "Run:" }] },
      { type: "code", lang: "python", text: "x = 1  # **no**\n\ny = 2" },
    ]);
  });

  it("closes an unterminated fence at the end of the answer", () => {
    expect(parseMarkdown("```\nstill code")).toEqual([{ type: "code", lang: "", text: "still code" }]);
  });

  it("reads bullet and numbered lists with nesting and their start number", () => {
    expect(parseMarkdown("3. first\n4. second\n   - inner\n- other list")).toEqual([
      {
        type: "list",
        ordered: true,
        start: 3,
        items: [
          [{ type: "paragraph", children: [{ type: "text", text: "first" }] }],
          [
            { type: "paragraph", children: [{ type: "text", text: "second" }] },
            {
              type: "list",
              ordered: false,
              start: 1,
              items: [[{ type: "paragraph", children: [{ type: "text", text: "inner" }] }]],
            },
          ],
        ],
      },
      {
        type: "list",
        ordered: false,
        start: 1,
        items: [[{ type: "paragraph", children: [{ type: "text", text: "other list" }] }]],
      },
    ]);
  });

  it("keeps a list together across blank lines between its items", () => {
    const [list] = parseMarkdown("- a\n\n- b\n\nAfter");
    expect(list?.type === "list" ? list.items.length : 0).toBe(2);
  });

  it("reads blockquotes with blocks inside", () => {
    expect(parseMarkdown("> **Note**\n> - one")).toEqual([
      {
        type: "quote",
        children: [
          { type: "paragraph", children: [{ type: "strong", children: [{ type: "text", text: "Note" }] }] },
          {
            type: "list",
            ordered: false,
            start: 1,
            items: [[{ type: "paragraph", children: [{ type: "text", text: "one" }] }]],
          },
        ],
      },
    ]);
  });

  it("reads tables with alignment, inline marks in cells and missing cells filled", () => {
    expect(parseMarkdown("| Term | Weight |\n|:---|---:|\n| `speed` | 1.0 |\n| crash |")).toEqual([
      {
        type: "table",
        align: ["left", "right"],
        head: [[{ type: "text", text: "Term" }], [{ type: "text", text: "Weight" }]],
        rows: [
          [[{ type: "code", text: "speed" }], [{ type: "text", text: "1.0" }]],
          [[{ type: "text", text: "crash" }], []],
        ],
      },
    ]);
  });

  it("does not take a line with a pipe for a table without a delimiter row", () => {
    expect(parseMarkdown("a | b")).toEqual([{ type: "paragraph", children: [{ type: "text", text: "a | b" }] }]);
  });
});
