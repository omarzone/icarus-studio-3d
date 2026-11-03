import { definePort } from "../app/runtime/port.tsx";
import type { AvatarTone } from "../ui/avatar.tsx";
import { createAccountFixture } from "./account.fixture.ts";
import { createCommunityAccount } from "./account-community.ts";

export type SignInProvider = "google" | "github" | "email";

export type AccountSummary = {
  signedIn: boolean;
  name: string;
  handle: string;
  initials: string;
  tone: AvatarTone;
};

export type ProfileShelf = "creations" | "remixes" | "liked" | "drafts";

export type ProfileCreationStatus = "review" | "public" | "private";

export type ProfileCreation = { id: string; name: string; status: ProfileCreationStatus; votes: number };

export type Profile = {
  handle: string;
  name: string;
  initials: string;
  tone: AvatarTone;
  bio: string;
  location: string;
  website: string;
  signature: string;
  signatureOn: boolean;
  // The signed-in person's own profile, which they can edit.
  own: boolean;
  stats: { creations: number; votes: number; remixes: number; followers: number };
  // Where the community keeps the photo (read with `communityPort.getPicture`), or null.
  picture: string | null;
  following: boolean;
  moderator: boolean;
};

export type ProfileEdit = Pick<Profile, "name" | "handle" | "location" | "website" | "bio" | "signatureOn">;

// Which community server the app talks to and how people sign in to it.
export type CommunityConnection = {
  communityUrl: string;
  supabaseUrl: string;
  hasAnonKey: boolean;
  // "dev": the server's local development sign-in, used while no Supabase project is set.
  authMode: "supabase" | "dev";
  callbackUrl: string;
};

export type CommunityConnectionEdit = { communityUrl: string; supabaseUrl: string; supabaseAnonKey?: string };

export type SignInOutcome =
  | { kind: "signed-in"; account: AccountSummary }
  // A sign-in link went to this address; opening it finishes signing in.
  | { kind: "link-sent"; email: string };

export type AccountPort = {
  getAccount: () => Promise<AccountSummary>;
  signIn: (input: { provider: SignInProvider; email?: string }) => Promise<SignInOutcome>;
  signOut: () => Promise<void>;
  getConnection: () => Promise<CommunityConnection>;
  saveConnection: (edit: CommunityConnectionEdit) => Promise<CommunityConnection>;
  // Without a handle, the signed-in person's own profile.
  getProfile: (handle: string | undefined) => Promise<Profile>;
  listProfileCreations: (input: { handle: string | undefined; shelf: ProfileShelf }) => Promise<ProfileCreation[]>;
  updateProfile: (edit: ProfileEdit) => Promise<Profile>;
  // A PNG, JPEG or WebP picture as a data URL.
  changePhoto: (photo: string) => Promise<void>;
  removePhoto: () => Promise<void>;
  follow: (handle: string) => Promise<void>;
};

export const accountPort = definePort<AccountPort>({
  app: createCommunityAccount(),
  prototype: createAccountFixture,
});
