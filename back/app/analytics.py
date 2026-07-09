"""Lógica de agregación estadística: upserts atómicos y portables.

Estrategia "pocos datos, mucha señal":
  - Contadores agregados (question_stat, daily_metric): incrementos atómicos a
    nivel SQL (x = x + n).
  - 1 fila por intento de formulario (form_run): se crea y luego se actualiza.
  - 1 fila por visitante pseudónimo (visitor).
Compatible con SQLite (dev) y MariaDB (prod) sin dialecto específico.
"""
import re
from datetime import date, datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .form_meta import VALID_QUESTION_IDS  # allowlist de qids (fuente: formulario.json)
from .models import DailyMetric, EventCounter, FormRun, QuestionStat, Visitor
from .security import utcnow

_MOBILE_RE = re.compile(r"Mobi|Android|iPhone|iPod", re.I)
_TABLET_RE = re.compile(r"iPad|Tablet", re.I)


_MUNI_RE = re.compile(r"[^a-z0-9-]+")

# Municipios de Nuevo León (+ "otro"). Solo estos slugs se aceptan, para que la
# tabla de contadores no crezca con valores basura enviados por un bot.
VALID_MUNICIPIOS = frozenset({
    "abasolo", "agualeguas", "los-aldamas", "allende", "anahuac", "apodaca",
    "aramberri", "bustamante", "cadereyta-jimenez", "el-carmen", "cerralvo",
    "cienega-de-flores", "china", "doctor-arroyo", "doctor-coss",
    "doctor-gonzalez", "galeana", "garcia", "san-pedro-garza-garcia",
    "general-bravo", "general-escobedo", "general-teran", "general-trevino",
    "general-zaragoza", "general-zuazua", "guadalupe", "los-herreras",
    "higueras", "hualahuises", "iturbide", "juarez", "lampazos-de-naranjo",
    "linares", "marin", "melchor-ocampo", "mier-y-noriega", "mina",
    "montemorelos", "monterrey", "paras", "pesqueria", "los-ramones", "rayones",
    "sabinas-hidalgo", "salinas-victoria", "san-nicolas-de-los-garza", "hidalgo",
    "santa-catarina", "santiago", "vallecillo", "villaldama", "otro",
})


def normalize_municipio(value: str | None) -> str | None:
    """Normaliza a slug y valida contra la lista real. None si no es válido."""
    if not value:
        return None
    s = value.strip().lower().replace(" ", "-")
    s = _MUNI_RE.sub("", s)[:48].strip("-")
    return s if s in VALID_MUNICIPIOS else None


def device_from_ua(ua: str | None) -> str:
    if not ua:
        return "desktop"
    if _TABLET_RE.search(ua):
        return "tablet"
    if _MOBILE_RE.search(ua):
        return "mobile"
    return "desktop"


def browser_from_ua(ua: str | None) -> str | None:
    if not ua:
        return None
    if "Edg" in ua:
        return "Edge"
    if "OPR" in ua or "Opera" in ua:
        return "Opera"
    if "Chrome" in ua and "Chromium" not in ua:
        return "Chrome"
    if "Firefox" in ua:
        return "Firefox"
    if "Safari" in ua:
        return "Safari"
    return "Otro"


def os_from_ua(ua: str | None) -> str | None:
    if not ua:
        return None
    if "Windows" in ua:
        return "Windows"
    if "iPhone" in ua or "iPad" in ua or "iOS" in ua:
        return "iOS"
    if "Mac OS X" in ua or "Macintosh" in ua:
        return "macOS"
    if "Android" in ua:
        return "Android"
    if "Linux" in ua:
        return "Linux"
    return "Otro"


def _today() -> date:
    return datetime.now(timezone.utc).date()


# --- Visitante --------------------------------------------------------------
def get_or_create_visitor(
    db: Session, vid_hash: str, country: str | None, device: str | None
) -> tuple[Visitor, bool]:
    v = db.execute(
        select(Visitor).where(Visitor.vid_hash == vid_hash)
    ).scalar_one_or_none()
    if v:
        return v, False
    try:
        with db.begin_nested():
            v = Visitor(
                vid_hash=vid_hash,
                country=country,
                device=device,
                page_views=0,
                last_seen_at=utcnow(),
            )
            db.add(v)
        return v, True
    except IntegrityError:
        v = db.execute(
            select(Visitor).where(Visitor.vid_hash == vid_hash)
        ).scalar_one()
        return v, False


