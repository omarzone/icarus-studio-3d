import type { EngineApi } from "../engine-client/engine-api.ts";
import type { BodyPort } from "./body-port.ts";
import { bodyParts, rigCheckFromReport } from "./body-views.ts";

type BodyApi = Pick<EngineApi, "project" | "library">;

// The body workspace on the engine: in the app the body key is the open project's id.
export function createEngineBodyPort(api: BodyApi): Pick<BodyPort, "getRigCheck" | "getParts"> {
  return {
    getRigCheck: async (body) => rigCheckFromReport((await api.project(body)).report),
    getParts: async (body) => {
      const [state, catalog] = await Promise.all([api.project(body), api.library()]);
      return bodyParts(state.project, catalog);
    },
  };
}
