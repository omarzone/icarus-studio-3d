import type { Catalog } from "../../app/navigation/route-registry.ts";
import { ChatPanel } from "./chat-panel.tsx";

export const catalog: Catalog = {
  modules: [
    {
      id: "PNL-CHAT",
      component: () => (
        <div className="flex h-[900px] w-95 flex-col p-3">
          <ChatPanel
            conversation="park-pilot-proposal"
            placeholder="Describe a change to the world…"
            suggestionRoutes={{ "new-idea": "SCR-IDEAS" }}
          />
        </div>
      ),
    },
  ],
};
