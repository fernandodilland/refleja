"""Dependencias de FastAPI: extracción de IP/país, token público y admin."""
import jwt
from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from .database import get_db
from .models import AdminUser
from .security import decode_access_token, decode_public_token


def client_country(request: Request) -> str | None:
    """País desde el header de Cloudflare (k-anónimo). Nunca la IP."""
    c = request.headers.get("CF-IPCountry")
    if c and c not in ("XX", "T1") and len(c) == 2:
        return c.upper()
    return None


def client_ip(request: Request) -> str | None:
    """IP de conexión, usada SOLO transitoriamente para Turnstile. No se guarda."""
    return request.headers.get("CF-Connecting-IP") or (
        request.client.host if request.client else None
    )


def require_public_vid(
    x_refleja_token: str | None = Header(default=None, alias="X-Refleja-Token"),
) -> str:
    """Valida el token estadístico de 30 días y devuelve el vid pseudónimo."""
    if not x_refleja_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Falta el token estadístico.",
        )
    try:
        data = decode_public_token(x_refleja_token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expirado."
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido."
        )
    vid = data.get("vid")
    if not vid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido."
        )
    return vid


def require_admin(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> AdminUser:
    """Valida el access token del admin (Bearer) y devuelve el usuario."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No autenticado.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ", 1)[1].strip()
    try:
        data = decode_access_token(token)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión inválida o expirada.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.get(AdminUser, int(data["sub"]))
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no válido."
        )
    return user
