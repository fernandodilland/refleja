"""Motor de base de datos y sesión (SQLAlchemy 2.0, síncrono)."""
from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


def _engine_kwargs(url: str) -> dict:
    if url.startswith("sqlite"):
        # SQLite: permitir uso desde el threadpool de FastAPI.
        return {"connect_args": {"check_same_thread": False}}
    # MariaDB/MySQL: reciclar conexiones, verificar antes de usar y forzar UTC
    # para que created_at/updated_at (server_default) coincidan con utcnow().
    return {
        "pool_pre_ping": True,
        "pool_recycle": 1800,
        "connect_args": {"init_command": "SET time_zone='+00:00'"},
    }


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
    """Crea las tablas que falten y aplica migraciones ligeras idempotentes."""
    from . import models  # noqa: F401  (registra los modelos en Base.metadata)

    Base.metadata.create_all(bind=engine)
    _apply_light_migrations()


# Columnas añadidas a tablas ya existentes (create_all NO altera tablas).
# Idempotente: ADD COLUMN IF NOT EXISTS (MariaDB 10.0+). En SQLite no hace falta
# porque create_all ya crea la tabla con las columnas nuevas.
_MYSQL_MIGRATIONS = [
    "ALTER TABLE visitor ADD COLUMN IF NOT EXISTS events_count INT NOT NULL DEFAULT 0",
    "ALTER TABLE visitor ADD COLUMN IF NOT EXISTS run_count INT NOT NULL DEFAULT 0",
    "ALTER TABLE visitor ADD COLUMN IF NOT EXISTS completed_count INT NOT NULL DEFAULT 0",
    "ALTER TABLE visitor ADD COLUMN IF NOT EXISTS action_count INT NOT NULL DEFAULT 0",
    "ALTER TABLE form_run ADD COLUMN IF NOT EXISTS counted JSON NULL",
]


def _apply_light_migrations() -> None:
    if not engine.url.get_backend_name().startswith("mysql"):
        return
    for stmt in _MYSQL_MIGRATIONS:
        try:
            with engine.begin() as conn:
                conn.execute(text(stmt))
        except Exception:  # noqa: BLE001 (si falta privilegio ALTER, se ignora)
            pass
