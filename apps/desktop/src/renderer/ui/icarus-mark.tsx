type Props = { className?: string };

// The Icarus mark; the same drawing as the app icon in resources/.
export function IcarusMark({ className }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M7.4 11.2 12 5.2l4.6 6" />
      <path d="M2.2 11.6C7 10.5 17 10.5 21.8 11.6 17 12.9 7 12.9 2.2 11.6Z" fill="currentColor" stroke="none" />
      <path d="M12 12v7.6" />
    </svg>
  );
}
