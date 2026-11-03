import type { AttachmentInput } from "../../ports/copilot-port.ts";
import { type AttachmentCheck, base64OfDataUrl } from "./attachment-rules.ts";
import { fitWithin, frameTimes } from "./video-frames.ts";

// Reads a dropped, pasted or picked file into what the engine takes: the file, a video's still frames, a document's text.

export type ReadFile = Omit<AttachmentInput, "key"> & { duration?: number };

type Accepted = Extract<AttachmentCheck, { ok: true }>;

const FRAME_SIDE = 768;
const FRAME_QUALITY = 0.8;
const LOAD_TIMEOUT_MS = 15_000;
// The engine keeps up to this much of a document's text.
const MAX_TEXT = 200_000;

function dataUrlOf(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(reader.error));
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read"));
    reader.readAsDataURL(file);
  });
}

function once(video: HTMLVideoElement, event: "loadeddata" | "seeked"): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => fail(new Error("The video took too long to open")), LOAD_TIMEOUT_MS);
    const done = () => {
      window.clearTimeout(timer);
      video.removeEventListener(event, done);
      video.removeEventListener("error", onError);
    };
    const fail = (error: Error) => {
      done();
      reject(error);
    };
    const onError = () => fail(new Error("This video format cannot be opened here"));
    video.addEventListener(event, () => {
      done();
      resolve();
    });
    video.addEventListener("error", onError);
  });
}

export type VideoStills = { frames: string[]; duration: number; width: number; height: number };

// Stills at the given times (up to eight evenly spaced by default), kept as base64 JPEG.
export async function videoFrames(
  file: Blob,
  times: (duration: number) => number[] = frameTimes,
  side = FRAME_SIDE,
): Promise<VideoStills> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = url;
  try {
    await once(video, "loadeddata");
    const size = fitWithin(video.videoWidth || side, video.videoHeight || side, side);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("The video could not be drawn");
    }
    const frames: string[] = [];
    for (const time of times(video.duration)) {
      const seeked = once(video, "seeked");
      video.currentTime = time;
      await seeked;
      context.drawImage(video, 0, 0, size.width, size.height);
      frames.push(base64OfDataUrl(canvas.toDataURL("image/jpeg", FRAME_QUALITY)));
    }
    return { frames, duration: video.duration, width: size.width, height: size.height };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

export async function readFile(file: File, accepted: Accepted): Promise<ReadFile> {
  const data = base64OfDataUrl(await dataUrlOf(file));
  const base = { kind: accepted.kind, name: file.name, mediaType: accepted.mediaType, data };
  if (accepted.kind === "video") {
    const { frames, duration } = await videoFrames(file);
    return { ...base, frames, duration };
  }
  if (accepted.readsText) {
    return { ...base, text: (await file.text()).slice(0, MAX_TEXT) };
  }
  return base;
}
