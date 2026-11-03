import type { SkinImport, SkinImported } from "@icarus/contracts";
import { EngineUnavailable, engineUrl } from "./engine-url.ts";
import { EngineError, type RequestOptions, request } from "./request.ts";
import { isSkinImported } from "./response-checks.ts";

// 3D models drawn over colliders (ADR 008): importing one into a project and fetching a stored one to draw.

const skins = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/skins`;

export const skinApi = {
  importSkin: (projectId: string, body: SkinImport, options?: RequestOptions): Promise<SkinImported> =>
    request(skins(projectId), { method: "POST", body: JSON.stringify(body) }, isSkinImported, options),
  skinContent: async (
    projectId: string,
    asset: string,
    { url = engineUrl(), fetchFn = fetch }: RequestOptions = {},
  ): Promise<ArrayBuffer> => {
    const base = await url.current();
    let response: Response;
    try {
      response = await fetchFn(`${base}${skins(projectId)}/${encodeURIComponent(asset)}`);
    } catch {
      throw new EngineUnavailable("The engine did not answer");
    }
    if (!response.ok) {
      throw new EngineError("skin_unreadable", "The engine could not send this model");
    }
    return response.arrayBuffer();
  },
};

export type SkinApi = typeof skinApi;
