// What the chat accepts as attachments, checked before anything is read or uploaded.

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;

export type FileKind = "image" | "video" | "document";

export type FileFacts = { name: string; type: string; size: number };

export type AttachmentCheck =
  | { ok: true; kind: FileKind; mediaType: string; readsText: boolean }
  | { ok: false; reason: string };

const IMAGES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const VIDEOS = ["video/mp4", "video/webm", "video/quicktime"];
const TEXT_DOCUMENTS = ["text/plain", "text/markdown", "text/csv", "application/json"];
const PDF = "application/pdf";

const BY_EXTENSION: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  pdf: PDF,
};

// The file picker's filter; drops and pastes go through the same check.
export const ACCEPTED_FILES = [...IMAGES, ...VIDEOS, ".txt", ".md", ".csv", ".json", ".pdf"].join(",");

function mediaTypeOf({ name, type }: FileFacts): string {
  const extension = name.split(".").at(-1)?.toLowerCase() ?? "";
  const known = [...IMAGES, ...VIDEOS, ...TEXT_DOCUMENTS, PDF];
  // Systems report Markdown and CSV inconsistently, so the extension decides when the type is unknown.
  return known.includes(type) ? type : (BY_EXTENSION[extension] ?? type);
}

export function checkAttachment(file: FileFacts, alreadyAttached: number): AttachmentCheck {
  if (alreadyAttached >= MAX_ATTACHMENTS) {
    return { ok: false, reason: `A message can carry at most ${MAX_ATTACHMENTS} files` };
  }
  const mediaType = mediaTypeOf(file);
  const kind: FileKind | null = IMAGES.includes(mediaType)
    ? "image"
    : VIDEOS.includes(mediaType)
      ? "video"
      : TEXT_DOCUMENTS.includes(mediaType) || mediaType === PDF
        ? "document"
        : null;
  if (kind === null) {
    return { ok: false, reason: `${file.name} is not an image, video or text document` };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      reason: `${file.name} is ${formatBytes(file.size)}, more than the ${formatBytes(MAX_ATTACHMENT_BYTES)} limit`,
    };
  }
  return { ok: true, kind, mediaType, readsText: TEXT_DOCUMENTS.includes(mediaType) };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`;
}

export function base64OfDataUrl(url: string): string {
  const comma = url.indexOf(",");
  return url.startsWith("data:") && comma >= 0 ? url.slice(comma + 1) : url;
}
