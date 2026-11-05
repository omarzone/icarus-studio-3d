import type { CommunityBridge } from "../../shared/community-bridge.ts";
import { isCommunityConnection, isCommunitySession, isSignInResult } from "../../shared/community-bridge.ts";
import type { CommunityApi } from "../community-client/community-api.ts";
import { communityApi } from "../community-client/community-api.ts";
import { CommunityNotConnected, CommunitySignedOut } from "../community-client/community-request.ts";
import type { AccountPort, CommunityConnection } from "./account-port.ts";
import { accountView, profileCreationView, profileView, SIGNED_OUT } from "./community-views.ts";

type AccountApi = Pick<
  CommunityApi,
  "me" | "profile" | "profileCreations" | "updateMe" | "setPhoto" | "removePhoto" | "follow"
>;

const bridge = (): CommunityBridge => window.icarus.community;

// People type "ana.dev"; the service keeps full web addresses.
export function websiteAddress(text: string): string {
  const trimmed = text.trim();
  return trimmed === "" || /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function connection(community: CommunityBridge): Promise<CommunityConnection> {
  const value: unknown = await community.connection();
  if (!isCommunityConnection(value)) {
    throw new Error("The app could not read its community settings");
  }
  return value;
}

// The community account: signing in happens in the main process (Supabase, or the server's development mode);
// profiles, photos and follows come from the community service.
export function createCommunityAccount(
  api: AccountApi = communityApi,
  community: () => CommunityBridge = bridge,
): AccountPort {
  const own = async (handle: string | undefined) => {
    if (handle !== undefined) {
      return handle;
    }
    return (await api.me()).handle;
  };
  return {
    getAccount: async () => {
      const session: unknown = await community().session();
      if (!isCommunitySession(session) || !session.signedIn) {
        return SIGNED_OUT;
      }
      try {
        return accountView(await api.me());
      } catch (error) {
        if (error instanceof CommunitySignedOut || error instanceof CommunityNotConnected) {
          return SIGNED_OUT;
        }
        throw error;
      }
    },
    signIn: async ({ provider, email }) => {
      const result: unknown = await community().signIn({ provider, ...(email ? { email } : {}) });
      if (!isSignInResult(result)) {
        throw new Error("The sign-in answer could not be read");
      }
      switch (result.kind) {
        case "failed":
          throw new Error(result.reason);
        case "link-sent":
          return { kind: "link-sent", email: result.email };
        case "signed-in":
          return { kind: "signed-in", account: accountView(await api.me()) };
      }
    },
    signOut: () => community().signOut(),
    getConnection: () => connection(community()),
    getProfile: async (handle) => profileView(handle === undefined ? await api.me() : await api.profile(handle)),
    listProfileCreations: async ({ handle, shelf }) =>
      (await api.profileCreations(await own(handle), shelf)).map(profileCreationView),
    updateProfile: async (edit) =>
      profileView(
        await api.updateMe({
          name: edit.name.trim(),
          handle: edit.handle.trim().toLowerCase(),
          location: edit.location.trim(),
          website: websiteAddress(edit.website),
          bio: edit.bio,
          signature_on: edit.signatureOn,
        }),
      ),
    changePhoto: async (photo) => {
      await api.setPhoto(photo);
    },
    removePhoto: async () => {
      await api.removePhoto();
    },
    follow: async (handle) => {
      await api.follow(handle, true);
    },
  };
}
