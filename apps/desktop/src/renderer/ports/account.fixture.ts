import type { AccountPort, AccountSummary, CommunityConnection, Profile, ProfileCreation } from "./account-port.ts";

// Sample data from the design, used only by the prototype, the design gallery and tests.
const OWN: Profile = {
  handle: "omar",
  name: "Omar",
  initials: "O",
  tone: 0,
  bio: "building robots that learn",
  location: "Monterrey",
  website: "omar.dev",
  signature: "Omar, made with Icarus",
  signatureOn: true,
  own: true,
  stats: { creations: 4, votes: 174, remixes: 23, followers: 58 },
  picture: null,
  following: false,
  moderator: true,
};

const OTHERS: readonly Profile[] = [
  {
    handle: "mara",
    name: "Mara Ortiz",
    initials: "MA",
    tone: 1,
    bio: "parking robots and other small wins",
    location: "Lisbon",
    website: "",
    signature: "Mara, made with Icarus",
    signatureOn: true,
    own: false,
    stats: { creations: 12, votes: 4100, remixes: 530, followers: 812 },
    picture: null,
    following: false,
    moderator: false,
  },
];

const OWN_CREATIONS: readonly ProfileCreation[] = [
  { id: "park-pilot", name: "Park Pilot", status: "review", votes: 0 },
  { id: "tripod-jumper", name: "Tripod Jumper", status: "public", votes: 128 },
  { id: "dance-copy", name: "Dance Copy", status: "private", votes: 0 },
  { id: "parallel-lots", name: "Parallel Lots", status: "public", votes: 46 },
];

export function createAccountFixture(): AccountPort {
  let profile = OWN;
  let account: AccountSummary = {
    signedIn: true,
    name: OWN.name,
    handle: OWN.handle,
    initials: OWN.initials,
    tone: OWN.tone,
  };
  const find = (handle: string | undefined) => {
    if (handle === undefined || handle === profile.handle) {
      return profile;
    }
    const other = OTHERS.find((item) => item.handle === handle);
    if (!other) {
      throw new Error(`No profile @${handle}`);
    }
    return other;
  };
  const connection: CommunityConnection = {
    communityUrl: "http://127.0.0.1:8790",
    supabaseUrl: "",
    hasAnonKey: false,
    authMode: "dev",
    callbackUrl: "http://127.0.0.1:8791/auth/callback",
  };
  return {
    getAccount: async () => account,
    signIn: async () => {
      account = { ...account, signedIn: true };
      return { kind: "signed-in", account };
    },
    signOut: async () => {
      account = { ...account, signedIn: false };
    },
    getConnection: async () => connection,
    getProfile: async (handle) => find(handle),
    listProfileCreations: async ({ handle, shelf }) =>
      find(handle).own && shelf === "creations" ? [...OWN_CREATIONS] : [],
    updateProfile: async (edit) => {
      profile = { ...profile, ...edit };
      account = { ...account, name: profile.name, handle: profile.handle };
      return profile;
    },
    changePhoto: async () => undefined,
    removePhoto: async () => undefined,
    follow: async () => undefined,
  };
}
