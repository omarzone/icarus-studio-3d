// Counts as people read them on cards: 960, 2.3k, 1.2M.
export function compactNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${trim(value / 1_000_000)}M`;
  }
  if (value >= 1000) {
    return `${trim(value / 1000)}k`;
  }
  return String(value);
}

function trim(value: number): string {
  return value >= 100 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "");
}
