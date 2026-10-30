import { existsSync, readFileSync } from "node:fs";
import { GENERATED, generate } from "./generate.mjs";

const fresh = await generate();
const current = existsSync(GENERATED) ? readFileSync(GENERATED, "utf8").replace(/\r\n/g, "\n") : "";
if (fresh !== current) {
  console.error("contracts are stale: run pnpm gen:contracts");
  process.exit(1);
}
