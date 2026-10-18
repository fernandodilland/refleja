# TASK-0030 · Implementar `POST /api/public/session`

## Identificación
- **ID:** TASK-0030
- **Título:** Implementar `POST /api/public/session`
- **Estado:** propuesta
- **Prioridad:** P1
- **Dominio:** Public
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** medio
- **Tarea padre:** EPIC-E — Dominio Public (estadística)
- **Dependencias:** TASK-0007, TASK-0010, TASK-0013, TASK-0015, TASK-0016, TASK-0017, TASK-0018, TASK-0022, TASK-0023
- **Bloquea a:** TASK-0044

## Objetivo
Emitir el token estadístico de 30 días tras validar Turnstile invisible y registrar el visitante pseudónimo.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/routers/public.py:63-97`
- `02` EP-002
- `03` FL-01

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- Orden: 422 → rate limit `sess:<ip>` (30/min; `ip` o «unknown») ⇒ 429 «Demasiadas solicitudes.» → Turnstile invisible ⇒ 403 → `new_vid`, `hmac_vid`, device por UA, país → `get_or_create` + `bump_daily(new_visitors=1)` si creado → commit → JWT público.
- Respuesta `{token, expires_in_days}`.
- CT-010…014.

## Fuera de alcance
- Nada de ping/collect.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Seguir el alcance incluido; ante dudas de contrato, detenerse y registrar la incógnita en `08`.

## Contratos e invariantes
- El `vid` en claro solo viaja en el JWT; en BD solo `hmac_vid`.
- IP solo para Turnstile y rate limit.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/routes/public/session.rs
- back-rs/tests/contract/cases/public/session*.json

**Archivos de referencia (solo lectura):**
- back/app/routers/public.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- CT-010…014 incl. 429 con `CF-Connecting-IP` fija y diferenciación por IP.

## Criterios de aceptación
- [ ] CT-010…014 verdes.
- [ ] El claim `vid` tiene 32 hex.

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
