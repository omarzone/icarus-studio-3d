export function WindowDots() {
  return (
    <div className="flex gap-2" aria-hidden>
      <span className="size-3 rounded-full bg-[var(--ic-window-close)]" />
      <span className="size-3 rounded-full bg-[var(--ic-window-minimize)]" />
      <span className="size-3 rounded-full bg-[var(--ic-window-zoom)]" />
    </div>
  );
}
