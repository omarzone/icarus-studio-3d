import { describe, expect, it } from "vitest";
import { base64OfDataUrl, checkAttachment, formatBytes, MAX_ATTACHMENT_BYTES } from "./attachment-rules.ts";

describe("files added to the chat", () => {
  it("are images, videos or documents by their type, or by their extension when the system gives none", () => {
    expect(checkAttachment({ name: "lot.png", type: "image/png", size: 10 }, 0)).toEqual({
      ok: true,
      kind: "image",
      mediaType: "image/png",
      readsText: false,
    });
    expect(checkAttachment({ name: "run.webm", type: "video/webm", size: 10 }, 0)).toMatchObject({ kind: "video" });
    expect(checkAttachment({ name: "notes.md", type: "", size: 10 }, 0)).toEqual({
      ok: true,
      kind: "document",
      mediaType: "text/markdown",
      readsText: true,
    });
    expect(checkAttachment({ name: "DATA.CSV", type: "", size: 10 }, 0)).toMatchObject({ mediaType: "text/csv" });
  });

  it("send PDFs as documents whose text is not read", () => {
    expect(checkAttachment({ name: "spec.pdf", type: "application/pdf", size: 10 }, 0)).toEqual({
      ok: true,
      kind: "document",
      mediaType: "application/pdf",
      readsText: false,
    });
  });

  it("refuse other types, files over the limit and more than ten files, saying why", () => {
    const zip = checkAttachment({ name: "a.zip", type: "application/zip", size: 10 }, 0);
    expect(zip).toEqual({ ok: false, reason: "a.zip is not an image, video, text document or .glb model" });
    const svg = checkAttachment({ name: "logo.svg", type: "image/svg+xml", size: 10 }, 0);
    expect(svg.ok).toBe(false);
    const big = checkAttachment({ name: "clip.mp4", type: "video/mp4", size: MAX_ATTACHMENT_BYTES + 1 }, 0);
    expect(big).toEqual({ ok: false, reason: "clip.mp4 is 15 MB, more than the 15 MB limit" });
    expect(checkAttachment({ name: "a.png", type: "image/png", size: MAX_ATTACHMENT_BYTES }, 0).ok).toBe(true);
    expect(checkAttachment({ name: "a.png", type: "image/png", size: 10 }, 10)).toEqual({
      ok: false,
      reason: "A message can carry at most 10 files",
    });
  });

  it("take glTF and GLB models by extension and say FBX and USD are not supported yet", () => {
    expect(checkAttachment({ name: "van.glb", type: "", size: 10 }, 0)).toEqual({
      ok: true,
      kind: "model",
      mediaType: "model/gltf-binary",
      readsText: false,
    });
    expect(checkAttachment({ name: "van.gltf", type: "", size: 10 }, 0)).toMatchObject({ kind: "model" });
    expect(checkAttachment({ name: "van.FBX", type: "", size: 10 }, 0)).toEqual({
      ok: false,
      reason: "van.FBX: .fbx models are not supported yet; export it as .glb",
    });
  });

  it("show sizes the way people read them", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2_300)).toBe("2 KB");
    expect(formatBytes(3_565_158)).toBe("3.4 MB");
    expect(formatBytes(20 * 1024 * 1024)).toBe("20 MB");
  });

  it("upload the bare base64 of a data URL", () => {
    expect(base64OfDataUrl("data:image/jpeg;base64,AAEC")).toBe("AAEC");
    expect(base64OfDataUrl("AAEC")).toBe("AAEC");
  });
});
