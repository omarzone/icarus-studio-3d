# Icarus Community service

The online part of Icarus Studio 3D: accounts, creations (published project bundles with a thumbnail and a page), versions and remix lineage, categories, search, votes, comments, reports and moderation, profiles, follows, notifications, sharing with invites, privacy, blocking, downloading your data and deleting your account.

It is a FastAPI app with SQLAlchemy and Alembic. Locally it keeps everything in SQLite and a folder; on a server it uses Postgres and the same folder layout. Sign-in belongs to [Supabase Auth](https://supabase.com/docs/guides/auth): the service never sees a password, it only verifies the tokens Supabase issues.

## Run it locally (no Docker, no Supabase)

From the repository root:

```bash
pnpm community:sync   # once: install the service's Python packages with uv
pnpm community:dev    # serve on http://127.0.0.1:8790 with development sign-in
```

`pnpm community:dev` applies migrations, then serves with reload. Its `--dev` flag turns on **development sign-in** (`DEV_AUTH=true`) and makes `dev@icarus.localhost` a moderator, unless your environment or `.env` says otherwise. In this mode `POST /v1/dev/token` signs a one-hour token for any email, so every screen can be tried on one computer. A server started with `ENV=production` refuses to start with development sign-in on.

Then run the app (`pnpm dev`) in another terminal. The desktop finds the service through **one setting**, `community_url` in `community.json` in the settings folder (`~/.icarus`, or `ICARUS_SETTINGS_DIR`); a release carries it from its build instead. It defaults to `http://127.0.0.1:8790`. With no Supabase URL and anon key there, the app signs in through the server's development mode as `dev@icarus.localhost`.

To try a second person locally, ask for another token and call the API directly:

```bash
curl -s -X POST http://127.0.0.1:8790/v1/dev/token -H "content-type: application/json" -d '{"email":"ana@example.test"}'
```

The interactive API documentation is at http://127.0.0.1:8790/docs (not served in production).

## Settings

Every setting comes from the environment or a `.env` file in this folder; copy [`.env.example`](./.env.example) and never commit `.env`.

| Variable | Default | Meaning |
|---|---|---|
| `ENV` | `development` | `production` refuses `DEV_AUTH`, `CORS_ORIGINS=["*"]`, and starting without a way to verify tokens |
| `DATABASE_URL` | `sqlite:///./data/community.db` | Any SQLAlchemy URL; Postgres is `postgresql+psycopg://user:password@host:5432/db` |
| `FILES_DIR` | `./data/files` | Bundles, thumbnails and photos |
| `PUBLIC_URL` | `http://127.0.0.1:8790` | The address people reach the service at, used in share links |
| `CORS_ORIGINS` | `[]` | Browser origins allowed to call the API (JSON list); the desktop app needs none |
| `DEV_AUTH` | `false` | Development sign-in (`pnpm community:dev` turns it on) |
| `SUPABASE_URL` | empty | The Supabase project; tokens are verified with its JWKS |
| `SUPABASE_JWT_SECRET` | empty | Only for projects on the legacy shared secret (HS256) |
| `SUPABASE_AUDIENCE` | `authenticated` | Expected `aud` claim |
| `SUPABASE_SERVICE_ROLE_KEY` | empty | Optional: lets account deletion delete the Supabase user too. Server-side only |
| `MODERATOR_EMAILS` | `[]` | Emails that get the moderator role when they sign in (JSON list) |
| `MODERATION_REQUIRED` | `false` | Hold new creations for a moderator before they are listed |
| `WRITES_PER_MINUTE` | `60` | Writes per account per minute (in memory, per process) |
| `MAX_BUNDLE_BYTES` · `MAX_IMAGE_BYTES` | 8 MB · 2 MB | Upload limits |

## Connect a Supabase project

1. Create a project at supabase.com (the free plan is enough) and enable the providers you want under Authentication › Providers: Email, Google, GitHub.
2. Under Authentication › URL Configuration add `http://127.0.0.1:8791/auth/callback` to the redirect URLs. The app listens there while you sign in, so the browser can hand the sign-in back to it.
3. On the server set `SUPABASE_URL=https://<project>.supabase.co` and turn `DEV_AUTH` off.
4. Build the app with `MAIN_VITE_COMMUNITY_URL`, `MAIN_VITE_SUPABASE_URL` and `MAIN_VITE_SUPABASE_ANON_KEY` set (in `apps/desktop/.env.production`, see `apps/desktop/.env.example`), so the release reaches your server and project with nothing to set. For development, the same three values can go in `community.json` (`community_url`, `supabase_url`, `supabase_anon_key`).

The anon key is public by design; the service role key and the database address never go in the app. If the service keeps its tables in the Supabase Postgres, turn on row level security on every table with no policies, so the anon key cannot reach them through Supabase's own API.

## Migrations

The service applies migrations on start (`icarus-community serve`), or on demand:

```bash
uv run --directory services/community icarus-community migrate
```

After changing `models.py`, generate and read a new migration, then run the tests (one of them fails if the migrations and the models differ):

```bash
uv run --directory services/community alembic revision --autogenerate -m "add comments"
```

## Deploy to a VPS

The folder has a `Dockerfile` and a `docker-compose.yml` that run the service with Postgres.

1. Install Docker on the server and copy this folder (or clone the repository).
2. Create `.env` from `.env.example` with `ENV=production`, `DEV_AUTH=false`, `SUPABASE_URL`, `PUBLIC_URL=https://community.example.org`, `MODERATOR_EMAILS` and a strong `POSTGRES_PASSWORD`.
3. `docker compose up -d --build`. The service listens on `127.0.0.1:8790` on the host; put a reverse proxy with TLS in front of it (Caddy or nginx) for `https://community.example.org`.
4. In the app, set the community server address to `https://community.example.org`.

Back up the `db` and `files` volumes. `GET /health` answers `{"status": "ok", ...}` for monitoring.

## API

All routes are under `/v1` except `/health`. Writes need `Authorization: Bearer <token>`.

| Route | Purpose |
|---|---|
| `GET /health` | Status, version and the sign-in mode |
| `POST /v1/dev/token` | Development sign-in (only with `DEV_AUTH`) |
| `GET /v1/categories` | Categories |
| `GET /v1/creations?sort=&category=&q=&limit=&offset=` · `POST /v1/creations` | List and search · publish a project bundle with its thumbnail (a new creation or a new version) |
| `GET /v1/creations/{id}` · `/thumbnail` · `/bundle` | A creation with its versions and lineage · its picture · its bundle |
| `PUT` · `DELETE /v1/creations/{id}/vote` | Vote · take the vote back |
| `POST /v1/creations/{id}/reports` · `/appeals` | Report (optionally blocking the author) · appeal a removal |
| `GET` · `POST /v1/creations/{id}/comments?limit=&offset=` | Comments, newest first, with whether the author allows new ones · post one (closed when the author turned comments off) |
| `DELETE /v1/creations/{id}/comments/{comment_id}` · `POST .../reports` | Delete a comment (its author or a moderator) · report it to the moderation queue (optionally blocking its author) |
| `GET` · `PATCH /v1/me` · `PUT` · `DELETE /v1/me/photo` | Your profile · your photo |
| `GET` · `PATCH /v1/me/privacy` · `POST /v1/me/blocks` · `DELETE /v1/me/blocks/{handle}` | Privacy and blocking |
| `GET` · `PATCH /v1/me/notification-settings` · `GET /v1/me/notifications` · `POST /v1/me/notifications/read` | Notifications |
| `GET` · `PATCH /v1/me/pages/{project}` | The community page of one of your projects |
| `GET /v1/me/pages/{project}/share` · `PUT …/share/visibility` · `POST …/share/invites` · `PUT …/share/invites/{id}` | Visibility (public, unlisted, invited, private) and invites with roles |
| `GET /v1/me/export` · `DELETE /v1/me` | Download your data · delete your account |
| `GET /v1/profiles/{handle}` · `/creations?shelf=` · `/photo` · `PUT` · `DELETE …/follow` | Profiles and following |
| `GET /v1/moderation/counts` · `/queue?queue=` · `POST /v1/moderation/decisions` | Moderation (moderator role) |

### Bundles

A bundle is a JSON object: `format: "icarus.bundle"`, `format_version: 1`, `kind: "project"`, `contract_version`, `library_version`, `lineage.remix_of` and `project` (the engine's project document). The service refuses anything else: unknown fields, other kinds, strings that carry scripts or embedded programs, blobs, deep nesting and oversized files. Thumbnails and photos must be real PNG, JPEG or WebP pictures, recognised by their bytes.
