import type { AttachmentInfo, AttachmentUpload } from "@icarus/contracts";
import { isAttachmentInfo } from "./copilot-checks.ts";
import { EngineUnavailable, engineUrl } from "./engine-url.ts";
import { EngineError, type RequestOptions, request } from "./request.ts";

// Files sent with chat messages: uploading them and the addresses the engine serves them at.

// Addresses of an attachment on the running engine, for <img>, <video> and previews.
export type AttachmentLinks = {
  content: (id: string) => string;
  frame: (id: string, index: number) => string;
};

const attachment = (id: string) => `/attachments/${encodeURIComponent(id)}`;

export const attachmentApi = {
  uploadAttachment: (projectId: string, body: AttachmentUpload, options?: RequestOptions): Promise<AttachmentInfo> =>
    request(
      `/projects/${encodeURIComponent(projectId)}/attachments`,
      { method: "POST", body: JSON.stringify(body) },
      isAttachmentInfo,
      options,
    ),
  attachmentLinks: async ({ url = engineUrl() }: RequestOptions = {}): Promise<AttachmentLinks> => {
    const base = await url.current();
    return {
      content: (id) => `${base}${attachment(id)}/content`,
      frame: (id, index) => `${base}${attachment(id)}/frames/${index}`,
    };
  },
  attachmentText: async (id: string, { url = engineUrl(), fetchFn = fetch }: RequestOptions = {}): Promise<string> => {
    const base = await url.current();
    let response: Response;
    try {
      response = await fetchFn(`${base}${attachment(id)}/content`);
    } catch {
      throw new EngineUnavailable("The engine did not answer");
    }
    if (!response.ok) {
      throw new EngineError("attachment_unreadable", "The engine could not send this file");
    }
    return response.text();
  },
};

export type AttachmentApi = typeof attachmentApi;
