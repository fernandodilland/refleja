"""Endpoints públicos.

Solo DOS rutas alcanzables sin sesión admin:
  - POST /api/public/session : único endpoint sin token. Valida el Turnstile
    invisible y emite el token estadístico de 30 días.
  - POST /api/public/collect : requiere el token estadístico en el header
    X-Refleja-Token. Ingiere eventos y actualiza agregados.
"""
import threading
import time
from collections import OrderedDict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .. import analytics
from ..config import settings
from ..database import get_db
from ..deps import client_country, client_ip, require_public_vid
from ..schemas import (
    CollectBatch,
    CollectEvent,
    CollectResponse,
    SessionRequest,
    SessionResponse,
)
from ..security import create_public_token, hmac_vid, new_vid
from ..turnstile import verify_invisible_turnstile

router = APIRouter(prefix="/public", tags=["public"])

# Rate-limit en memoria, best-effort y por-proceso (ventana deslizante de 60s).
# Acotado con LRU para no crecer sin límite y protegido con lock (los endpoints
# corren en el threadpool). Para varios workers, es un límite por worker: si se
# necesita exactitud global, mover a Redis (INCR+EXPIRE).
_RATE_LOCK = threading.Lock()
_RATE: "OrderedDict[str, list[float]]" = OrderedDict()
_RATE_MAX_KEYS = 50_000


def _rate_ok(key: str, limit: int) -> bool:
    now = time.time()
    cutoff = now - 60
    with _RATE_LOCK:
        window = _RATE.get(key)
        if window is None:
            window = []
            _RATE[key] = window
        else:
            _RATE.move_to_end(key)  # LRU
        window[:] = [t for t in window if t > cutoff]
        allowed = len(window) < limit
        if allowed:
            window.append(now)
        # Cota de memoria: descarta las claves menos usadas.
        while len(_RATE) > _RATE_MAX_KEYS:
            _RATE.popitem(last=False)
        return allowed


@router.post("/session", response_model=SessionResponse)
def create_session(
    body: SessionRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> SessionResponse:
    """Valida el Turnstile invisible y emite el token estadístico (30 días)."""
    # Límite por IP: evita emisión masiva de tokens/visitantes aunque se resuelva
    # el Turnstile en bucle.
    ip = client_ip(request) or "unknown"
    if not _rate_ok("sess:" + ip, settings.SESSION_RATE_PER_MIN):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiadas solicitudes.",
        )

    ok = verify_invisible_turnstile(body.turnstile_token, ip)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verificación anti-bot fallida.",
        )

    vid = new_vid()
    vid_h = hmac_vid(vid)
    device = analytics.device_from_ua(request.headers.get("user-agent"))
    country = client_country(request)

    _, created = analytics.get_or_create_visitor(db, vid_h, country, device)
    if created:
        analytics.bump_daily(db, new_visitors=1)
    db.commit()

    token = create_public_token(vid)
    return SessionResponse(token=token, expires_in_days=settings.PUBLIC_TOKEN_TTL_DAYS)


class _Quota:
    """Cuotas de por vida del visitante (anti-abuso). Se comprueba contra el
    valor cargado al inicio del lote + lo acumulado dentro del lote."""

    __slots__ = ("_events", "_runs", "_completions",
                 "d_events", "d_runs", "d_completions", "d_page_views")

    def __init__(self, visitor) -> None:
        self._events = visitor.events_count
        self._runs = visitor.run_count
        self._completions = visitor.completed_count
        self.d_events = self.d_runs = self.d_completions = self.d_page_views = 0

    def events_left(self) -> bool:
        return (self._events + self.d_events) < settings.PUBLIC_MAX_EVENTS

    def can_create_run(self) -> bool:
        return (self._runs + self.d_runs) < settings.PUBLIC_MAX_RUNS

    def can_complete(self) -> bool:
        return (self._completions + self.d_completions) < settings.PUBLIC_MAX_COMPLETIONS


def _run_for(db: Session, event: CollectEvent, visitor_id: int, q: _Quota):
    """Run del evento; lo crea si hace falta y la cuota de runs lo permite.
    Devuelve None si no hay run_uid o se alcanzó la cuota de runs."""
    if not event.run_uid:
        return None
    run = analytics.get_run(db, event.run_uid)
    if run is None:
        if not q.can_create_run():
            return None
        run = analytics.create_run(db, event.run_uid, visitor_id)
        q.d_runs += 1
    return run


