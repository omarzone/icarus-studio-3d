import { describe, expect, it } from "vitest";
import { carriesFiles, pastedFiles, pastedName, pasteIntent, transferFiles } from "./attachment-intake.ts";

const AT = new Date(2026, 10, 2, 9, 5, 7);

function transfer(files: File[], text = "", itemsOnly = false) {
  return {
    files: itemsOnly ? [] : files,
    items: files.map((file) => ({ kind: "file", getAsFile: () => file })),
    getData: (type: string) => (type === "text/plain" ? text : ""),
  };
}

const picture = (name = "image.png", type = "image/png") => new File([new Uint8Array([1, 2, 3])], name, { type });

describe("what a paste attaches", () => {
  it("attaches a screenshot from the clipboard under a name the chat can tell apart", () => {
    const files = pastedFiles(transfer([picture()]), AT);
    expect(files?.map((file) => [file.name, file.type, file.size])).toEqual([
      ["Pasted image 09-05-07.png", "image/png", 3],
    ]);
  });

  it("numbers several clipboard pictures pasted at once and keeps real file names", () => {
    const files = pastedFiles(transfer([picture(), picture(""), picture("plan.pdf", "application/pdf")]), AT);
    expect(files?.map((file) => file.name)).toEqual([
      "Pasted image 09-05-07.png",
      "Pasted image 09-05-07 (2).png",
      "plan.pdf",
    ]);
  });

  it("leaves plain text to the field, also when an app adds a picture of the copied text", () => {
    expect(pastedFiles(transfer([], "make it night"), AT)).toBeNull();
    expect(pastedFiles(transfer([picture()], "Quarter | Sales"), AT)).toBeNull();
  });

  it("attaches copied files even when the clipboard also has their names as text", () => {
    const files = pastedFiles(transfer([picture("notes.md", "text/markdown")], "notes.md"), AT);
    expect(files?.map((file) => file.name)).toEqual(["notes.md"]);
  });

  it("finds a picture listed only as a clipboard item", () => {
    expect(transferFiles(transfer([picture("car.webp", "image/webp")], "", true)).map((file) => file.name)).toEqual([
      "car.webp",
    ]);
  });
});

describe("paste rules", () => {
  it("decides between files and text", () => {
    expect(pasteIntent([], "hello")).toBe("text");
    expect(pasteIntent(["image/png"], "")).toBe("files");
    expect(pasteIntent(["image/png"], "  ")).toBe("files");
    expect(pasteIntent(["video/mp4"], "clip.mp4")).toBe("files");
  });

  it("renames only generic clipboard picture names", () => {
    expect(pastedName("image.png", "image/png", 0, AT)).toBe("Pasted image 09-05-07.png");
    expect(pastedName("image.jpeg", "image/jpeg", 2, AT)).toBe("Pasted image 09-05-07 (3).jpg");
    expect(pastedName("garage.png", "image/png", 0, AT)).toBeNull();
    expect(pastedName("image.png", "text/plain", 0, AT)).toBeNull();
  });

  it("shows the drop target only for drags that carry files", () => {
    expect(carriesFiles(["Files"])).toBe(true);
    expect(carriesFiles(["text/plain", "text/uri-list"])).toBe(false);
  });
});
