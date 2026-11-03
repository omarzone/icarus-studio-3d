import type { Server } from "node:http";
import { createServer } from "node:http";
import { tokens } from "@icarus/ui-tokens";

export const CALLBACK_PATH = "/auth/callback";
export const DEFAULT_CALLBACK_PORT = 8791;

const PAGE = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
  `<body style="font-family:system-ui;background:${tokens.color.bg.app};color:${tokens.color.fg.default};` +
  'display:grid;place-items:center;height:100vh;margin:0">' +
  `<div style="text-align:center"><h1 style="font-size:20px">${title}</h1><p>${body}</p></div></body>`;

export type CallbackWait = { url: string; done: Promise<URLSearchParams>; close: () => void };

// Waits on 127.0.0.1 for the browser to come back from Supabase with `?code=` (OAuth or a sign-in link); the
// page tells the person to return to the app. Only one sign-in waits at a time.
export function waitForCallback(port: number, timeoutMs: number): Promise<CallbackWait> {
  return new Promise((resolveWait, rejectWait) => {
    let settle: (params: URLSearchParams) => void = () => undefined;
    let fail: (error: Error) => void = () => undefined;
    const done = new Promise<URLSearchParams>((resolve, reject) => {
      settle = resolve;
      fail = reject;
    });
    const server: Server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
      if (url.pathname !== CALLBACK_PATH) {
        response.writeHead(404).end();
        return;
      }
      const failed = url.searchParams.get("error_description") ?? url.searchParams.get("error");
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(
        failed
          ? PAGE("Sign-in did not finish", "Go back to Icarus Studio 3D and try again.")
          : PAGE("You are signed in", "You can close this tab and go back to Icarus Studio 3D."),
      );
      finish();
      if (failed) {
        fail(new Error(failed));
      } else {
        settle(url.searchParams);
      }
    });
    const timer = setTimeout(() => {
      finish();
      fail(new Error("Sign-in took too long; try again"));
    }, timeoutMs);
    const finish = () => {
      clearTimeout(timer);
      server.close();
    };
    server.once("error", (error) => {
      clearTimeout(timer);
      rejectWait(new Error(`The sign-in callback port ${port} is busy: ${error.message}`));
    });
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const bound = typeof address === "object" && address !== null ? address.port : port;
      resolveWait({ url: `http://127.0.0.1:${bound}${CALLBACK_PATH}`, done, close: finish });
    });
  });
}
