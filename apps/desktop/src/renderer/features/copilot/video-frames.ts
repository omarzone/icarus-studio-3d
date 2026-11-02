// Pure timing and sizing for the still frames the app takes from a video so the copilot can watch it.

export const VIDEO_FRAMES = 8;
// Frames closer together than this show nearly the same picture.
const FRAMES_PER_SECOND = 4;

export function frameTimes(duration: number, count = VIDEO_FRAMES): number[] {
  if (!Number.isFinite(duration) || duration <= 0) {
    return [0];
  }
  const frames = Math.max(1, Math.min(count, Math.floor(duration * FRAMES_PER_SECOND)));
  const stretch = duration / frames;
  return Array.from({ length: frames }, (_, index) => (index + 0.5) * stretch);
}

export function fitWithin(width: number, height: number, longest: number): { width: number; height: number } {
  const scale = Math.min(1, longest / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "";
  }
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}
