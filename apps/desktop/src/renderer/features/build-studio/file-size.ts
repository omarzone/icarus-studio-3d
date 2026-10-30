// Decimal file sizes with one decimal under 10 ("1.2 MB", "640 KB").
export function fileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : value.toFixed(0)} ${units[unit]}`;
}
