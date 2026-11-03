import { PLACED_PIECE, type PlayDrop, type PlayPiece } from "../../ports/play-port.ts";

// Ranges of the Add object options; the engine checks the same bounds.
export const DROP_LIMITS = {
  scale: [0.25, 4],
  height: [0.5, 10],
  speed: [1, 30],
  friction: [0, 2],
  bounciness: [0, 1],
  count: [1, 30],
  interval: [0.1, 5],
  spread: [0, 5],
  mass: [0.01, 10_000],
  density: [10, 20_000],
} as const satisfies Record<string, readonly [number, number]>;

export type DropRange = keyof typeof DROP_LIMITS;

export function freshDrop(piece: string = PLACED_PIECE.id): PlayDrop {
  return {
    piece,
    placement: "drop",
    scale: 1,
    weight: null,
    friction: null,
    bounciness: null,
    color: null,
    height: 2,
    speed: 6,
    count: 1,
    interval: 0.5,
    spread: 1,
  };
}

export function pieceOf(drop: PlayDrop, pieces: readonly PlayPiece[]): PlayPiece | undefined {
  return pieces.find((piece) => piece.id === drop.piece);
}

// A piece fixed in place can only be placed and has no mass to set.
export function isMovable(piece: PlayPiece | undefined): boolean {
  return piece?.mass !== null;
}

// Another piece starts from its own weight, grip, bounce and color, keeping how and how many.
export function choosePiece(drop: PlayDrop, piece: PlayPiece): PlayDrop {
  return {
    ...drop,
    piece: piece.id,
    weight: null,
    friction: null,
    bounciness: null,
    color: null,
    placement: isMovable(piece) ? drop.placement : "place",
  };
}

export function clampTo(range: DropRange, value: number): number {
  const [low, high] = DROP_LIMITS[range];
  return Math.min(high, Math.max(low, value));
}

export function ratioOf(range: DropRange, value: number): number {
  const [low, high] = DROP_LIMITS[range];
  return (clampTo(range, value) - low) / (high - low);
}

// A slider position as a value, rounded to what the label shows.
export function valueAt(range: DropRange, ratio: number, digits = 2): number {
  const [low, high] = DROP_LIMITS[range];
  const factor = 10 ** digits;
  return clampTo(range, Math.round((low + ratio * (high - low)) * factor) / factor);
}

// A typed weight, or null when the field is empty or not a number in range: the piece keeps its own.
export function typedWeight(kind: "mass" | "density", text: string): PlayDrop["weight"] {
  const value = Number.parseFloat(text);
  if (text.trim() === "" || !Number.isFinite(value)) {
    return null;
  }
  const [low, high] = DROP_LIMITS[kind];
  return value < low || value > high ? null : { kind, value };
}

export function placingHint(drop: PlayDrop, label: string): string {
  const what = drop.count > 1 ? `${drop.count} × ${label}` : label;
  switch (drop.placement) {
    case "place":
      return `Click to place: ${what}`;
    case "drop":
      return `Click where to drop: ${what}`;
    case "throw":
      return `Click where to throw from: ${what}`;
  }
}