def touch_visitor(db: Session, vid_hash: str, add_page_view: bool = False) -> None:
    values = {"last_seen_at": utcnow()}
    if add_page_view:
        values["page_views"] = Visitor.page_views + 1
    db.execute(update(Visitor).where(Visitor.vid_hash == vid_hash).values(**values))


def bump_visitor_quota(
    db: Session, vid_hash: str, events: int = 0, runs: int = 0,
    completions: int = 0, page_views: int = 0, actions: int = 0,
) -> None:
    """Persiste (incrementos atómicos) las cuotas del visitante + last_seen."""
    db.execute(
        update(Visitor)
        .where(Visitor.vid_hash == vid_hash)
        .values(
            events_count=Visitor.events_count + events,
            run_count=Visitor.run_count + runs,
            completed_count=Visitor.completed_count + completions,
            action_count=Visitor.action_count + actions,
            page_views=Visitor.page_views + page_views,
            last_seen_at=utcnow(),
        )
    )


# --- Contadores por pregunta -----------------------------------------------
def _ensure_question(db: Session, qid: str) -> None:
    exists = db.execute(
        select(QuestionStat.id).where(QuestionStat.question_id == qid)
    ).first()
    if exists:
        return
    try:
        with db.begin_nested():
            db.add(QuestionStat(question_id=qid, reached_count=0, answered_count=0))
    except IntegrityError:
        pass


def bump_question(db: Session, qid: str, reached: int = 0, answered: int = 0) -> None:
    if qid not in VALID_QUESTION_IDS or (reached == 0 and answered == 0):
        return
    _ensure_question(db, qid)
    db.execute(
        update(QuestionStat)
        .where(QuestionStat.question_id == qid)
        .values(
            reached_count=QuestionStat.reached_count + reached,
            answered_count=QuestionStat.answered_count + answered,
        )
    )


# --- Contadores con nombre (urgente/ocultar/reinicio/directorio) -----------
def _ensure_counter(db: Session, name: str) -> None:
    exists = db.execute(
        select(EventCounter.id).where(EventCounter.name == name)
    ).first()
    if exists:
        return
    try:
        with db.begin_nested():
            db.add(EventCounter(name=name, count=0))
    except IntegrityError:
        pass


def bump_counter(db: Session, name: str, n: int = 1) -> None:
    if not name or n == 0:
        return
    name = name[:64]
    _ensure_counter(db, name)
    db.execute(
        update(EventCounter)
        .where(EventCounter.name == name)
        .values(count=EventCounter.count + n)
    )


# --- Rollup diario ----------------------------------------------------------
def _ensure_daily(db: Session, d: date) -> None:
    exists = db.execute(
        select(DailyMetric.id).where(DailyMetric.metric_date == d)
    ).first()
    if exists:
        return
    try:
        with db.begin_nested():
            db.add(DailyMetric(metric_date=d))
    except IntegrityError:
        pass


def bump_daily(db: Session, **deltas: int) -> None:
    deltas = {k: v for k, v in deltas.items() if v}
    if not deltas:
        return
    d = _today()
    _ensure_daily(db, d)
    col_expr = {
        k: getattr(DailyMetric, k) + v for k, v in deltas.items()
    }
    db.execute(
        update(DailyMetric).where(DailyMetric.metric_date == d).values(**col_expr)
    )


# --- Intento de formulario --------------------------------------------------
def get_run(db: Session, run_uid: str) -> FormRun | None:
    return db.execute(
        select(FormRun).where(FormRun.run_uid == run_uid)
    ).scalar_one_or_none()


def create_run(db: Session, run_uid: str, visitor_id: int | None) -> FormRun:
    try:
        with db.begin_nested():
            run = FormRun(run_uid=run_uid, visitor_id=visitor_id)
            db.add(run)
        return run
    except IntegrityError:
        return db.execute(
            select(FormRun).where(FormRun.run_uid == run_uid)
        ).scalar_one()


def get_or_create_run(db: Session, run_uid: str, visitor_id: int | None) -> FormRun:
    run = get_run(db, run_uid)
    return run if run else create_run(db, run_uid, visitor_id)
