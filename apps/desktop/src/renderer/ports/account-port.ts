import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
import type { AvatarTone } from "../ui/avatar.tsx";
import { createAccountFixture } from "./account.fixture.ts";

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
};

export type ProfileEdit = Pick<Profile, "name" | "handle" | "location" | "website" | "bio" | "signatureOn">;

export type AccountPort = {
  getAccount: () => Promise<AccountSummary>;
  signIn: (provider: SignInProvider) => Promise<AccountSummary>;
  // Without a handle, the signed-in person's own profile.
  getProfile: (handle: string | undefined) => Promise<Profile>;
  listProfileCreations: (input: { handle: string | undefined; shelf: ProfileShelf }) => Promise<ProfileCreation[]>;
  updateProfile: (edit: ProfileEdit) => Promise<Profile>;
  changePhoto: () => Promise<void>;
  removePhoto: () => Promise<void>;
  follow: (handle: string) => Promise<void>;
};

export const accountPort = definePort<AccountPort>({
  app: {
    getAccount: pending({
      key: "account.get",
      summary: "Your community account",
      sprint: 13,
      ids: ["SCR-HOME", "SCR-PROFILE"],
    }),
    signIn: pending({ key: "account.sign-in", summary: "Signing in", sprint: 13, ids: ["MOD-SIGN-IN"] }),
    getProfile: pending({ key: "account.profile", summary: "Profiles", sprint: 13, ids: ["SCR-PROFILE"] }),
    listProfileCreations: pending({
      key: "account.profile-creations",
      summary: "Creations on a profile",
      sprint: 13,
      ids: ["SCR-PROFILE"],
    }),
    updateProfile: pending({
      key: "account.update-profile",
      summary: "Editing your profile",
      sprint: 13,
      ids: ["SCR-SETTINGS-PROFILE"],
    }),
    changePhoto: pending({
      key: "account.change-photo",
      summary: "Changing your photo",
      sprint: 13,
      ids: ["SCR-SETTINGS-PROFILE"],
    }),
    removePhoto: pending({
      key: "account.remove-photo",
      summary: "Removing your photo",
      sprint: 13,
      ids: ["SCR-SETTINGS-PROFILE"],
    }),
    follow: pending({ key: "account.follow", summary: "Following people", sprint: 13, ids: ["SCR-CREATION"] }),
  },
  prototype: createAccountFixture,
});
