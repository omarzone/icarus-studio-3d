// Community connection a release is built with; see community-config.ts.
interface ImportMetaEnv {
  readonly MAIN_VITE_COMMUNITY_URL?: string;
  readonly MAIN_VITE_SUPABASE_URL?: string;
  readonly MAIN_VITE_SUPABASE_ANON_KEY?: string;
}
