import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { COMMUNITY_READS } from "../../app/runtime/use-community-session.ts";
import type { CommunityConnection } from "../../ports/account-port.ts";
import { accountPort } from "../../ports/account-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { TextField } from "../../ui/text-field.tsx";

// Settings › Profile › Community server: which server the app publishes to and the Supabase project people sign
// in with. Empty Supabase fields use the server's development sign-in.
export function CommunityServerSection() {
  const account = usePort(accountPort);
  const query = useQuery({ queryKey: ["account", "connection"], queryFn: account.getConnection });
  return (
    <section aria-label="Community server" className="mt-2 flex flex-col gap-3">
      <span className="leading-tight font-semibold">Community server</span>
      <QueryView query={query}>{(connection) => <ConnectionForm connection={connection} />}</QueryView>
    </section>
  );
}

function ConnectionForm({ connection }: { connection: CommunityConnection }) {
  const account = usePort(accountPort);
  const client = useQueryClient();
  const [communityUrl, setCommunityUrl] = useState(connection.communityUrl);
  const [supabaseUrl, setSupabaseUrl] = useState(connection.supabaseUrl);
  const [anonKey, setAnonKey] = useState("");
  const save = useEngineAction(account.saveConnection);
  const signOut = useEngineAction(account.signOut);
  const refresh = () => {
    for (const queryKey of COMMUNITY_READS) {
      void client.invalidateQueries({ queryKey });
    }
  };
  const mode =
    connection.authMode === "supabase"
      ? `People sign in with Supabase. Allow ${connection.callbackUrl} as a redirect URL in the Supabase project.`
      : "No Supabase project is set: the server's development sign-in is used. Production servers refuse it.";
  return (
    <>
      <TextField
        label="Community server address"
        value={communityUrl}
        onChange={(event) => setCommunityUrl(event.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Supabase URL" value={supabaseUrl} onChange={(event) => setSupabaseUrl(event.target.value)} />
        <TextField
          label={connection.hasAnonKey ? "Supabase anon key (saved)" : "Supabase anon key"}
          value={anonKey}
          onChange={(event) => setAnonKey(event.target.value)}
        />
      </div>
      <span className="text-meta leading-tight text-fg-tertiary">{mode}</span>
      <div className="flex gap-2">
        <Act
          cta="Save server"
          disabled={save.isPending}
          onClick={() =>
            save.mutate(
              { communityUrl, supabaseUrl, ...(anonKey.trim() === "" ? {} : { supabaseAnonKey: anonKey }) },
              {
                onSuccess: (saved) => {
                  setAnonKey("");
                  client.setQueryData(["account", "connection"], saved);
                  refresh();
                },
              },
            )
          }
          className={buttonClass("secondary", "h-8.5 px-4 text-body")}
        >
          Save server
        </Act>
        <Act
          cta="Sign out"
          onClick={() => signOut.mutate(undefined, { onSuccess: refresh })}
          className={buttonClass("secondary", "h-8.5 px-4 text-body")}
        >
          Sign out
        </Act>
      </div>
    </>
  );
}
