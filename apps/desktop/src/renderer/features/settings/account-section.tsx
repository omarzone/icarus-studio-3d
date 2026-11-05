import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Act } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { COMMUNITY_READS } from "../../app/runtime/use-community-session.ts";
import { accountPort } from "../../ports/account-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";

// Settings › Profile › Account: who is signed in to the community and a way out. The server comes with the app.
export function AccountSection() {
  const account = usePort(accountPort);
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["account"], queryFn: account.getAccount });
  const signOut = useEngineAction(account.signOut);
  if (!query.data?.signedIn) {
    return null;
  }
  return (
    <section aria-label="Account" className="mt-2 flex items-center gap-3">
      <span className="flex-1 leading-tight font-semibold">Account</span>
      <Act
        cta="Sign out"
        onClick={() =>
          signOut.mutate(undefined, {
            onSuccess: () => {
              for (const queryKey of COMMUNITY_READS) {
                void client.invalidateQueries({ queryKey });
              }
            },
          })
        }
        className={buttonClass("secondary", "h-8.5 px-4 text-body")}
      >
        Sign out
      </Act>
    </section>
  );
}
