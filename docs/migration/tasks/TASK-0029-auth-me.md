# TASK-0029 · Implementar `GET /api/auth/me`

## Identificación
- **ID:** TASK-0029
- **Título:** Implementar `GET /api/auth/me`
- **Estado:** propuesta
- **Prioridad:** P1
- **Dominio:** Auth
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** bajo
- **Tarea padre:** EPIC-D — Dominio Auth
- **Dependencias:** TASK-0007, TASK-0010, TASK-0016, TASK-0020, TASK-0025
- **Bloquea a:** TASK-0044

## Objetivo
Devolver `{id, username, last_login_at}` del admin autenticado.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/routers/auth.py:221-223`
- `back/app/schemas.py:93-96`
- `02` EP-008

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- Handler con extractor `AdminUser`; `last_login_at` ISO naive o `null`.
- CT-066 (401×3 + 200) y comportamiento de `last_login_at` con MariaDB (Q-07).

## Fuera de alcance
- Nada más.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Seguir el alcance incluido; ante dudas de contrato, detenerse y registrar la incógnita en `08`.

## Contratos e invariantes
- Formato de fecha igual a `datetime.isoformat()` observado en MariaDB local.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/routes/auth/me.rs
- back-rs/tests/contract/cases/auth/me*.json

**Archivos de referencia (solo lectura):**
- back/app/routers/auth.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- CT-066, CT-067.

## Criterios de aceptación
- [ ] CT-066/067 verdes; Q-07 resuelta en `08` con el formato real.

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
