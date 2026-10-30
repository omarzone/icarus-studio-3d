import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toCssVariables, toTailwindTheme } from "./build-css.ts";
import { tokens } from "./tokens.ts";

const dist = join(import.meta.dirname, "..", "dist");
mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, "tokens.css"), `${toCssVariables(tokens)}\n${toTailwindTheme(tokens)}`);
