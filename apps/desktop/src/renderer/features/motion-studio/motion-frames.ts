// When the app samples a reference video for pose tracking: an even rate over its first seconds.

export const MOTION_FPS = 8;
export const MOTION_SECONDS = 12;
export const MOTION_SIDE = 480;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export function motionFrameTimes(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) {
    return [];
  }
  const covered = Math.min(duration, MOTION_SECONDS);
  const count = Math.max(2, Math.floor(covered * MOTION_FPS));
  const step = covered / count;
  return Array.from({ length: count }, (_, index) => Math.min(duration, (index + 0.5) * step));
}

// Why a picked file cannot be a reference video, or null when it can.
export function videoProblem(file: { name: string; type: string; size: number }): string | null {
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  if (!VIDEO_TYPES.includes(file.type) && !["mp4", "webm", "mov"].includes(extension)) {
    return `${file.name} is not an .mp4, .webm or .mov video`;
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return `${file.name} is larger than ${MAX_VIDEO_BYTES / (1024 * 1024)} MB`;
  }
  return null;
}
