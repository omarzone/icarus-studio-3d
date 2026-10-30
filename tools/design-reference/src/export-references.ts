import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { dirname, extname, join, normalize } from "node:path";
import { chromium } from "playwright";
import { type Box, moduleRegions, type Panel } from "./regions.ts";

const repo = join(import.meta.dirname, "..", "..", "..");
const canvas = process.env.ICARUS_DESIGN_CANVAS ?? join(repo, "design", "canvas");
const out = join(repo, "docs", "design", "reference");
const require = createRequire(import.meta.url);
const FONTS: Record<string, string> = {
  inter: dirname(require.resolve("@fontsource-variable/inter/package.json")),
  mono: dirname(require.resolve("@fontsource/jetbrains-mono/package.json")),
};
const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

// Same fonts as the app, so references and implementation differ only where the design does.
const FONT_CSS = `#root, #root *:not([style*="JetBrains"]) { font-family: 'Inter Variable', sans-serif !important; }
#root [style*="JetBrains"] { font-family: 'JetBrains Mono', monospace !important; }`;

export type Anchor = { label: string; goesTo: string | null; kind: "chip" | "tab" | "tool" | "link" };

function artboardIds(): Map<string, string> {
  const doc = readFileSync(join(repo, "docs", "design", "screens.md"), "utf8");
  const ids = new Map<string, string>();
  const seen = new Set<string>();
  for (const [, id, artboard] of doc.matchAll(/^\| `([A-Z]+-[A-Z0-9-]+)` \| [^|]+ \| [^|]+ \| `([A-Za-z]+)` \|$/gm)) {
    if (!id || !artboard) {
      continue;
    }
    ids.set(artboard, seen.has(id) ? `${id}.b` : id);
    seen.add(id);
  }
  return ids;
}

function serve(): Promise<{ url: string; close: () => void }> {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    const [, root, ...rest] = path.split("/");
    const base = root === "fonts" && rest[0] ? FONTS[rest[0]] : undefined;
    const file = base ? join(base, ...rest.slice(1)) : join(canvas, normalize(path));
    if (!existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() }),
    ),
  );
}

// One line per catalog ID keeps the generated files small in diffs.
function compact(byId: Record<string, unknown>): string {
  const lines = Object.entries(byId).map(([id, value]) => `  ${JSON.stringify(id)}: ${JSON.stringify(value)}`);
  return `{\n${lines.join(",\n")}\n}\n`;
}

async function main(): Promise<void> {
  if (!existsSync(join(canvas, "preview.html"))) {
    throw new Error(`No canvas export at ${canvas}. Export the Workspaces canvas there or set ICARUS_DESIGN_CANVAS.`);
  }
  const ids = artboardIds();
  mkdirSync(out, { recursive: true });
  const { url, close } = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  const regions: Record<string, { modules: Record<string, Box>; masks: Box[] }> = {};
  const inventory: Record<string, { artboard: string; anchors: Anchor[] }> = {};
  for (const [artboard, id] of ids) {
    await page.goto(`${url}/preview.html?f=${artboard}.dc.html`);
    await page.addStyleTag({ url: `${url}/fonts/inter/index.css` });
    await page.addStyleTag({ url: `${url}/fonts/mono/index.css` });
    await page.addStyleTag({ content: FONT_CSS });
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("#root img")].every(
          (img) => (img as HTMLImageElement).src.startsWith("data:") && (img as HTMLImageElement).complete,
        ),
      undefined,
      { timeout: 60_000 },
    );
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(out, `${id}.png`), clip: { x: 0, y: 0, width: 1440, height: 900 } });
    const scan = await page.evaluate(() => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      const panels = [...document.querySelectorAll<HTMLElement>("#root div")]
        .filter((el) => el.style.height === "38px" && el.style.flex.startsWith("0 0") && el.parentElement)
        .map((strip) => ({
          tabs: [...strip.children]
            .filter((c) => !(c as HTMLElement).style.marginLeft && (c.textContent ?? "").trim())
            .map((c) => (c.textContent ?? "").trim()),
          box: box(strip.parentElement as Element),
        }));
      const masks = [...document.querySelectorAll("#root img")].map(box).filter((b) => b.w > 0 && b.h > 0);
      const anchors = [...document.querySelectorAll<HTMLAnchorElement>("#root a[href]")].map((a) => {
        const style = a.getAttribute("style") ?? "";
        const kind =
          style.includes("height: 28px") && style.includes("999px")
            ? "chip"
            : style.includes("padding: 5px 10px")
              ? "tab"
              : style.includes("min-width: 54px")
                ? "tool"
                : "link";
        return {
          label: (a.innerText || a.getAttribute("aria-label") || "").trim(),
          href: a.getAttribute("href") ?? "",
          kind,
        };
      });
      return { panels, masks, anchors };
    });
    regions[id] = { modules: moduleRegions(scan.panels as Panel[]), masks: scan.masks };
    inventory[id] = {
      artboard,
      anchors: scan.anchors.map(({ label, href, kind }) => {
        const target = href.replace(/\.dc\.html$/, "");
        return {
          label,
          goesTo: target === artboard ? null : (ids.get(target) ?? target),
          kind: kind as Anchor["kind"],
        };
      }),
    };
    console.log(`${id} ${Object.keys(regions[id].modules).length} modules, ${inventory[id].anchors.length} controls`);
  }
  writeFileSync(join(out, "regions.json"), compact(regions));
  writeFileSync(join(repo, "docs", "design", "inventory.json"), compact(inventory));
  await browser.close();
  close();
}

await main();
