// A video frame or physics view: a plain surface until the video and scene renderers draw into it.
export function MotionView({ label, caption }: { label: string; caption: string }) {
  return (
    <div role="img" aria-label={label} className="relative min-w-0 flex-1 overflow-hidden rounded-[14px] bg-app">
      <span className="absolute top-3 left-3 rounded-button bg-overlay px-2.5 py-1.5 text-ui">{caption}</span>
    </div>
  );
}
