// MOD-SIGN-IN
import { useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import type { ReactNode } from "react";
import { GoTo } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { accountPort, type SignInProvider } from "../../ports/account-port.ts";
import { Dialog } from "../../ui/dialog.tsx";
import { GitHubMark, GoogleMark } from "./brand-marks.tsx";

const PROVIDERS: readonly { provider: SignInProvider; label: string; mark: ReactNode; className: string }[] = [
  {
    provider: "google",
    label: "Continue with Google",
    mark: <GoogleMark />,
    className: "bg-selected text-on-selected hover:opacity-90",
  },
  {
    provider: "github",
    label: "Continue with GitHub",
    mark: <GitHubMark />,
    className: "bg-control text-fg hover:bg-control-raised",
  },
  {
    provider: "email",
    label: "Continue with email",
    mark: <Mail size={16} strokeWidth={1.75} aria-hidden />,
    className: "bg-control text-fg hover:bg-control-raised",
  },
];

// Icarus never sees a password: each provider signs in through its own page, which the engine opens.
export function SignInDialog() {
  const account = usePort(accountPort);
  const client = useQueryClient();
  const signIn = useEngineAction(account.signIn);
  return (
    <Dialog title="Sign in to Icarus" width="w-105">
      <p className="m-0 leading-normal text-fg-secondary">
        You only need an account to share or remix. Creating and training work offline, on your computer.
      </p>
      {PROVIDERS.map(({ provider, label, mark, className }) => (
        <GoTo
          key={provider}
          to="SCR-PROFILE"
          cta={label}
          onClick={() =>
            signIn.mutate(provider, { onSuccess: () => client.invalidateQueries({ queryKey: ["account"] }) })
          }
          className={`flex h-11 items-center justify-center gap-2.5 rounded-card-sm font-semibold active:opacity-80 ${className}`}
        >
          {mark}
          {label}
        </GoTo>
      ))}
      <p className="m-0 text-center text-meta leading-tight text-fg-tertiary">
        By continuing you agree to the community guidelines and terms.
      </p>
    </Dialog>
  );
}
