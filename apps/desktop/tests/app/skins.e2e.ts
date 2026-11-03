import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { PNG } from "pngjs";
import { launchApp } from "../design/launch.ts";

// A red four-sided pyramid as a GLB built here (no file is read or downloaded): 2 wide, 1 tall, 2 deep in glTF axes.
function pyramidGlb(): Buffer {
  const positions = new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4, 0, 2, 1, 0, 3, 2]);
  const binary = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(indices.buffer)]);
  const json = JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.85, 0.1, 0.1, 1], metallicFactor: 0 } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 5, type: "VEC3", min: [-1, 0, -1], max: [1, 1, 1] },
      { bufferView: 1, componentType: 5123, count: 18, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength },
    ],
    buffers: [{ byteLength: binary.length }],
  });
  const text = Buffer.from(json.padEnd(Math.ceil(json.length / 4) * 4, " "));
  const padded = Buffer.concat([binary, Buffer.alloc(-binary.length & 3)]);
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "ascii");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + text.length + 8 + padded.length, 8);
  const chunk = (data: Buffer, kind: number) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.writeUInt32LE(kind, 4);
    return Buffer.concat([head, data]);
  };
  return Buffer.concat([header, chunk(text, 0x4e4f534a), chunk(padded, 0x004e4942)]);
}

// Pixels of the viewport painted the model's strong red; the car's red is too orange to count.
async function redPixels(page: Page): Promise<number> {
  const viewport = page.locator("canvas").first();
  const image = PNG.sync.read(await viewport.screenshot());
  let count = 0;
  for (let index = 0; index < image.data.length; index += 4) {
    const [r = 0, g = 0, b = 0] = image.data.subarray(index, index + 3);
    if (r > 120 && g < 50 && b < 50) {
      count += 1;
    }
  }
  return count;
}

test("an imported model is drawn over its collider in the world viewport", async () => {
  const projects = mkdtempSync(join(tmpdir(), "icarus-projects-"));
  const { app, page } = await launchApp({ ICARUS_PROJECTS_DIR: projects });
  try {
    await page.waitForSelector('[data-route-screen="SCR-HOME"]', { timeout: 120_000 });
    await page.locator('[data-cta^="parking-car"]').first().click();
    await page.locator('[data-cta="car"]').first().waitFor({ timeout: 60_000 });
    const before = await redPixels(page);
    const imported = await page.evaluate(async (data) => {
      const status = await window.icarus.engine.status();
      if (status.kind !== "ready") {
        throw new Error("engine not ready");
      }
      const list: { id: string }[] = await (await fetch(`${status.url}/projects`)).json();
      const id = list[0]?.id ?? "";
      const body = { name: "red_pyramid.glb", data, length: 4, mode: "static", position: [0, 6, 0] };
      const response = await fetch(`${status.url}/projects/${id}/skins`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    }, pyramidGlb().toString("base64"));
    expect(imported.status).toBe(201);
    // The revision event refreshes the explorer and the scene; the model then loads and replaces the fallback box.
    await page.locator('[role="tree"] [data-cta="red-pyramid"]').waitFor({ timeout: 60_000 });
    await expect.poll(() => redPixels(page), { timeout: 30_000 }).toBeGreaterThan(before + 200);
    await page.screenshot({ path: test.info().outputPath("skinned-object.png") });
  } finally {
    await app.close();
    rmSync(projects, { recursive: true, force: true });
  }
});
