import { type Inline, parseInline } from "./markdown-inline.ts";

// Block markdown of copilot answers (GitHub flavored subset): headings, paragraphs, fenced code, lists,
// quotes, tables and rules. The result is plain data; nothing here ever becomes HTML.

export { type Inline, parseInline };

export type TableAlign = "left" | "center" | "right" | null;

export type Block =
  | { type: "heading"; level: number; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "code"; lang: string; text: string }
  | { type: "list"; ordered: boolean; start: number; items: Block[][] }
  | { type: "quote"; children: Block[] }
  | { type: "table"; align: TableAlign[]; head: Inline[][]; rows: Inline[][][] }
  | { type: "rule" };

const FENCE = /^( {0,3})(`{3,}|~{3,})\s*([^`\s]*)/;
const HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*$/;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}> ?/;
const LIST_ITEM = /^( *)([-*+]|(\d{1,9})[.)])( +|$)(.*)$/;
const DELIMITER_CELL = /^:?-+:?$/;

type Marker = { indent: number; ordered: boolean; start: number; contentIndent: number; content: string };

const isBlank = (line: string | undefined) => line === undefined || line.trim() === "";
const indentOf = (line: string) => line.length - line.trimStart().length;

function marker(line: string): Marker | null {
  const match = LIST_ITEM.exec(line);
  if (!match) {
    return null;
  }
  const [, indent = "", bullet = "", number, spaces = "", content = ""] = match;
  // More than four spaces after the marker means the content is indented code; treat it as one space.
  const gap = spaces.length > 4 || content === "" ? 1 : spaces.length;
  return {
    indent: indent.length,
    ordered: number !== undefined,
    start: number === undefined ? 1 : Number(number),
    contentIndent: indent.length + bullet.length + gap,
    content,
  };
}

function cells(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) {
    row = row.slice(1);
  }
  if (row.endsWith("|") && !row.endsWith("\\|")) {
    row = row.slice(0, -1);
  }
  return row.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function isTableStart(line: string, next: string | undefined): boolean {
  if (!line.includes("|") || next === undefined || !next.includes("-")) {
    return false;
  }
  const delimiter = cells(next);
  return delimiter.every((cell) => DELIMITER_CELL.test(cell)) && delimiter.length === cells(line).length;
}

function startsBlock(line: string, next: string | undefined): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    marker(line) !== null ||
    isTableStart(line, next)
  );
}

function alignOf(cell: string): TableAlign {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  return left && right ? "center" : left ? "left" : right ? "right" : null;
}

function table(lines: readonly string[], at: number): { block: Block; next: number } {
  const head = cells(lines[at] ?? "");
  const align = cells(lines[at + 1] ?? "").map(alignOf);
  const rows: Inline[][][] = [];
  let index = at + 2;
  for (let line = lines[index]; line !== undefined && !isBlank(line) && line.includes("|"); line = lines[index]) {
    const row = cells(line);
    rows.push(head.map((_, column) => parseInline(row[column] ?? "")));
    index += 1;
  }
  return { block: { type: "table", align, head: head.map((cell) => parseInline(cell)), rows }, next: index };
}

function nextFilled(lines: readonly string[], from: number): number {
  let index = from;
  while (index < lines.length && isBlank(lines[index])) {
    index += 1;
  }
  return index;
}

function list(lines: readonly string[], at: number, first: Marker): { block: Block; next: number } {
  const items: Block[][] = [];
  let index = at;
  const sibling = (line: string | undefined) => {
    const found = line === undefined ? null : marker(line);
    return found && found.ordered === first.ordered && found.indent < first.contentIndent ? found : null;
  };
  for (let item = sibling(lines[index]); item; item = sibling(lines[index])) {
    const body = [item.content];
    index += 1;
    while (index < lines.length) {
      const line = lines[index] ?? "";
      if (isBlank(line)) {
        const filled = nextFilled(lines, index);
        if (filled < lines.length && indentOf(lines[filled] ?? "") >= item.contentIndent) {
          body.push("");
          index += 1;
          continue;
        }
        break;
      }
      if (indentOf(line) >= item.contentIndent) {
        body.push(line.slice(item.contentIndent));
      } else if (!startsBlock(line, lines[index + 1]) && !isBlank(body.at(-1))) {
        // A lazy continuation of the item's paragraph.
        body.push(line.trim());
      } else {
        break;
      }
      index += 1;
    }
    items.push(parseBlocks(body));
    const filled = nextFilled(lines, index);
    if (!sibling(lines[filled])) {
      break;
    }
    index = filled;
  }
  return { block: { type: "list", ordered: first.ordered, start: first.start, items }, next: index };
}

function parseBlocks(lines: readonly string[]): Block[] {
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (isBlank(line)) {
      index += 1;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const [, indent = "", ticks = "", lang = ""] = fence;
      const closing = new RegExp(`^ {0,3}${ticks.charAt(0) === "`" ? "`" : "~"}{${ticks.length},}\\s*$`);
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !closing.test(lines[index] ?? "")) {
        const code = lines[index] ?? "";
        body.push(code.slice(Math.min(indent.length, indentOf(code))));
        index += 1;
      }
      blocks.push({ type: "code", lang, text: body.join("\n") });
      index += 1;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      const text = (heading[2] ?? "").replace(/\s+#+\s*$/, "").replace(/^#+$/, "");
      blocks.push({ type: "heading", level: heading[1]?.length ?? 1, children: parseInline(text) });
      index += 1;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (index < lines.length && QUOTE.test(lines[index] ?? "")) {
        body.push((lines[index] ?? "").replace(QUOTE, ""));
        index += 1;
      }
      blocks.push({ type: "quote", children: parseBlocks(body) });
      continue;
    }
    if (isTableStart(line, lines[index + 1])) {
      const found = table(lines, index);
      blocks.push(found.block);
      index = found.next;
      continue;
    }
    const item = marker(line);
    if (item) {
      const found = list(lines, index, item);
      blocks.push(found.block);
      index = found.next;
      continue;
    }
    const body = [line.trimStart()];
    index += 1;
    while (index < lines.length && !isBlank(lines[index]) && !startsBlock(lines[index] ?? "", lines[index + 1])) {
      body.push((lines[index] ?? "").trimStart());
      index += 1;
    }
    blocks.push({ type: "paragraph", children: parseInline(body.join("\n").trimEnd()) });
  }
  return blocks;
}

export function parseMarkdown(source: string): Block[] {
  return parseBlocks(source.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n"));
}
