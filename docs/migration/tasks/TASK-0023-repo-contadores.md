# TASK-0023 · Implementar `repo/counters.rs`: `question_stat`, `event_counter` y `daily_metric` atómicos

## Identificación
- **ID:** TASK-0023
- **Título:** Implementar `repo/counters.rs`: `question_stat`, `event_counter` y `daily_metric` atómicos
- **Estado:** completada
- **Prioridad:** P1
- **Dominio:** Persistencia
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** medio
- **Tarea padre:** EPIC-C — Persistencia (MariaDB)
- **Dependencias:** TASK-0011, TASK-0012, TASK-0021
- **Bloquea a:** TASK-0030, TASK-0033, TASK-0034, TASK-0036, TASK-0038, TASK-0040, TASK-0041

## Objetivo
Portar `bump_question`, `bump_counter` y `bump_daily` como upserts atómicos (ADR-007).

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/analytics.py:152-231`
- `back/app/models.py:125-148,167-176`

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- ADR-007

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- `bump_question(tx, qid, reached, answered)`: ignora qid ∉ `VALID_QUESTION_IDS` y deltas 0.
- `bump_counter(tx, name, n)`: trunca `name` a 64 caracteres; ignora vacío o `n==0`.
- `bump_daily(tx, deltas)`: fecha = hoy UTC; filtra deltas 0; columnas permitidas `page_views, form_starts, form_completes, minors, new_visitors`.
- Implementar con `INSERT … ON DUPLICATE KEY UPDATE x = x + ?` fijando `updated_at`.

## Fuera de alcance
- No validar municipios (caller).
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Reloj inyectable para `bump_daily` (pruebas de cambio de día UTC).

## Contratos e invariantes
- Resultado final idéntico a SELECT+INSERT+UPDATE de Python, incluso con llamadas concurrentes.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/repo/counters.rs

**Archivos de referencia (solo lectura):**
- back/app/analytics.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- 1 000 incrementos concurrentes ⇒ suma exacta; trunca a 64; ignora qid inválido; medianoche UTC crea fila nueva.

## Criterios de aceptación
- [ ] Pruebas en verde con MariaDB real.

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo: `AUTO_INCREMENT` salta con `ON DUPLICATE KEY` (consumo de ids) — sin efecto funcional, documentar.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:** implementado en `back-rs/` (ver archivos).
- **Archivos modificados:** `src/repo/{visitor,counters,form_run,admin}.rs`
- **Pruebas ejecutadas y resultados reales:** Volcado de las 8 tablas idéntico entre Python y Rust tras el escenario completo; carga concurrente sin errores (`bench/bench.py`).
- **Criterios satisfechos y pendientes:** ver estado de la ficha; los pendientes se detallan arriba cuando el estado no es `completada`.
- **Diferencias detectadas respecto al original:** ver `runbook-cutover.md` §5 y ADR-020/021/022 en `08`.
- **Decisiones que requieren revisión humana:** ver `08` §0.
- **Evidencia y commit:** rama `migration/rust-backend` (commit 37d8272 y anteriores).
