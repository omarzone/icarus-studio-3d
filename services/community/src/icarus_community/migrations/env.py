from alembic import context

from icarus_community import models  # noqa: F401  (registers every table on Base.metadata)
from icarus_community.db import Base, make_engine
from icarus_community.settings import load_settings

config = context.config
url = config.get_main_option("sqlalchemy.url") or load_settings().database_url


def run_offline() -> None:
    context.configure(url=url, target_metadata=Base.metadata, literal_binds=True, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


def run_online() -> None:
    engine = make_engine(url)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata, render_as_batch=True)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_offline()
else:
    run_online()
