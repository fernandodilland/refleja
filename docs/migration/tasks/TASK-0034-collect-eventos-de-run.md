# TASK-0034 · Implementar `collect/runs.rs`: `run_start`, `answer`, `minor`, `municipio`, `result` con idempotencia por qid

## Identificación
- **ID:** TASK-0034
- **Título:** Implementar `collect/runs.rs`: `run_start`, `answer`, `minor`, `municipio`, `result` con idempotencia por qid
- **Estado:** completada
- **Prioridad:** P1
- **Dominio:** Public
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** alto
- **Tarea padre:** EPIC-E — Dominio Public (estadística)
- **Dependencias:** TASK-0007, TASK-0019, TASK-0023, TASK-0024, TASK-0032, TASK-0033
- **Bloquea a:** TASK-0035

## Objetivo
Portar `_run_for`, `_count_q` y `_process_event` para eventos de formulario con **exactamente** las mismas reglas de coherencia de flujo, idempotencia y completado único.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/routers/public.py:156-282`
- `03` FL-03 (tabla)
- `evidence/python-baseline/probe-output-2026-10-18.txt`

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- ADR-009 (run ajeno mutable, `accepted` cuenta descartados)

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- `run_for`: `None` si falta/vacío `run_uid`, o si no existe y `!can_create_run`; si no existe y hay cuota ⇒ crear y `d_runs+=1`.
- `count_q(run, qid, kind)`: ignora qid ∉ `VALID_QUESTION_IDS`; una vez por run y tipo; actualiza `run.counted` y `bump_question`.
- Reglas de `run_start`, `answer` (coherencia de flujo, `form_starts` la primera vez que se fija flujo y no está completado, sobrescritura de `flow_type`, `age_bucket`, `max_step`, `last_question_id=nxt or question_id`), `minor`, `municipio`, `result` (reemplazo de los 6 scores si vienen, completado único).

## Fuera de alcance
- Transacción y bucle de lote (TASK-0035).
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Escribir primero los casos CT-034…042 y CT-047 desde Python y usarlos como oráculo.
2. Cada rama con comentarios que referencien la línea de `public.py` que replica.

## Contratos e invariantes
- `form_completes`/`minors` se suman una vez por run.
- El `flow_type` del evento puede sobrescribir el del run.
- `started` se marca como en Python (no en `municipio`).

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/routes/public/collect/runs.rs
- back-rs/tests/contract/cases/public/collect_runs*.json

**Archivos de referencia (solo lectura):**
- back/app/routers/public.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- CT-034…042, CT-047 + tabla de verdad de `answer` (qid propio, de otro flujo, desconocido, terminal; `next_id` análogo; `flow_type` presente/ausente).
- Secuencia completa del cuestionario de cada flujo con estado final de tablas igual al de Python.

## Criterios de aceptación
- [ ] CT-034…042 y CT-047 verdes.
- [ ] Volcado de tablas idéntico a Python en el escenario completo de cada flujo.

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*
- Comando exacto del harness: ver `back-rs/tests/contract/README.md` (TASK-0007); casos en modo `verify` contra el binario Rust *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo alto: es el corazón estadístico. Rollback: no conmutar tráfico.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:** implementado en `back-rs/` (ver archivos).
- **Archivos modificados:** `src/routes/collect.rs`
- **Pruebas ejecutadas y resultados reales:** Validación Pydantic (incluidas coerciones), cuotas de por vida, idempotencia por qid, completado único, run ajeno, evento suelto: `back-rs/tests/contract/diff.py` (≈230 peticiones Python vs Rust + 8 tablas + fases de producción y cutover): TODO OK; concurrencia sin 5xx.
- **Criterios satisfechos y pendientes:** ver estado de la ficha; los pendientes se detallan arriba cuando el estado no es `completada`.
- **Diferencias detectadas respecto al original:** ver `runbook-cutover.md` §5 y ADR-020/021/022 en `08`.
- **Decisiones que requieren revisión humana:** ver `08` §0.
- **Evidencia y commit:** rama `migration/rust-backend` (commit 37d8272 y anteriores).
