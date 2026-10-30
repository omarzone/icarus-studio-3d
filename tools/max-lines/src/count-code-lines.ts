export type Language = "ts" | "py";

export function countCodeLines(source: string, language: Language): number {
  return language === "ts" ? countTypeScript(source) : countPython(source);
}

function countTypeScript(source: string): number {
  let count = 0;
  let inBlock = false;
  for (const raw of source.split(/\r?\n/)) {
    let line = raw.trim();
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end === -1) {
        continue;
      }
      inBlock = false;
      line = line.slice(end + 2).trim();
    }
    if (line.startsWith("/*")) {
      const end = line.indexOf("*/", 2);
      if (end === -1) {
        inBlock = true;
        continue;
      }
      line = line.slice(end + 2).trim();
    }
    if (line === "" || line.startsWith("//")) {
      continue;
    }
    count++;
  }
  return count;
}

function countPython(source: string): number {
  let count = 0;
  let docstring: string | null = null;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (docstring) {
      if (line.includes(docstring)) {
        docstring = null;
      }
      continue;
    }
    const quote = line.startsWith('"""') ? '"""' : line.startsWith("'''") ? "'''" : null;
    if (quote) {
      if (!line.slice(3).includes(quote)) {
        docstring = quote;
      }
      continue;
    }
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    count++;
  }
  return count;
}
