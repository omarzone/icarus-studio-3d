import type { SceneObject, SceneTree } from "../../ports/scene-port.ts";

// Where a dragged Explorer row may go: under another object of its own section, or to the top of that section
// (`target` null). Never into itself or something nested in it, nor where it already is.
export function canDrop(tree: SceneTree, dragged: string, section: string, target: string | null): boolean {
  const rows = tree.sections.find((item) => item.label === section)?.objects ?? [];
  const index = rows.findIndex((row) => row.id === dragged);
  const row = rows[index];
  if (!row || row.action) {
    return false;
  }
  if (target === null) {
    return row.depth > 0;
  }
  const end = subtreeEnd(rows, index);
  const at = rows.findIndex((item) => item.id === target);
  if (at < 0 || rows[at]?.action || (at >= index && at < end)) {
    return false;
  }
  return parentOf(rows, index) !== target;
}

// Index after the last row nested under the row at `index`.
function subtreeEnd(rows: readonly SceneObject[], index: number): number {
  const depth = rows[index]?.depth ?? 0;
  let end = index + 1;
  while (end < rows.length && (rows[end]?.depth ?? 0) > depth) {
    end++;
  }
  return end;
}

// The id of the nearest row above at one level less, which the tree draws it under.
function parentOf(rows: readonly SceneObject[], index: number): string | null {
  const depth = rows[index]?.depth ?? 0;
  for (let at = index - 1; at >= 0 && depth > 0; at--) {
    const row = rows[at];
    if (row && row.depth === depth - 1) {
      return row.id;
    }
  }
  return null;
}
