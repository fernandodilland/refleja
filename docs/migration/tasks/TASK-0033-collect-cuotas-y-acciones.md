# TASK-0033 · Implementar `collect/quota.rs` y `collect/actions.rs`: cuotas por vida y eventos de acción

## Identificación
- **ID:** TASK-0033
- **Título:** Implementar `collect/quota.rs` y `collect/actions.rs`: cuotas por vida y eventos de acción
- **Estado:** completada
- **Prioridad:** P1
- **Dominio:** Public
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** medio
- **Tarea padre:** EPIC-E — Dominio Public (estadística)
- **Dependencias:** TASK-0007, TASK-0019, TASK-0022, TASK-0023, TASK-0032
- **Bloquea a:** TASK-0034, TASK-0035

## Objetivo
Portar `_Quota` y el procesamiento de `page_view`, `urgent_click`, `hide_click`, `restart` y `directory_municipio`.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/routers/public.py:127-153,187-210`
- `03` FL-03
- `05` P-10

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- `Quota` (valores iniciales del visitante + deltas; `events_left`, `can_create_run`, `actions_left` con `PUBLIC_MAX_*`).
- `process_action(tx, &mut Quota, &Event)`: si `!actions_left` ⇒ ignora; si no, `d_actions+=1` y efecto (ver `03`); `directory_municipio` cuenta la acción aunque el municipio sea inválido.
- CT-031…033, CT-043.

## Fuera de alcance
- Eventos de run (TASK-0034).
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Seguir el alcance incluido; ante dudas de contrato, detenerse y registrar la incógnita en `08`.

## Contratos e invariantes
- `page_view` suma `daily_metric.page_views` y `d_page_views` (→ `visitor.page_views` vía `bump_quota`).
- Contadores con nombre exacto: `urgent_click`, `hide_click`, `restart`, `dir_muni:<slug>`.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/routes/public/collect/quota.rs
- back-rs/src/routes/public/collect/actions.rs
- back-rs/tests/contract/cases/public/collect_actions*.json

**Archivos de referencia (solo lectura):**
- back/app/routers/public.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- CT-031…033, CT-043 + unitarias de `Quota` en los límites exactos (299/300 acciones).

## Criterios de aceptación
- [ ] CT-031…033 y CT-043 verdes.

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

- **Resumen de cambios:** implementado en `back-rs/` (ver archivos).
- **Archivos modificados:** `src/routes/collect.rs`
- **Pruebas ejecutadas y resultados reales:** Validación Pydantic (incluidas coerciones), cuotas de por vida, idempotencia por qid, completado único, run ajeno, evento suelto: `back-rs/tests/contract/diff.py` (≈230 peticiones Python vs Rust + 8 tablas + fases de producción y cutover): TODO OK; concurrencia sin 5xx.
- **Criterios satisfechos y pendientes:** ver estado de la ficha; los pendientes se detallan arriba cuando el estado no es `completada`.
- **Diferencias detectadas respecto al original:** ver `runbook-cutover.md` §5 y ADR-020/021/022 en `08`.
- **Decisiones que requieren revisión humana:** ver `08` §0.
- **Evidencia y commit:** rama `migration/rust-backend` (commit 37d8272 y anteriores).
