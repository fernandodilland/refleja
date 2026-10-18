# TASK-0036 · Implementar filtros compartidos y `GET /api/platform/overview`

## Identificación
- **ID:** TASK-0036
- **Título:** Implementar filtros compartidos y `GET /api/platform/overview`
- **Estado:** propuesta
- **Prioridad:** P2
- **Dominio:** Platform
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** medio
- **Tarea padre:** EPIC-F — Dominio Platform (panel)
- **Dependencias:** TASK-0007, TASK-0010, TASK-0016, TASK-0020, TASK-0012, TASK-0022, TASK-0023, TASK-0024
- **Bloquea a:** TASK-0039, TASK-0040, TASK-0044

## Objetivo
Implementar `filters.rs` (usado por overview, violence y municipios) y el endpoint overview con todas sus métricas y redondeos.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/routers/platform.py:29-134`
- `02` EP-009
- `evidence/python-baseline/probe-output-2026-10-18.txt`

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- ADR-012

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- Query: `date_from`, `date_to` (fecha ISO), `flow_type`, `municipio` (strings libres); 422 con `loc ["query",…]`. Filtro: `created_at >= date_from 00:00` y `< (date_to+1d) 00:00`, `flow_type =`, `municipio =`.
- Las 13 claves de respuesta con sus fuentes (filtradas y no filtradas, ver `02`), `completion_rate`/`start_rate` con `py_round4`, `active_now` ventana 90 s.
- CT-070…072.

## Fuera de alcance
- Otros endpoints de panel.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Evitar ejecutar las ~9 consultas secuencialmente si se pueden agrupar sin cambiar resultados (opcional; verificar equivalencia).

## Contratos e invariantes
- `total_visitors`, `active_now`, `entered_not_started`, `repeat_visitors` y contadores NO se filtran.
- Con denominador 0 las tasas valen `0.0`.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/routes/platform/filters.rs
- back-rs/src/routes/platform/overview.rs
- back-rs/tests/contract/cases/platform/overview*.json

**Archivos de referencia (solo lectura):**
- back/app/routers/platform.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- CT-070…072 con datos sembrados deterministas; límites de día; `flow_type` desconocido ⇒ ceros; tasas con redondeo (vectores).

## Criterios de aceptación
- [ ] CT-070…072 verdes.

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*
- Comando exacto del harness: ver `back-rs/tests/contract/README.md` (TASK-0007); casos en modo `verify` contra el binario Rust *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Sin riesgo de datos: no se toca producción. Rollback: revertir los commits de la tarea (los archivos son nuevos y propios).

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:**
- **Archivos modificados:**
- **Pruebas ejecutadas y resultados reales:**
- **Criterios satisfechos y pendientes:**
- **Diferencias detectadas respecto al original:**
- **Decisiones que requieren revisión humana:**
- **Evidencia y commit:**
