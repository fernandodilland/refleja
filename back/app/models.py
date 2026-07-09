"""Modelos ORM. Reflejan exactamente el esquema de seed.sql (MariaDB 11).

Diseño de privacidad:
  - Nunca se almacena la IP.
  - La identidad de visitante es un id aleatorio de 128 bits (vid) generado al
    emitir el token; en la BD solo vive su HMAC-SHA256 (pseudónimo, irreversible).
  - La geografía es solo país (CF-IPCountry), k-anónimo.
  - Se guarda 1 fila por intento de formulario + contadores agregados: pocos
    datos, embudo completo.
Todas las tablas llevan created_at y updated_at.
"""
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

# BIGINT en MariaDB; INTEGER en SQLite (necesario para el AUTOINCREMENT del rowid).
BigIntPK = BigInteger().with_variant(Integer, "sqlite")


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class AdminUser(TimestampMixin, Base):
    __tablename__ = "admin_user"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    sessions: Mapped[list["AdminSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class AdminSession(TimestampMixin, Base):
    """Refresh tokens del admin (rotables y revocables)."""

    __tablename__ = "admin_session"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    admin_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("admin_user.id", ondelete="CASCADE"), nullable=False
    )
    refresh_jti: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    user_agent_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["AdminUser"] = relationship(back_populates="sessions")


class Visitor(TimestampMixin, Base):
    """Visitante pseudónimo: 1 por token estadístico de 30 días."""

    __tablename__ = "visitor"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    vid_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    country: Mapped[str | None] = mapped_column(String(2), nullable=True)
    device: Mapped[str | None] = mapped_column(String(16), nullable=True)
    page_views: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )


class FormRun(TimestampMixin, Base):
    """1 fila por intento de cuestionario. Fuente del embudo/flujo/drop-off."""

    __tablename__ = "form_run"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    run_uid: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    visitor_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("visitor.id", ondelete="SET NULL"), nullable=True
    )
    age_bucket: Mapped[str | None] = mapped_column(String(16), nullable=True)
    flow_type: Mapped[str | None] = mapped_column(String(8), nullable=True)
    started: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    max_step: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    last_question_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    municipio: Mapped[str | None] = mapped_column(String(48), nullable=True)
    risk_level: Mapped[str | None] = mapped_column(String(8), nullable=True)

    score_psicologica: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    score_fisica: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    score_economica: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    score_patrimonial: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    score_sexual: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    score_intimidacion: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)


class QuestionStat(TimestampMixin, Base):
    """Contador agregado por pregunta: alcanzadas vs respondidas (embudo)."""

    __tablename__ = "question_stat"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    question_id: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    reached_count: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    answered_count: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)


class DailyMetric(TimestampMixin, Base):
    """Rollup diario para series de tiempo."""

    __tablename__ = "daily_metric"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    metric_date: Mapped[date] = mapped_column(Date, unique=True, nullable=False)
    page_views: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    form_starts: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    form_completes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    minors: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    new_visitors: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
