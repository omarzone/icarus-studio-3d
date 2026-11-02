// Pixels a press may travel and still count as a click; farther, it was a camera drag.
const CLICK_SLOP = 4;

export function isDeliberateClick(travel: number): boolean {
  return travel <= CLICK_SLOP;
}
