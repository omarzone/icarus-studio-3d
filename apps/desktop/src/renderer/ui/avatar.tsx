import { tokens } from "@icarus/ui-tokens";

// Index into the seven avatar colors of the design tokens; the engine picks it from a stable hash of the user id.
export type AvatarTone = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type Props = {
  initials: string;
  tone: AvatarTone;
  // Tailwind size and text classes, for example "size-6.5 text-[9px]".
  className?: string;
  // A photo as a data URL; without one the initials show.
  photo?: string | null;
};

export function Avatar({ initials, tone, className = "size-6.5 text-micro", photo = null }: Props) {
  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        aria-hidden
        draggable={false}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ background: tokens.color.avatar[tone], color: tokens.color.avatarInk }}
      className={`grid shrink-0 place-items-center rounded-full font-bold ${className}`}
    >
      {initials}
    </span>
  );
}