def _process_event(
    db: Session, event: CollectEvent, vid_h: str, visitor_id: int, q: _Quota
) -> None:
    et = event.type

    # Eventos globales (no ligados a un run del formulario).
    if et == "page_view":
        q.d_page_views += 1
        analytics.bump_daily(db, page_views=1)
        return
    if et == "urgent_click":
        analytics.bump_counter(db, "urgent_click")
        return
    if et == "hide_click":
        analytics.bump_counter(db, "hide_click")
        return
    if et == "restart":
        analytics.bump_counter(db, "restart")
        return
    if et == "directory_municipio":
        muni = analytics.normalize_municipio(event.municipio)
        if muni:
            analytics.bump_counter(db, "dir_muni:" + muni)
        return

    # Eventos del formulario: requieren un run (acotado por la cuota de runs).
    run = _run_for(db, event, visitor_id, q)
    if run is None:
        return

    if et == "run_start":
        first_start = not run.started
        run.started = True
        if run.max_step < 1:
            run.max_step = 1
        run.last_question_id = "age"
        if first_start:
            analytics.bump_question(db, "age", reached=1)

    elif et == "answer":
        if event.question_id:
            analytics.bump_question(db, event.question_id, answered=1)
        if event.next_id:
            analytics.bump_question(db, event.next_id, reached=1)
        run.started = True
        if event.flow_type:
            if run.flow_type is None and not run.completed:
                analytics.bump_daily(db, form_starts=1)
            run.flow_type = event.flow_type
        if event.age_bucket:
            run.age_bucket = event.age_bucket
        if event.step is not None and event.step > run.max_step:
            run.max_step = event.step
        run.last_question_id = event.next_id or event.question_id

    elif et == "minor":
        # Menor de edad: cuenta como COMPLETADO (aunque sin preguntas).
        run.started = True
        run.age_bucket = "minor"
        run.last_question_id = "MINOR"
        analytics.bump_daily(db, minors=1)
        if not run.completed and q.can_complete():
            run.completed = True
            q.d_completions += 1
            analytics.bump_daily(db, form_completes=1)

    elif et == "municipio":
        muni = analytics.normalize_municipio(event.municipio)
        if muni:
            run.municipio = muni
            run.last_question_id = "LOCATION"

    elif et == "result":
        run.started = True
        run.last_question_id = "RESULT"
        if event.risk_level:
            run.risk_level = event.risk_level
        muni = analytics.normalize_municipio(event.municipio)
        if muni:
            run.municipio = muni
        if event.scores:
            s = event.scores
            run.score_psicologica = s.psicologica
            run.score_fisica = s.fisica
            run.score_economica = s.economica
            run.score_patrimonial = s.patrimonial
            run.score_sexual = s.sexual
            run.score_intimidacion = s.intimidacion
        # Solo cuenta como completado si no lo estaba y hay cuota disponible.
        if not run.completed and q.can_complete():
            run.completed = True
            q.d_completions += 1
            analytics.bump_daily(db, form_completes=1)


@router.post("/collect", response_model=CollectResponse)
def collect(
    batch: CollectBatch,
    request: Request,
    vid: str = Depends(require_public_vid),
    db: Session = Depends(get_db),
) -> CollectResponse:
    """Ingesta de un LOTE de eventos. Requiere token en X-Refleja-Token."""
    vid_h = hmac_vid(vid)
    if not _rate_ok("coll:" + vid_h, settings.COLLECT_RATE_PER_MIN):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiadas peticiones.",
        )

    country = client_country(request)
    device = analytics.device_from_ua(request.headers.get("user-agent"))
    for ev in batch.events:
        if ev.device:
            device = ev.device
            break
    visitor, _ = analytics.get_or_create_visitor(db, vid_h, country, device)

    q = _Quota(visitor)
    accepted = 0
    for event in batch.events:
        if not q.events_left():
            break  # cuota de por vida alcanzada: se ignora el resto
        _process_event(db, event, vid_h, visitor.id, q)
        q.d_events += 1
        accepted += 1

    # Persiste cuotas (incrementos atómicos) + last_seen en un solo UPDATE.
    analytics.bump_visitor_quota(
        db, vid_h, events=q.d_events, runs=q.d_runs,
        completions=q.d_completions, page_views=q.d_page_views,
    )
    db.commit()
    return CollectResponse(ok=True, accepted=accepted)
