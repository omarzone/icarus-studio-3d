import { Plug } from "lucide-react";
import { GoTo } from "../app/navigation/go-to.tsx";
import { buttonClass } from "./button-styles.ts";

// No model is connected, so the copilot cannot answer; the way out is Settings › AI models.
export function CopilotNotConnectedState({ detail }: { detail?: string }) {
  return (
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <Plug size={18} strokeWidth={1.75} className="text-fg-tertiary" aria-hidden />
      <p className="text-headline font-semibold">Connect a model to use the copilot</p>
      <p className="max-w-90 text-body text-fg-tertiary">
        {detail ?? "The copilot needs an AI model. Add your endpoint and key in Settings › AI models."}
      </p>
      <GoTo to="SCR-SETTINGS-MODELS" cta="Open AI models" className={buttonClass("primary", "mt-1")}>
        Open AI models
      </GoTo>
    </div>
  );
}
