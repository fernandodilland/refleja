"""Endpoints del panel /plataforma (solo admin).

Todo se deriva de 6 tablas minimalistas. Soporta filtros por rango de fechas,
tipo de flujo y municipio donde aplica.
"""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_admin
from ..models import AdminLogin, DailyMetric, FormRun, QuestionStat, Visitor
from ..security import utcnow

router = APIRouter(
    prefix="/platform", tags=["platform"], dependencies=[Depends(require_admin)]
)

SCORE_COLS = {
    "psicologica": FormRun.score_psicologica,
    "fisica": FormRun.score_fisica,
    "economica": FormRun.score_economica,
    "patrimonial": FormRun.score_patrimonial,
    "sexual": FormRun.score_sexual,
    "intimidacion": FormRun.score_intimidacion,
}

# Orden canónico del cuestionario para el embudo.
FLOW_ORDER = {
    "pareja": [f"pareja_{i}" for i in range(1, 13)],
    "fam": [f"fam_{i}" for i in range(1, 13)],
    "trab": [f"trab_{i}" for i in range(1, 13)],
}


def _run_filters(stmt, date_from, date_to, flow_type, municipio):
    if date_from:
        stmt = stmt.where(FormRun.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        stmt = stmt.where(FormRun.created_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time()))
    if flow_type:
        stmt = stmt.where(FormRun.flow_type == flow_type)
    if municipio:
        stmt = stmt.where(FormRun.municipio == municipio)
    return stmt


@router.get("/overview")
def overview(
    db: Session = Depends(get_db),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    flow_type: str | None = Query(default=None),
    municipio: str | None = Query(default=None),
) -> dict:
    def count(stmt):
        return db.execute(stmt).scalar_one() or 0

    total_visitors = count(select(func.count(Visitor.id)))
    active_now = count(
        select(func.count(Visitor.id)).where(
            Visitor.last_seen_at >= utcnow() - timedelta(seconds=60)
        )
    )

    base = select(func.count(FormRun.id))
    total_runs = count(_run_filters(base, date_from, date_to, flow_type, municipio))
    started = count(
        _run_filters(
            select(func.count(FormRun.id)).where(FormRun.started.is_(True)),
            date_from, date_to, flow_type, municipio,
        )
    )
    completed = count(
        _run_filters(
            select(func.count(FormRun.id)).where(FormRun.completed.is_(True)),
            date_from, date_to, flow_type, municipio,
        )
    )
    minors = count(
        _run_filters(
            select(func.count(FormRun.id)).where(FormRun.age_bucket == "minor"),
            date_from, date_to, flow_type, municipio,
        )
    )
    # Visitantes que entraron pero no empezaron formulario.
    started_visitors = count(
        select(func.count(func.distinct(FormRun.visitor_id))).where(
            FormRun.started.is_(True), FormRun.visitor_id.is_not(None)
        )
    )
    entered_not_started = max(total_visitors - started_visitors, 0)

    return {
        "total_visitors": total_visitors,
        "active_now": active_now,
        "total_runs": total_runs,
        "started": started,
        "completed": completed,
        "minors": minors,
        "entered_not_started": entered_not_started,
        # % de intentos empezados que se completan.
        "completion_rate": round(completed / started, 4) if started else 0.0,
        # % de visitantes que empiezan el formulario (por visitante único).
        "start_rate": round(started_visitors / total_visitors, 4) if total_visitors else 0.0,
    }


@router.get("/realtime")
def realtime(
    db: Session = Depends(get_db),
    window_seconds: int = Query(default=60, ge=5, le=900),
    limit: int = Query(default=20, ge=1, le=100),
) -> dict:
    now = utcnow()
    cutoff = now - timedelta(seconds=window_seconds)

    active_visitors = db.execute(
        select(func.count(Visitor.id)).where(Visitor.last_seen_at >= cutoff)
    ).scalar_one() or 0

    by_device = dict(
        db.execute(
            select(Visitor.device, func.count(Visitor.id))
            .where(Visitor.last_seen_at >= cutoff)
            .group_by(Visitor.device)
        ).all()
    )
    by_country = dict(
        db.execute(
            select(Visitor.country, func.count(Visitor.id))
            .where(Visitor.last_seen_at >= cutoff)
            .group_by(Visitor.country)
        ).all()
    )

    recent = db.execute(
        select(FormRun).order_by(FormRun.updated_at.desc()).limit(limit)
    ).scalars().all()

    def secs_ago(dt: datetime) -> int:
        return max(int((now - dt).total_seconds()), 0)

    recent_runs = [
        {
            "flow_type": r.flow_type,
            "age_bucket": r.age_bucket,
            "last_question_id": r.last_question_id,
            "max_step": r.max_step,
            "municipio": r.municipio,
            "started": r.started,
            "completed": r.completed,
            "risk_level": r.risk_level,
            "seconds_ago": secs_ago(r.updated_at),
        }
        for r in recent
    ]

    return {
        "window_seconds": window_seconds,
        "active_visitors": active_visitors,
        "by_device": by_device,
        "by_country": by_country,
        "recent_runs": recent_runs,
    }


