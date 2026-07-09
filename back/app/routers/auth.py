"""Autenticación del administrador (/acceso).

Flujo: usuario + contraseña (Argon2id) + Turnstile managed -> access token
(15 min, en memoria en el front) + refresh token (cookie httpOnly, rotable).
"""
import logging

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import client_ip, require_admin
from ..models import AdminSession, AdminUser
from ..schemas import LoginRequest, MeResponse, TokenResponse
from ..security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    needs_rehash,
    new_jti,
    refresh_expiry,
    sha256_hex,
    utcnow,
    verify_password,
)
from ..turnstile import verify_login_turnstile

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger("refleja.auth")

# Hash señuelo para igualar el tiempo de respuesta cuando el usuario no existe
# o está inactivo (evita el oráculo de timing por enumeración).
_DUMMY_HASH = hash_password("refleja-timing-dummy-not-a-real-password")


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=token,
        max_age=settings.REFRESH_TOKEN_TTL_DAYS * 86400,
        httponly=True,
        # Secure siempre en producción, aunque no se haya configurado.
        secure=settings.COOKIE_SECURE or settings.is_prod,
        samesite=settings.COOKIE_SAMESITE,
        domain=settings.COOKIE_DOMAIN or None,
        path="/api/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        domain=settings.COOKIE_DOMAIN or None,
        path="/api/auth",
    )


def _issue_session(
    db: Session, user: AdminUser, response: Response, request: Request
) -> str:
    """Crea una sesión (refresh) y devuelve el access token."""
    jti = new_jti()
    refresh = create_refresh_token(user.id, jti)
    ua = request.headers.get("user-agent")
    db.add(
        AdminSession(
            admin_user_id=user.id,
            refresh_jti=jti,
            token_hash=sha256_hex(refresh),
            user_agent_hash=sha256_hex(ua) if ua else None,
            expires_at=refresh_expiry(),
        )
    )
    _set_refresh_cookie(response, refresh)
    return create_access_token(user.id, user.username)


@router.post("/login", response_model=TokenResponse)
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> TokenResponse:
    if not verify_login_turnstile(body.turnstile_token, client_ip(request)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verificación anti-bot fallida.",
        )

    user = db.execute(
        select(AdminUser).where(AdminUser.username == body.username)
    ).scalar_one_or_none()

    # Siempre se ejecuta un Argon2 verify (contra el hash real o el señuelo) para
    # que el tiempo de respuesta no revele si el usuario existe/está activo.
    if user and user.is_active:
        valid = verify_password(user.password_hash, body.password)
    else:
        verify_password(_DUMMY_HASH, body.password)
        valid = False

    if not valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos.",
        )

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
    user.last_login_at = utcnow()

    access = _issue_session(db, user, response, request)
    db.commit()
    return TokenResponse(access_token=access, expires_in=settings.ACCESS_TOKEN_TTL_MIN * 60)


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> TokenResponse:
    cookie = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if not cookie:
        raise HTTPException(status_code=401, detail="Sin sesión.")
    try:
        data = decode_refresh_token(cookie)
    except jwt.PyJWTError:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Sesión inválida.")

    sess = db.execute(
        select(AdminSession).where(AdminSession.refresh_jti == data.get("jti"))
    ).scalar_one_or_none()

    now = utcnow()
    cookie_hash = sha256_hex(cookie)

    if not sess or sess.token_hash != cookie_hash:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Sesión inválida.")

    # Reuso de un refresh YA rotado (token válido pero revocado) => posible robo.
    # Se invalida toda la familia de sesiones del administrador.
    if sess.revoked_at is not None:
        db.execute(
            update(AdminSession)
            .where(
                AdminSession.admin_user_id == sess.admin_user_id,
                AdminSession.revoked_at.is_(None),
            )
            .values(revoked_at=now)
        )
        db.commit()
        log.warning(
            "Reuso de refresh token detectado (admin_user_id=%s). "
            "Familia de sesiones revocada.",
            sess.admin_user_id,
        )
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Sesión revocada por seguridad.")

    if sess.expires_at < now:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Sesión expirada.")

    user = db.get(AdminUser, sess.admin_user_id)
    if not user or not user.is_active:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Usuario no válido.")

    # Rotación: se revoca la sesión actual y se emite una nueva.
    sess.revoked_at = now
    access = _issue_session(db, user, response, request)
    db.commit()
    return TokenResponse(access_token=access, expires_in=settings.ACCESS_TOKEN_TTL_MIN * 60)


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> dict:
    cookie = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if cookie:
        try:
            data = decode_refresh_token(cookie)
            sess = db.execute(
                select(AdminSession).where(AdminSession.refresh_jti == data.get("jti"))
            ).scalar_one_or_none()
            if sess and sess.revoked_at is None:
                sess.revoked_at = utcnow()
                db.commit()
        except jwt.PyJWTError:
            pass
    _clear_refresh_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=MeResponse)
def me(user: AdminUser = Depends(require_admin)) -> MeResponse:
    return MeResponse(id=user.id, username=user.username, last_login_at=user.last_login_at)
