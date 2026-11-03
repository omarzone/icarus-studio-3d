from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


def make_engine(database_url: str) -> Engine:
    url = make_url(database_url)
    if url.get_backend_name() != "sqlite":
        return create_engine(database_url, pool_pre_ping=True)
    if url.database and url.database != ":memory:":
        Path(url.database).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(database_url, connect_args={"check_same_thread": False})

    # SQLite ignores foreign keys unless each connection asks for them.
    @event.listens_for(engine, "connect")
    def _foreign_keys(connection, _record) -> None:  # type: ignore[no-untyped-def]
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine


class Database:
    def __init__(self, database_url: str) -> None:
        self.engine = make_engine(database_url)
        self._sessions = sessionmaker(self.engine, expire_on_commit=False)

    def session(self) -> Iterator[Session]:
        with self._sessions() as session:
            yield session
