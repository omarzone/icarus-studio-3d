import { expectTypeOf, it } from "vitest";
import type { ApiError, HealthStatus } from "./index.ts";

it("exposes the engine contracts as types", () => {
  expectTypeOf<HealthStatus>().toEqualTypeOf<{ status: "ok"; version: string; api_version: number }>();
  expectTypeOf<ApiError["code"]>().toEqualTypeOf<string>();
});
