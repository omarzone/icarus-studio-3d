// Hue in degrees [0, 360), saturation and value in [0, 1].
export type Hsv = { h: number; s: number; v: number };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// Normalizes typed hex ("3a7bd5", "#abc") to "#RRGGBB", or null when it is not a color.
export function parseHex(text: string): string | null {
  const body = text.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(body)) {
    return `#${[...body].map((digit) => digit + digit).join("")}`.toUpperCase();
  }
  return /^[0-9a-f]{6}$/i.test(body) ? `#${body}`.toUpperCase() : null;
}

export function hexToHsv(hex: string): Hsv {
  const normal = parseHex(hex) ?? "#000000";
  const channel = (at: number) => Number.parseInt(normal.slice(at, at + 2), 16) / 255;
  const r = channel(1);
  const g = channel(3);
  const b = channel(5);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta > 0) {
    if (max === r) {
      h = 60 * (((g - b) / delta + 6) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / delta + 2);
    } else {
      h = 60 * ((r - g) / delta + 4);
    }
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp01(s);
  const val = clamp01(v);
  const channel = (n: number) => {
    const k = (n + hue / 60) % 6;
    const level = val - val * sat * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(level * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(5)}${channel(3)}${channel(1)}`.toUpperCase();
}
