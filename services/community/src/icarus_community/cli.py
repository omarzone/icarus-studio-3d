import argparse
import json
import os
from pathlib import Path

import uvicorn
from alembic import command
from alembic.config import Config

from icarus_community.settings import load_settings

MIGRATIONS = Path(__file__).resolve().parent / "migrations"
# The account the desktop app signs in as when the server runs in development mode.
DEV_EMAIL = "dev@icarus.localhost"


def alembic_config(database_url: str) -> Config:
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def migrate(database_url: str) -> None:
    command.upgrade(alembic_config(database_url), "head")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="icarus-community", description="Run the Icarus community service.")
    sub = parser.add_subparsers(dest="command", required=True)
    serve = sub.add_parser("serve", help="Apply migrations and serve the API.")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8790)
    serve.add_argument("--reload", action="store_true")
    serve.add_argument("--no-migrate", action="store_true", help="Skip applying migrations before serving.")
    serve.add_argument(
        "--dev",
        action="store_true",
        help="Local development: sign-in without Supabase and a local moderator, unless the environment says so.",
    )
    sub.add_parser("migrate", help="Apply database migrations up to the latest.")
    args = parser.parse_args(argv)
    if getattr(args, "dev", False):
        # Defaults only: anything set in the environment or .env wins, and ENV=production still refuses DEV_AUTH.
        os.environ.setdefault("DEV_AUTH", "true")
        os.environ.setdefault("MODERATOR_EMAILS", json.dumps([DEV_EMAIL]))
    settings = load_settings()
    if args.command == "migrate":
        migrate(settings.database_url)
        return
    if not args.no_migrate:
        migrate(settings.database_url)
    uvicorn.run(
        "icarus_community.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        proxy_headers=True,
        forwarded_allow_ips="127.0.0.1",
    )


if __name__ == "__main__":
    main()
