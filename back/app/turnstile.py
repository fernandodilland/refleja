"""Verificación de Cloudflare Turnstile (server-side siteverify).

Síncrono a propósito: los endpoints corren en el threadpool de FastAPI (def),
así que una llamada HTTP bloqueante no afecta al event loop.
"""
import httpx

from .config import settings


def verify_turnstile(token: str | None, secret: str, remote_ip: str | None = None) -> bool:
    """Valida un token de Turnstile contra Cloudflare.

    En desarrollo, si DEV_BYPASS_TURNSTILE está activo, acepta el token mágico
    "dev-bypass" para poder probar sin resolver el widget. Nunca en producción.
    """
    if settings.bypass_turnstile and token == "dev-bypass":
        return True

    if not token or not secret:
        return False

    data = {"secret": secret, "response": token}
    if remote_ip:
        data["remoteip"] = remote_ip

    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.post(settings.TURNSTILE_VERIFY_URL, data=data)
        resp.raise_for_status()
        payload = resp.json()
        return bool(payload.get("success"))
    except Exception:
        return False


def verify_login_turnstile(token: str | None, remote_ip: str | None = None) -> bool:
    return verify_turnstile(token, settings.TURNSTILE_SECRET_LOGIN, remote_ip)


def verify_invisible_turnstile(token: str | None, remote_ip: str | None = None) -> bool:
    return verify_turnstile(token, settings.TURNSTILE_SECRET_INVISIBLE, remote_ip)
