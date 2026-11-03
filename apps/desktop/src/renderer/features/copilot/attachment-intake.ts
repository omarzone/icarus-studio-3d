// What a paste or a drop onto the chat carries: files to attach to the message being written, or text to leave to
// the field. Files then go through the same checks as the attach button (attachment-rules.ts).

type Transfer = { files: Iterable<File>; items: Iterable<Pick<DataTransferItem, "kind" | "getAsFile">> };

export type PasteIntent = "files" | "text";

// Office apps and some browsers put a picture of copied text next to the text itself; the text is what was meant.
export function pasteIntent(fileTypes: readonly string[], text: string): PasteIntent {
  if (fileTypes.length === 0) {
    return "text";
  }
  if (text.trim() !== "" && fileTypes.every((type) => type.startsWith("image/"))) {
    return "text";
  }
  return "files";
}

// The files of a transfer; some sources list a pasted picture only as an item, not in `files`.
export function transferFiles(data: Transfer): File[] {
  const files = [...data.files];
  if (files.length > 0) {
    return files;
  }
  return [...data.items].flatMap((item) => {
    const file = item.kind === "file" ? item.getAsFile() : null;
    return file ? [file] : [];
  });
}

const GENERIC = /^(image|blob)?\.?(png|jpe?g|gif|webp)?$/i;
const EXTENSION: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

const two = (value: number) => String(value).padStart(2, "0");

// Clipboard pictures arrive as "image.png"; they get a name the chat can tell apart, or null to keep theirs.
export function pastedName(name: string, type: string, index: number, now: Date): string | null {
  const extension = EXTENSION[type];
  if (!extension || !GENERIC.test(name)) {
    return null;
  }
  const time = `${two(now.getHours())}-${two(now.getMinutes())}-${two(now.getSeconds())}`;
  return `Pasted image ${time}${index > 0 ? ` (${index + 1})` : ""}.${extension}`;
}

// The files a paste attaches, renamed when the clipboard gave them a generic name; null when it pastes text.
export function pastedFiles(data: Transfer & { getData: (format: string) => string }, now = new Date()): File[] | null {
  const files = transferFiles(data);
  if (
    pasteIntent(
      files.map((file) => file.type),
      data.getData("text/plain"),
    ) === "text"
  ) {
    return null;
  }
  return files.map((file, index) => {
    const name = pastedName(file.name, file.type, index, now);
    return name ? new File([file], name, { type: file.type, lastModified: file.lastModified }) : file;
  });
}

// Whether a drag carries files (not text or a link being dragged), so the chat shows itself as a drop target.
export const carriesFiles = (types: readonly string[]) => types.includes("Files");
