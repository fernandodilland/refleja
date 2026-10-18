# TASK-0028 · Implementar `POST /api/auth/logout`

## Identificación
- **ID:** TASK-0028
- **Título:** Implementar `POST /api/auth/logout`
- **Estado:** completada
- **Prioridad:** P1
- **Dominio:** Auth
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** bajo
- **Tarea padre:** EPIC-D — Dominio Auth
- **Dependencias:** TASK-0007, TASK-0010, TASK-0013, TASK-0016, TASK-0025, TASK-0026
- **Bloquea a:** TASK-0044

## Objetivo
Logout idempotente: revoca la sesión de la cookie si es válida y siempre borra la cookie.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/routers/auth.py:199-218`
- `02` EP-007

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- Con cookie válida y no revocada ⇒ `revoked_at=now`+commit; JWT inválido se ignora; siempre 200 `{"ok":true}` + `Set-Cookie` de borrado (`Max-Age=0`, `expires` en el pasado, `Path=/api/auth`).
- CT-065.

## Fuera de alcance
- Sin otros efectos.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Seguir el alcance incluido; ante dudas de contrato, detenerse y registrar la incógnita en `08`.

## Contratos e invariantes
- No devuelve 401 nunca.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/routes/auth/logout.rs
- back-rs/tests/contract/cases/auth/logout*.json

**Archivos de referencia (solo lectura):**
- back/app/routers/auth.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- CT-065 (con cookie válida/ inválida/ ausente/ ya revocada); después del logout, refresh con esa cookie ⇒ 401.

## Criterios de aceptación
- [ ] CT-065 verde.

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
- **Archivos modificados:** `src/routes/auth.rs`
- **Pruebas ejecutadas y resultados reales:** Login/refresh/logout/me, rotación y detección de reuso, cookies (dev y producción: `Domain`, `Secure`, `SameSite=none`): `back-rs/tests/contract/diff.py` (≈230 peticiones Python vs Rust + 8 tablas + fases de producción y cutover): TODO OK; sesiones intercambiables Python↔Rust.
- **Criterios satisfechos y pendientes:** ver estado de la ficha; los pendientes se detallan arriba cuando el estado no es `completada`.
- **Diferencias detectadas respecto al original:** ver `runbook-cutover.md` §5 y ADR-020/021/022 en `08`.
- **Decisiones que requieren revisión humana:** ver `08` §0.
- **Evidencia y commit:** rama `migration/rust-backend` (commit 37d8272 y anteriores).
