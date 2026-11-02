// Inline markdown of copilot answers: emphasis, code, links and breaks. Raw HTML stays plain text.

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong" | "em" | "strike"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "break" };

const ESCAPABLE = /[\\`*_{}[\]()#+\-.!|~<>"']/;
const WEB_ADDRESS = /^https?:\/\/[^\s<>]+/;
const TRAILING_PUNCTUATION = /[.,;:!?'")\]]+$/;
const SAFE_LINK = /^(https?:\/\/|mailto:)/i;
const WORD = /[\p{L}\p{N}]/u;

type Span = { inner: string; end: number };

function isSpace(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}

function runLength(source: string, at: number, char: string): number {
  let end = at;
  while (source[end] === char) {
    end += 1;
  }
  return end - at;
}

// Where a code span starting at `at` ends, so emphasis never closes inside code.
function codeEnd(source: string, at: number): number | null {
  const run = runLength(source, at, "`");
  const close = source.indexOf("`".repeat(run), at + run);
  return close < 0 ? null : close + run;
}

function emphasis(source: string, at: number, marker: string): Span | null {
  const char = marker.charAt(0);
  const start = at + marker.length;
  if (isSpace(source[start])) {
    return null;
  }
  // Underscores inside words (snake_case) are never emphasis.
  if (char === "_" && WORD.test(source[at - 1] ?? "")) {
    return null;
  }
  let index = start + 1;
  while (index < source.length) {
    const current = source[index];
    if (current === "`") {
      index = codeEnd(source, index) ?? index + 1;
      continue;
    }
    if (current === "\\") {
      index += 2;
      continue;
    }
    if (current === char) {
      const run = runLength(source, index, char);
      const fits = marker.length === 1 ? run === 1 : run >= 2;
      const closesWord = !(char === "_" && WORD.test(source[index + marker.length] ?? ""));
      if (fits && !isSpace(source[index - 1]) && closesWord) {
        return { inner: source.slice(start, index), end: index + marker.length };
      }
      index += run;
      continue;
    }
    index += 1;
  }
  return null;
}

function strike(source: string, at: number): Span | null {
  const close = source.indexOf("~~", at + 2);
  if (close <= at + 2 || isSpace(source[at + 2]) || isSpace(source[close - 1])) {
    return null;
  }
  return { inner: source.slice(at + 2, close), end: close + 2 };
}

function link(source: string, at: number): { label: string; href: string; end: number } | null {
  let depth = 0;
  let close = -1;
  for (let index = at; index < source.length; index += 1) {
    if (source[index] === "[") {
      depth += 1;
    } else if (source[index] === "]") {
      depth -= 1;
      if (depth === 0) {
        close = index;
        break;
      }
    }
  }
  if (close < 0 || source[close + 1] !== "(") {
    return null;
  }
  const target = /^\(\s*<?([^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/.exec(source.slice(close + 1));
  if (!target?.[1]) {
    return null;
  }
  return { label: source.slice(at + 1, close), href: target[1], end: close + 1 + target[0].length };
}

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text !== "") {
      out.push({ type: "text", text });
      text = "";
    }
  };
  const push = (node: Inline) => {
    flush();
    out.push(node);
  };
  let index = 0;
  while (index < source.length) {
    const char = source.charAt(index);
    const next = source[index + 1];
    if (char === "\\" && next !== undefined && (next === "\n" || ESCAPABLE.test(next))) {
      if (next === "\n") {
        push({ type: "break" });
      } else {
        text += next;
      }
      index += 2;
      continue;
    }
    if (char === "\n") {
      if (/ {2,}$/.test(text)) {
        text = text.trimEnd();
        push({ type: "break" });
      } else {
        text = `${text.trimEnd()} `;
      }
      index += 1;
      while (source[index] === " ") {
        index += 1;
      }
      continue;
    }
    if (char === "`") {
      const end = codeEnd(source, index);
      const run = runLength(source, index, "`");
      if (end === null) {
        text += source.slice(index, index + run);
        index += run;
        continue;
      }
      const code = source.slice(index + run, end - run).replace(/\n/g, " ");
      push({ type: "code", text: /^ .* $/.test(code) && code.trim() !== "" ? code.slice(1, -1) : code });
      index = end;
      continue;
    }
    if (char === "~" && next === "~") {
      const span = strike(source, index);
      if (span) {
        push({ type: "strike", children: parseInline(span.inner) });
        index = span.end;
        continue;
      }
    }
    if (char === "*" || char === "_") {
      const marker = next === char ? `${char}${char}` : char;
      const span = emphasis(source, index, marker);
      if (span) {
        push({ type: marker.length === 2 ? "strong" : "em", children: parseInline(span.inner) });
        index = span.end;
        continue;
      }
      text += marker;
      index += marker.length;
      continue;
    }
    if (char === "[") {
      const found = link(source, index);
      if (found) {
        const children = parseInline(found.label);
        if (SAFE_LINK.test(found.href)) {
          push({ type: "link", href: found.href, children });
        } else {
          flush();
          out.push(...children);
        }
        index = found.end;
        continue;
      }
    }
    if (char === "<") {
      const auto = /^<(https?:\/\/[^\s<>]+)>/.exec(source.slice(index));
      if (auto?.[1]) {
        push({ type: "link", href: auto[1], children: [{ type: "text", text: auto[1] }] });
        index += auto[0].length;
        continue;
      }
    }
    if (char === "h" && !WORD.test(source[index - 1] ?? "")) {
      const address = WEB_ADDRESS.exec(source.slice(index))?.[0].replace(TRAILING_PUNCTUATION, "");
      if (address && address.length > "https://".length) {
        push({ type: "link", href: address, children: [{ type: "text", text: address }] });
        index += address.length;
        continue;
      }
    }
    text += char;
    index += 1;
  }
  flush();
  return out;
}
