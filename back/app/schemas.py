"""Esquemas Pydantic para request/response."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

# --- Público: emisión de token estadístico -----------------------------------
class SessionRequest(BaseModel):
    turnstile_token: str = Field(..., min_length=1, max_length=2048)


class SessionResponse(BaseModel):
    token: str
    expires_in_days: int


# --- Público: ingesta de estadística -----------------------------------------
EventType = Literal[
    "page_view",
    "run_start",
    "answer",
    "minor",
    "municipio",
    "result",
    "urgent_click",
    "hide_click",
    "restart",
    "directory_municipio",
]


class Scores(BaseModel):
    psicologica: int = 0
    fisica: int = 0
    economica: int = 0
    patrimonial: int = 0
    sexual: int = 0
    intimidacion: int = 0


class CollectEvent(BaseModel):
    type: EventType
    run_uid: str | None = Field(default=None, max_length=36)
    question_id: str | None = Field(default=None, max_length=32)
    next_id: str | None = Field(default=None, max_length=32)
    step: int | None = Field(default=None, ge=0, le=99)
    flow_type: Literal["pareja", "fam", "trab"] | None = None
    age_bucket: str | None = Field(default=None, max_length=16)
    municipio: str | None = Field(default=None, max_length=48)
    risk_level: Literal["low", "medium", "high"] | None = None
    scores: Scores | None = None
    device: Literal["mobile", "desktop", "tablet"] | None = None


class CollectBatch(BaseModel):
    """Lote de eventos: el front acumula y envía en bloque para no gastar el
    token/Turnstile a cada rato ni perder datos. Tolera también un evento
    suelto ({"type": ...}) por compatibilidad con versiones anteriores del front."""

    events: list[CollectEvent] = Field(..., max_length=50)

    @model_validator(mode="before")
    @classmethod
    def _accept_single_event(cls, data):
        if isinstance(data, dict) and "events" not in data and "type" in data:
            return {"events": [data]}
        return data


class CollectResponse(BaseModel):
    ok: bool = True
    accepted: int = 0


# --- Auth admin --------------------------------------------------------------
class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=256)
    turnstile_token: str = Field(..., min_length=1, max_length=2048)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # segundos


class MeResponse(BaseModel):
    id: int
    username: str
    last_login_at: datetime | None = None
