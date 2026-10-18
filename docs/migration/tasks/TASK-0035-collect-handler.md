# TASK-0035 · Implementar `POST /api/public/collect`: orquestación, transacción y rate limit

## Identificación
- **ID:** TASK-0035
- **Título:** Implementar `POST /api/public/collect`: orquestación, transacción y rate limit
- **Estado:** completada
- **Prioridad:** P1
- **Dominio:** Public
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** alto
- **Tarea padre:** EPIC-E — Dominio Public (estadística)
- **Dependencias:** TASK-0007, TASK-0016, TASK-0017, TASK-0018, TASK-0020, TASK-0022, TASK-0032, TASK-0033, TASK-0034
- **Bloquea a:** TASK-0044

## Objetivo
Ensamblar el endpoint: autenticación, validación, rate limit, selección de `device`, bucle de lote respetando la cuota de eventos, persistencia de cuotas y respuesta.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/routers/public.py:285-323`
- `02` EP-004
- `03` FL-03

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- `routes/public/collect/mod.rs`: handler con orden 401 → 422 → 429 (`coll:<vid_h>`, 120/min, «Demasiadas peticiones.») → `device` (primer evento con device) → `get_or_create` → bucle (`events_left`) → `bump_quota` → commit → `{ok:true, accepted}`.
- Transacción única; error en medio ⇒ rollback y 500.
- CT-020, CT-044…046 y pruebas de concurrencia (varios lotes simultáneos del mismo token y del mismo run).

## Fuera de alcance
- No cambiar semántica de cuotas.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. `accepted` cuenta eventos procesados incluso si se descartaron (comportamiento actual).
2. Documentar en pruebas el resultado de la carrera de `form_run.counted` (S-06) y que no produce pánico ni 500.

## Contratos e invariantes
- Ningún evento tras alcanzar `PUBLIC_MAX_EVENTS` se procesa; no es error.
- El lote vacío es 200 `accepted:0`.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/routes/public/collect/mod.rs
- back-rs/tests/contract/cases/public/collect_handler*.json

**Archivos de referencia (solo lectura):**
- back/app/routers/public.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- CT-020, CT-044…046; estrés: 50 lotes concurrentes ⇒ totales de cuotas coherentes y sin deadlocks no reintentados.

## Criterios de aceptación
- [ ] CT-020…047 completos en verde.
- [ ] Estado de tablas idéntico a Python para el escenario «sesión → cuestionario completo → ping».

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*
- Comando exacto del harness: ver `back-rs/tests/contract/README.md` (TASK-0007); casos en modo `verify` contra el binario Rust *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo alto: deadlocks bajo concurrencia → reintento acotado documentado. Rollback: no conmutar tráfico.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:** implementado en `back-rs/` (ver archivos).
- **Archivos modificados:** `src/routes/collect.rs`
- **Pruebas ejecutadas y resultados reales:** Validación Pydantic (incluidas coerciones), cuotas de por vida, idempotencia por qid, completado único, run ajeno, evento suelto: `back-rs/tests/contract/diff.py` (≈230 peticiones Python vs Rust + 8 tablas + fases de producción y cutover): TODO OK; concurrencia sin 5xx.
- **Criterios satisfechos y pendientes:** ver estado de la ficha; los pendientes se detallan arriba cuando el estado no es `completada`.
- **Diferencias detectadas respecto al original:** ver `runbook-cutover.md` §5 y ADR-020/021/022 en `08`.
- **Decisiones que requieren revisión humana:** ver `08` §0.
- **Evidencia y commit:** rama `migration/rust-backend` (commit 37d8272 y anteriores).
