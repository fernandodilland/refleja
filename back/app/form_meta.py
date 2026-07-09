"""Metadatos del cuestionario para VALIDACIÓN ESTRICTA de la estadística.

Fuente de verdad: front/src/formulario.json. Se carga al importar y se derivan:
  - VALID_QIDS: qids de pregunta permitidos (los demás strings se rechazan).
  - QID_FLOW:   qid -> flujo ("pareja" | "fam" | "trab").
Si el formulario cambia, basta redesplegar (nuevo formulario.json) y reiniciar:
la lista se reconstruye sola, sin tocar código. Si no se encuentra el archivo,
se usa un fallback con la estructura conocida.
"""
import json
from pathlib import Path

from .config import settings

# Estados de ruteo (no son preguntas) e intro.
INTRO = frozenset({"age", "start"})
TERMINALS = frozenset({"MINOR", "LOCATION", "RESULT"})
VALID_AGE_BUCKETS = frozenset({"minor", "18-25", "26-40", "41+"})
FLOWS = ("pareja", "fam", "trab")


def _flow_of_key(key: str) -> str | None:
    for f in FLOWS:
        if key.startswith(f + "_"):
            return f
    return None


def _fallback() -> tuple[set[str], dict[str, str]]:
    qids: set[str] = set(INTRO)
    flow: dict[str, str] = {}
    for f in FLOWS:
        for i in range(1, 13):
            qid = f"{f}_{i}"
            qids.add(qid)
            flow[qid] = f
    return qids, flow


def _formulario_path() -> Path:
    if settings.FORMULARIO_PATH:
        return Path(settings.FORMULARIO_PATH)
    # back/app/form_meta.py -> repo/front/src/formulario.json
    return Path(__file__).resolve().parents[2] / "front" / "src" / "formulario.json"


def _load() -> tuple[frozenset[str], dict[str, str]]:
    try:
        data = json.loads(_formulario_path().read_text(encoding="utf-8"))
        questions = data.get("questions", {})
        if not questions:
            raise ValueError("sin preguntas")
        qids: set[str] = set(INTRO)
        flow: dict[str, str] = {}
        for key, q in questions.items():
            qid = (q or {}).get("qid") or key
            qids.add(qid)
            f = _flow_of_key(key)
            if f:
                flow[qid] = f
        return frozenset(qids), flow
    except Exception:
        qids, flow = _fallback()
        return frozenset(qids), flow


VALID_QIDS, QID_FLOW = _load()
# Ids aceptados por bump_question (preguntas + estados de ruteo).
VALID_QUESTION_IDS = VALID_QIDS | TERMINALS


def qid_ok_for_flow(qid: str, flow: str | None) -> bool:
    """True si el qid puede aparecer en un run de ese flujo (o es intro/terminal)."""
    if qid in INTRO or qid in TERMINALS:
        return True
    fq = QID_FLOW.get(qid)
    if fq is None:
        return False
    return flow is None or fq == flow
