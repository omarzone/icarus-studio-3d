// Scene colors come from the design tokens, read once from the document so the 3D view matches the theme.
export type SceneColors = { background: string; grid: string; gridStrong: string; selected: string };

function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function sceneColors(): SceneColors {
  return {
    background: token("--ic-bg-panel", "black"),
    grid: token("--ic-line-subtle", "gray"),
    gridStrong: token("--ic-line", "gray"),
    selected: token("--ic-selected", "white"),
  };
}
