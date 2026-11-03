import { Globe, LogIn } from "lucide-react";
import { GoTo } from "../app/navigation/go-to.tsx";
import { buttonClass } from "./button-styles.ts";

// The community server did not answer; the way out is its address in Settings › Profile › Community server.
export function CommunityNotConnectedState({ detail }: { detail?: string }) {
  return (
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <Globe size={18} strokeWidth={1.75} className="text-fg-tertiary" aria-hidden />
      <p className="text-headline font-semibold">Connect your community server</p>
      <p className="max-w-100 text-body text-fg-tertiary">
        {detail ?? "The community server did not answer."} Start it, or set its address in Settings › Profile.
      </p>
      <GoTo to="SCR-SETTINGS-PROFILE" cta="Open community settings" className={buttonClass("primary", "mt-1")}>
        Open community settings
      </GoTo>
    </div>
  );
}

// The view needs a community account; creating and training never do.
export function CommunitySignedOutState() {
  return (
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <LogIn size={18} strokeWidth={1.75} className="text-fg-tertiary" aria-hidden />
      <p className="text-headline font-semibold">Sign in to the community</p>
      <p className="max-w-90 text-body text-fg-tertiary">
        You only need an account to share, vote and remix. Creating and training work without one.
      </p>
      <GoTo to="MOD-SIGN-IN" cta="Sign in" className={buttonClass("primary", "mt-1")}>
        Sign in
      </GoTo>
    </div>
  );
}
