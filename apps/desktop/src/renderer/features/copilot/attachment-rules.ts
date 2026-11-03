// What the chat accepts as attachments, checked before anything is read or uploaded.

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;

export type FileKind = "image" | "video" | "document" | "model";

export type FileFacts = { name: string; type: string; size: number };

export type AttachmentCheck =
  | { ok: true; kind: FileKind; mediaType: string; readsText: boolean }
  | { ok: false; reason: string };

const IMAGES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const VIDEOS = ["video/mp4", "video/webm", "video/quicktime"];
const TEXT_DOCUMENTS = ["text/plain", "text/markdown", "text/csv", "application/json"];
const PDF = "application/pdf";
// 3D models the copilot can put on an object as its skin (ADR 008) or auto-rig into a body; OBJ and STL become GLB.
const MODELS = ["model/gltf-binary", "model/gltf+json", "model/obj", "model/stl"];
// Model formats that need a converter the studio does not ship yet.
const UNCONVERTED = ["fbx", "usd", "usdz", "usda", "blend"];

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
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  obj: "model/obj",
  stl: "model/stl",
};

// The file picker's filter; drops and pastes go through the same check.
export const ACCEPTED_FILES = [
  ...IMAGES,
  ...VIDEOS,
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".pdf",
  ".glb",
  ".gltf",
  ".obj",
  ".stl",
].join(",");

function mediaTypeOf({ name, type }: FileFacts): string {
  const extension = name.split(".").at(-1)?.toLowerCase() ?? "";
  const known = [...IMAGES, ...VIDEOS, ...TEXT_DOCUMENTS, PDF, ...MODELS];
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
        : MODELS.includes(mediaType)
          ? "model"
          : null;
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  if (kind === null && UNCONVERTED.includes(extension)) {
    return { ok: false, reason: `${file.name}: .${extension} models are not supported yet; export it as .glb` };
  }
  if (kind === null) {
    return { ok: false, reason: `${file.name} is not an image, video, text document or 3D model` };
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
