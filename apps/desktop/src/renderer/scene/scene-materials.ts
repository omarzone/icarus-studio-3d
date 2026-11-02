// Scene colors come from the design tokens, read once from the document so the 3D view matches the theme.
export type SceneColors = { background: string; grid: string; gridStrong: string; selected: string };

// Three.js reads #rrggbb only; tokens with an alpha channel (#rrggbbaa) keep their color and drop the alpha.
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return /^#[0-9a-f]{8}$/i.test(value) ? value.slice(0, 7) : value || fallback;
}

export function sceneColors(): SceneColors {
  return {
    background: token("--ic-bg-panel", "black"),
    grid: token("--ic-line-subtle", "gray"),
    gridStrong: token("--ic-line", "gray"),
    selected: token("--ic-selected", "white"),
  };
}
