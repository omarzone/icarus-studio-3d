// MOD-SIGN-IN
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort, useRuntimeMode } from "../../app/runtime/port.tsx";
import type { SignInProvider } from "../../ports/account-port.ts";
import { accountPort } from "../../ports/account-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { Dialog } from "../../ui/dialog.tsx";
import { TextField } from "../../ui/text-field.tsx";
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

const providerClass = "flex h-11 items-center justify-center gap-2.5 rounded-card-sm font-semibold active:opacity-80";

// Icarus never sees a password: Google and GitHub sign in on their own page in the system browser, email gets a
// one-time link. Against a community server in development mode every button signs in to its local account.
export function SignInDialog() {
  const account = usePort(accountPort);
  const client = useQueryClient();
  const connection = useQuery({ queryKey: ["account", "connection"], queryFn: account.getConnection });
  const signIn = useEngineAction(account.signIn);
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const supabase = connection.data?.authMode === "supabase";
  // The sample data has no server; only the app says which kind of server it signs in to.
  const devServer = useRuntimeMode() === "app" && connection.data?.authMode === "dev";
  const refresh = () => client.invalidateQueries({ queryKey: ["account"] });
  const sendLink = () =>
    signIn.mutate(
      { provider: "email", email },
      { onSuccess: (outcome) => setSentTo(outcome.kind === "link-sent" ? outcome.email : null) },
    );
  return (
    <Dialog title="Sign in to Icarus" width="w-105">
      <p className="m-0 leading-normal text-fg-secondary">
        You only need an account to share or remix. Creating and training work offline, on your computer.
      </p>
      {devServer ? (
        <p className="m-0 text-meta leading-tight text-fg-tertiary">
          This community server is in development mode: you sign in to its local test account.
        </p>
      ) : null}
      {PROVIDERS.map(({ provider, label, mark, className }) =>
        provider === "email" && supabase ? (
          <Act
            key={provider}
            cta={label}
            aria-expanded={emailOpen}
            onClick={() => setEmailOpen(true)}
            className={`${providerClass} ${className}`}
          >
            {mark}
            {label}
          </Act>
        ) : (
          <GoTo
            key={provider}
            to="SCR-PROFILE"
            cta={label}
            onClick={() => signIn.mutate({ provider }, { onSuccess: refresh })}
            className={`${providerClass} ${className}`}
          >
            {mark}
            {label}
          </GoTo>
        ),
      )}
      {emailOpen && sentTo === null ? (
        <div className="flex items-end gap-2">
          <TextField label="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <Act
            cta="Send sign-in link"
            disabled={signIn.isPending || email.trim() === ""}
            onClick={sendLink}
            className={buttonClass("primary", "h-8.5 shrink-0 text-body")}
          >
            Send sign-in link
          </Act>
        </div>
      ) : null}
      {sentTo !== null ? (
        <p role="status" className="m-0 leading-normal text-fg-secondary">
          A sign-in link is on its way to {sentTo}. Open it on this computer to finish signing in.
        </p>
      ) : null}
      <p className="m-0 text-center text-meta leading-tight text-fg-tertiary">
        By continuing you agree to the community guidelines and terms.
      </p>
    </Dialog>
  );
}
