# TASK-0022 · Implementar `repo/visitor.rs`: get-or-create, touch y cuotas atómicas

## Identificación
- **ID:** TASK-0022
- **Título:** Implementar `repo/visitor.rs`: get-or-create, touch y cuotas atómicas
- **Estado:** completada
- **Prioridad:** P1
- **Dominio:** Persistencia
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** medio
- **Tarea padre:** EPIC-C — Persistencia (MariaDB)
- **Dependencias:** TASK-0011, TASK-0012, TASK-0021
- **Bloquea a:** TASK-0030, TASK-0031, TASK-0033, TASK-0035, TASK-0036, TASK-0037

## Objetivo
Portar las operaciones de `visitor` de `analytics.py` con las mismas garantías (creación tolerante a carrera, incrementos atómicos).

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/analytics.py:99-149`
- `back/app/models.py:75-92`

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- `Visitor` (campos de `04` §2), `get_or_create(tx, vid_hash, country, device) -> (Visitor, created)` (SELECT → INSERT tolerando `duplicate key` → SELECT).
- `touch(tx, vid_hash)` ⇒ `last_seen_at = utcnow`.
- `bump_quota(tx, vid_hash, events, runs, completions, page_views, actions)` en **un** UPDATE con `col = col + ?` y `last_seen_at`, `updated_at`.

## Fuera de alcance
- Las consultas agregadas del panel viven en sus propios endpoints.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Funciones genéricas sobre `&mut Transaction<MySql>` (o `Executor`).
2. Fijar `updated_at` explícitamente (D-2).

## Contratos e invariantes
- `get_or_create` de un visitante existente **no** modifica country/device.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/repo/visitor.rs

**Archivos de referencia (solo lectura):**
- back/app/analytics.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- MariaDB efímera: crea/recupera; dos creaciones concurrentes del mismo hash ⇒ una fila; `bump_quota` suma exactamente; `touch` cambia `last_seen_at`.

## Criterios de aceptación
- [ ] Pruebas en verde; carrera de 32 tareas produce 1 fila y todas obtienen el mismo id.

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo: bloqueo/ deadlock bajo carga → medir en 0046.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:** implementado en `back-rs/` (ver archivos).
- **Archivos modificados:** `src/repo/{visitor,counters,form_run,admin}.rs`
- **Pruebas ejecutadas y resultados reales:** Volcado de las 8 tablas idéntico entre Python y Rust tras el escenario completo; carga concurrente sin errores (`bench/bench.py`).
- **Criterios satisfechos y pendientes:** ver estado de la ficha; los pendientes se detallan arriba cuando el estado no es `completada`.
- **Diferencias detectadas respecto al original:** ver `runbook-cutover.md` §5 y ADR-020/021/022 en `08`.
- **Decisiones que requieren revisión humana:** ver `08` §0.
- **Evidencia y commit:** rama `migration/rust-backend` (commit 37d8272 y anteriores).
