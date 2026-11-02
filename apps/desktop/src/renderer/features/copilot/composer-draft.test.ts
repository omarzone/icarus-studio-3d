import { describe, expect, it } from "vitest";
import { draftAfterSend, draftToSend } from "./composer-draft.ts";

describe("the composer draft", () => {
  it("sends the trimmed text, nothing when empty and nothing while a message is on its way", () => {
    expect(draftToSend("  make it faster ", false)).toBe("make it faster");
    expect(draftToSend("   ", false)).toBeNull();
    expect(draftToSend("make it faster", true)).toBeNull();
  });

  it("sends files without words under their names, so the copilot knows what it got", () => {
    expect(draftToSend("  ", false, ["lot.png", "run.mp4"])).toBe("lot.png, run.mp4");
    expect(draftToSend("like this", false, ["lot.png"])).toBe("like this");
    expect(draftToSend("", true, ["lot.png"])).toBeNull();
  });

  it("gives the text back when the send fails, without overwriting a new draft", () => {
    expect(draftAfterSend("", "make it faster", false)).toBe("make it faster");
    expect(draftAfterSend("and taller", "make it faster", false)).toBe("and taller");
    expect(draftAfterSend("", "make it faster", true)).toBe("");
  });
});
