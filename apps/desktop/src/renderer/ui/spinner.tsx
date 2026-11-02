type Props = { className?: string };

// A small rotating ring in the current text color; it pulses instead when the system asks for reduced motion.
export function Spinner({ className = "size-3.25" }: Props) {
  return (
    <span
      aria-hidden
      className={`${className} shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-pulse`}
    />
  );
}
