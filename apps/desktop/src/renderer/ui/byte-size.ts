const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

// Decimal units, one decimal from GB up ("1.8 GB", "640 MB").
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  const digits = unit >= 3 && value < 100 ? 1 : 0;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}
