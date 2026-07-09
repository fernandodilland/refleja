"""Hashing de contraseñas (Argon2id), JWT y utilidades criptográficas."""
import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2 import exceptions as argon2_exc
from argon2.low_level import Type

from .config import settings

# --- Argon2id ---------------------------------------------------------------
# Parámetros alineados con el hash sembrado en seed.sql.
_ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,   # 64 MiB
    parallelism=4,
    hash_len=32,
    salt_len=16,
    type=Type.ID,        # Argon2id
)


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(stored_hash: str, password: str) -> bool:
    try:
        _ph.verify(stored_hash, password)
        return True
    except (argon2_exc.VerifyMismatchError, argon2_exc.InvalidHashError, Exception):
        return False


def needs_rehash(stored_hash: str) -> bool:
    try:
        return _ph.check_needs_rehash(stored_hash)
    except Exception:
        return False


# --- Utilidades hash --------------------------------------------------------
def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def hmac_vid(vid: str) -> str:
    """HMAC-SHA256 del id de visitante -> se guarda esto, nunca el vid en claro."""
    return hmac.new(
        settings.VID_HMAC_KEY.encode("utf-8"), vid.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def new_vid() -> str:
    """Identificador aleatorio de visitante (128 bits), no ligado a la IP."""
    return secrets.token_hex(16)


def new_jti() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


def utcnow() -> datetime:
    """UTC naïve: consistente con lo que SQLite/MariaDB guardan en columnas DateTime."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


# --- JWT --------------------------------------------------------------------
def _encode(payload: dict, secret: str, ttl: timedelta) -> str:
    now = _now()
    body = {**payload, "iat": now, "exp": now + ttl}
    return jwt.encode(body, secret, algorithm="HS256")


def _decode(token: str, secret: str, expected_typ: str) -> dict:
    data = jwt.decode(token, secret, algorithms=["HS256"])
    if data.get("typ") != expected_typ:
        raise jwt.InvalidTokenError("tipo de token inválido")
    return data


def create_access_token(user_id: int, username: str) -> str:
    return _encode(
        {"typ": "access", "sub": str(user_id), "username": username},
        settings.JWT_SECRET,
        timedelta(minutes=settings.ACCESS_TOKEN_TTL_MIN),
    )


def create_refresh_token(user_id: int, jti: str) -> str:
    return _encode(
        {"typ": "refresh", "sub": str(user_id), "jti": jti},
        settings.JWT_SECRET,
        timedelta(days=settings.REFRESH_TOKEN_TTL_DAYS),
    )


def create_public_token(vid: str) -> str:
    return _encode(
        {"typ": "public", "vid": vid},
        settings.PUBLIC_TOKEN_SECRET,
        timedelta(days=settings.PUBLIC_TOKEN_TTL_DAYS),
    )


def decode_access_token(token: str) -> dict:
    return _decode(token, settings.JWT_SECRET, "access")


def decode_refresh_token(token: str) -> dict:
    return _decode(token, settings.JWT_SECRET, "refresh")


def decode_public_token(token: str) -> dict:
    return _decode(token, settings.PUBLIC_TOKEN_SECRET, "public")


def refresh_expiry() -> datetime:
    return utcnow() + timedelta(days=settings.REFRESH_TOKEN_TTL_DAYS)
