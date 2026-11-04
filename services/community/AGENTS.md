# AGENTS.md — services/community (Python)

Inherits everything from `/AGENTS.md`. This file covers only what is specific to the community service.

## Stack and commands

Python 3.12 pinned by uv (never the system Python). FastAPI · Pydantic v2 · pydantic-settings · SQLAlchemy 2 · Alembic · PyJWT.

| What | Command (from the repo root) |
|---|---|
| Install | `pnpm community:sync` |
| Local server (development sign-in, port 8790) | `pnpm community:dev` |
| Lint and types | `pnpm community:lint` |
| Tests | `pnpm community:test` |
| New migration | `uv run --directory services/community alembic revision --autogenerate -m "what changed"` |

Add dependencies with `uv add`, never `pip install`. Justify any new dependency in your report.

## Module map

| Module | Responsibility | Does not |
|---|---|---|
| `settings.py` | Every setting from the environment or `.env`; refuses unsafe production settings | read files the person chose |
| `auth.py` | Verifying Supabase tokens (JWKS or JWT secret); development tokens | store or check passwords |
| `models.py` · `db.py` | Tables and the database connection | contain rules |
| `migrations/` | Alembic migrations, applied by `icarus-community serve` and `migrate` | change data by hand |
| `bundle_check.py` · `image_check.py` | Accepting only data-only project bundles and real pictures | execute or unpack anything |
| `file_store.py` | Where bundles, thumbnails and photos live (`LocalFileStore` now) | take keys from requests |
| `catalog.py` · `comments.py` · `publishing.py` · `pages.py` | Creations, versions, remix lineage, votes, comments, reports, pages and sharing | know about HTTP |
| `accounts.py` · `notifications.py` · `moderation.py` · `account_data.py` | Profiles, follows, blocks, notifications, moderation, export and deletion | know about HTTP |
| `schemas/` | Request and answer models (`extra="forbid"`) | contain logic |
| `api/` | Thin routers: parse, check the caller, delegate | contain business logic |

## Rules

- **No passwords, ever.** Sign-in belongs to Supabase; the service verifies tokens and keys accounts by the token's `sub`.
- **Development sign-in stays local.** `DEV_AUTH` is refused when `ENV=production`; never weaken that check.
- **Bundles carry data, never code.** Every publish passes `check_bundle` and `check_image`; widen them only with a test that shows the new shape is still data.
- **Schema changes are migrations.** Change `models.py`, generate a migration, read it, and keep `test_migrations_build_exactly_the_tables_the_code_uses` passing. SQLite and Postgres must both work: no SQLite-only SQL.
- **Writes are limited.** Every write route depends on `Writer` (signed in, not suspended, within the rate limit).
- **The API is versioned** under `/v1` and is a contract: the desktop checks every answer in `apps/desktop/src/renderer/community-client/`. Changing an answer's shape lands first and alone, then the desktop zone updates `community-types.ts` and `community-checks.ts`.
- **Tests are offline:** signed test tokens, temporary SQLite and folders, no network.
