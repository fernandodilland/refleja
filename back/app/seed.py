"""Seeder para desarrollo local (SQLite).

Crea las tablas y el usuario administrador inicial de forma idempotente.
Uso:  python -m app.seed
En producción (MariaDB) se usa seed.sql en su lugar.
"""
from sqlalchemy import select

from .database import SessionLocal, init_db
from .models import AdminUser
from .security import hash_password

ADMIN_USERNAME = "fernando"
ADMIN_PASSWORD = "REDACTED"  # solo para bootstrap local


def run() -> None:
    init_db()
    with SessionLocal() as db:
        exists = db.execute(
            select(AdminUser).where(AdminUser.username == ADMIN_USERNAME)
        ).scalar_one_or_none()
        if exists:
            print(f"✓ El usuario '{ADMIN_USERNAME}' ya existe (id={exists.id}).")
            return
        user = AdminUser(
            username=ADMIN_USERNAME,
            password_hash=hash_password(ADMIN_PASSWORD),
            is_active=True,
        )
        db.add(user)
        db.commit()
        print(f"✓ Usuario administrador '{ADMIN_USERNAME}' creado (Argon2id).")


if __name__ == "__main__":
    run()
