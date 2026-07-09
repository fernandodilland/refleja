"""Motor de base de datos y sesión (SQLAlchemy 2.0, síncrono)."""
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


def _engine_kwargs(url: str) -> dict:
    if url.startswith("sqlite"):
        # SQLite: permitir uso desde el threadpool de FastAPI.
        return {"connect_args": {"check_same_thread": False}}
    # MariaDB/MySQL: reciclar conexiones y verificar antes de usar.
    return {"pool_pre_ping": True, "pool_recycle": 1800}


engine = create_engine(
    settings.DATABASE_URL,
    future=True,
    echo=False,
    **_engine_kwargs(settings.DATABASE_URL),
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """Dependencia FastAPI: entrega una sesión y la cierra al terminar."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Crea las tablas si no existen (uso en dev/local con SQLite)."""
    from . import models  # noqa: F401  (registra los modelos en Base.metadata)

    Base.metadata.create_all(bind=engine)
