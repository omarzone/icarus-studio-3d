# 014 · Community service in the repository, sign-in with Supabase Auth

**Context.** Publishing, browsing, voting, moderation and sharing need an online, multi-user service that anyone can self-host, while the engine stays local and single-user. Accounts must not make Icarus handle passwords.

**Decision.** `services/community` is a FastAPI app (uv, Python 3.12) with SQLAlchemy 2 and Alembic over SQLite locally and Postgres on a server (`DATABASE_URL`), files behind a small `FileStore` (a local folder now), and Docker files for a VPS. Supabase Auth issues the tokens: the desktop main process signs in with `@supabase/supabase-js` (PKCE, system browser, loopback callback on `127.0.0.1:8791`) and keeps the session encrypted by the OS keychain; the service only verifies tokens (JWKS, or the legacy JWT secret). A development sign-in mode (`DEV_AUTH`, refused with `ENV=production`) runs everything locally without Supabase. Bundles are JSON project documents checked as data only. The renderer reaches the service only through the main process.

**Consequences.** The service owns no passwords and can move between Supabase projects or hosts by configuration. The desktop needs one setting (`community_url`) to switch servers. Remixing waits for the engine to import bundles.
