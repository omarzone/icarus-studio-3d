import { describe, expect, it, vi } from "vitest";
import { createThumbnailCache, projectThumbnailKey, templateThumbnailKey } from "./thumbnail-cache.ts";

describe("thumbnail keys", () => {
  it("never mixes a template with a project of the same id", () => {
    expect(templateThumbnailKey("walker")).not.toBe(projectThumbnailKey("walker", "rev 1"));
  });

  it("changes with the project revision, so an edit draws a new picture", () => {
    expect(projectThumbnailKey("p1", "rev 1")).not.toBe(projectThumbnailKey("p1", "rev 2"));
    expect(projectThumbnailKey("p1", "rev 2")).toBe(projectThumbnailKey("p1", "rev 2"));
  });
});

describe("thumbnail cache", () => {
  it("draws each key once and hands every caller the same picture", async () => {
    const cache = createThumbnailCache(4);
    const draw = vi.fn(async () => "data:image/png;base64,AAA");
    const [first, second] = await Promise.all([cache.get("a", draw), cache.get("a", draw)]);
    expect(first).toBe("data:image/png;base64,AAA");
    expect(second).toBe(first);
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it("forgets a failed drawing so the next look tries again", async () => {
    const cache = createThumbnailCache(4);
    await expect(cache.get("a", async () => Promise.reject(new Error("engine down")))).rejects.toThrow("engine down");
    await expect(cache.get("a", async () => "data:ok")).resolves.toBe("data:ok");
  });

  it("drops the least recently used picture past its capacity", async () => {
    const cache = createThumbnailCache(2);
    const draw = vi.fn(async () => "data:x");
    await cache.get("a", draw);
    await cache.get("b", draw);
    await cache.get("a", draw);
    await cache.get("c", draw);
    expect(draw).toHaveBeenCalledTimes(3);
    await cache.get("a", draw);
    expect(draw).toHaveBeenCalledTimes(3);
    await cache.get("b", draw);
    expect(draw).toHaveBeenCalledTimes(4);
  });
});
