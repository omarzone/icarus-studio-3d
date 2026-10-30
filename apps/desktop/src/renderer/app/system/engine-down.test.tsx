import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { EngineDown } from "./engine-down.tsx";

it("shows why the engine is down above its last output", () => {
  const html = renderToStaticMarkup(
    <EngineDown
      reason="uv was not found on PATH"
      lastLog={["spawn uv ENOENT"]}
      onRestart={() => {}}
      onCopy={() => {}}
    />,
  );
  expect(html).toContain("uv was not found on PATH\nspawn uv ENOENT");
});
