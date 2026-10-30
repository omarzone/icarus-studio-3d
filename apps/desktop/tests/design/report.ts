import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";

export type ParityResult = { id: string; ratio: number; maxDiff: number; reference: PNG; actual: PNG; diff: PNG };

export function writeReport(results: ParityResult[], dir: string): void {
  mkdirSync(dir, { recursive: true });
  const rows = results.map((r) => {
    for (const [kind, png] of [
      ["reference", r.reference],
      ["actual", r.actual],
      ["diff", r.diff],
    ] as const) {
      writeFileSync(join(dir, `${r.id}.${kind}.png`), PNG.sync.write(png));
    }
    const status = r.ratio <= r.maxDiff ? "pass" : "fail";
    return `<tr class="${status}"><td>${r.id}<br>${(r.ratio * 100).toFixed(2)}% (max ${(r.maxDiff * 100).toFixed(1)}%) · ${status}</td>${["reference", "actual", "diff"].map((k) => `<td><img src="${r.id}.${k}.png" alt="${r.id} ${k}"></td>`).join("")}</tr>`;
  });
  writeFileSync(
    join(dir, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>Design parity</title><style>body{background:#121212;color:#f5f5f5;font:13px sans-serif}td{vertical-align:top;padding:6px}img{width:420px}.fail td:first-child{color:#ff8a88}</style><table><tr><th>ID</th><th>Design</th><th>Code</th><th>Difference</th></tr>${rows.join("")}</table>`,
  );
}