@router.get("/funnel")
def funnel(db: Session = Depends(get_db)) -> dict:
    rows = {
        q: {"reached": rc, "answered": ac}
        for q, rc, ac in db.execute(
            select(
                QuestionStat.question_id,
                QuestionStat.reached_count,
                QuestionStat.answered_count,
            )
        ).all()
    }

    def step(qid: str) -> dict:
        s = rows.get(qid, {"reached": 0, "answered": 0})
        reached, answered = s["reached"], s["answered"]
        drop = max(reached - answered, 0)
        return {
            "question_id": qid,
            "reached": reached,
            "answered": answered,
            "drop": drop,
            "drop_rate": round(drop / reached, 4) if reached else 0.0,
        }

    flows = {
        name: [step(qid) for qid in order] for name, order in FLOW_ORDER.items()
    }
    intro = [step("age"), step("start")]

    # Preguntas más "frecuentes" (más alcanzadas).
    top = sorted(
        (step(q) for q in rows),
        key=lambda x: x["reached"],
        reverse=True,
    )[:10]

    return {"intro": intro, "flows": flows, "top_reached": top}


@router.get("/violence")
def violence(
    db: Session = Depends(get_db),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    flow_type: str | None = Query(default=None),
    municipio: str | None = Query(default=None),
) -> dict:
    # Suma total de puntajes por tipo (solo formularios completados).
    totals = {}
    dominant = {k: 0 for k in SCORE_COLS}
    present = {k: 0 for k in SCORE_COLS}

    sum_cols = [func.coalesce(func.sum(col), 0).label(k) for k, col in SCORE_COLS.items()]
    stmt = _run_filters(
        select(*sum_cols).where(FormRun.completed.is_(True)),
        date_from, date_to, flow_type, municipio,
    )
    row = db.execute(stmt).one()
    for k in SCORE_COLS:
        totals[k] = int(getattr(row, k) or 0)

    # Presencia y dominancia por formulario completado.
    runs = db.execute(
        _run_filters(
            select(*SCORE_COLS.values()).where(FormRun.completed.is_(True)),
            date_from, date_to, flow_type, municipio,
        )
    ).all()
    for r in runs:
        vals = {k: (r[i] or 0) for i, k in enumerate(SCORE_COLS)}
        for k, v in vals.items():
            if v > 0:
                present[k] += 1
        top = max(vals.values())
        if top > 0:
            for k, v in vals.items():
                if v == top:
                    dominant[k] += 1
                    break

    return {
        "totals": totals,
        "present": present,
        "dominant": dominant,
        "completed_runs": len(runs),
    }


@router.get("/municipios")
def municipios(
    db: Session = Depends(get_db),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    flow_type: str | None = Query(default=None),
    limit: int = Query(default=60, ge=1, le=100),
) -> dict:
    stmt = _run_filters(
        select(FormRun.municipio, func.count(FormRun.id).label("n")).where(
            FormRun.municipio.is_not(None)
        ),
        date_from, date_to, flow_type, None,
    ).group_by(FormRun.municipio).order_by(func.count(FormRun.id).desc()).limit(limit)

    items = [{"municipio": m, "count": n} for m, n in db.execute(stmt).all()]
    return {"items": items}


@router.get("/logins")
def logins(
    db: Session = Depends(get_db),
    limit: int = Query(default=100, ge=1, le=500),
) -> dict:
    rows = db.execute(
        select(AdminLogin).order_by(AdminLogin.created_at.desc()).limit(limit)
    ).scalars().all()
    return {
        "items": [
            {
                "username": r.username,
                "browser": r.browser,
                "os": r.os,
                "device": r.device,
                "country": r.country,
                "user_agent": r.user_agent,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ]
    }


@router.get("/timeseries")
def timeseries(
    db: Session = Depends(get_db),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
) -> dict:
    stmt = select(DailyMetric).order_by(DailyMetric.metric_date.asc())
    if date_from:
        stmt = stmt.where(DailyMetric.metric_date >= date_from)
    if date_to:
        stmt = stmt.where(DailyMetric.metric_date <= date_to)
    rows = db.execute(stmt).scalars().all()
    return {
        "items": [
            {
                "date": r.metric_date.isoformat(),
                "page_views": r.page_views,
                "form_starts": r.form_starts,
                "form_completes": r.form_completes,
                "minors": r.minors,
                "new_visitors": r.new_visitors,
            }
            for r in rows
        ]
    }
