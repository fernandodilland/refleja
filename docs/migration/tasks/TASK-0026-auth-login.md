# TASK-0026 · Implementar `POST /api/auth/login` (y helpers de sesión/cookie compartidos)

## Identificación
- **ID:** TASK-0026
- **Título:** Implementar `POST /api/auth/login` (y helpers de sesión/cookie compartidos)
- **Estado:** propuesta
- **Prioridad:** P1
- **Dominio:** Auth
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** alto
- **Tarea padre:** EPIC-D — Dominio Auth
- **Dependencias:** TASK-0007, TASK-0009, TASK-0010, TASK-0012, TASK-0013, TASK-0014, TASK-0015, TASK-0016, TASK-0017, TASK-0025
- **Bloquea a:** TASK-0027, TASK-0028, TASK-0044

## Objetivo
Login de administrador idéntico al actual: Turnstile managed, Argon2id con señuelo, historial sin IP, sesión de refresh y cookie `refleja_rt`. Además deja los helpers `issue_session` y `cookie` que reutilizan refresh y logout.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/routers/auth.py:36-134`
- `02` EP-005
- `03` FL-04
- `evidence/python-baseline/probe-output-2026-10-18.txt` (login 200/401/403)
- `05` P-05, P-07

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- ADR-009
- ADR-014

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- Handler `POST /auth/login` con orden: 422 → Turnstile (403) → usuario → verificación Argon2 **siempre** (real o señuelo) → 401 → `needs_rehash` → `last_login_at` → `admin_login` (browser/os/device por UA, país, UA ≤255) → `admin_session` (`sha256` del refresh, `sha256` del UA, `expires_at`) → commit.
- Respuesta `{access_token, token_type:"bearer", expires_in: ACCESS_TTL*60}` y `Set-Cookie` exacto (`HttpOnly`, `Max-Age`, `Path=/api/auth`, `SameSite`, `Secure` si `COOKIE_SECURE||is_prod`, `Domain` si configurado).
- `routes/auth/session.rs` (`issue_session`) y `routes/auth/cookie.rs` (set/clear) usados también por 0027/0028.
- Casos de contrato CT-050…056 (grabados de Python).

## Fuera de alcance
- Refresh, logout y me (otras tareas). No añadir rate limit nuevo (ADR-014).
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Transacción única; si falla algo después del hash, no dejar fila parcial.
2. Mismo mensaje `«Usuario o contraseña incorrectos.»` para usuario inexistente, inactivo o contraseña errónea.
3. Registrar en MariaDB local el formato de `last_login_at` (Q-07) como caso.

## Contratos e invariantes
- Sin IP en BD ni logs.
- La contraseña nunca se registra.
- El mensaje de 403 es `«Verificación anti-bot fallida.»`.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/routes/auth/login.rs
- back-rs/src/routes/auth/session.rs
- back-rs/src/routes/auth/cookie.rs
- back-rs/tests/contract/cases/auth/login*.json

**Archivos de referencia (solo lectura):**
- back/app/routers/auth.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- CT-050…056, CT-053 en modo dev y prod (atributo `Secure`).
- Timing: usuario inexistente vs inválido dentro de un margen (mismas llamadas a Argon2).
- Re-hash cuando el hash almacenado tiene parámetros antiguos.

## Criterios de aceptación
- [ ] CT-050…056 verdes contra Rust.
- [ ] Tokens de login validan en PyJWT y viceversa (CT-068 parcial).

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*
- Comando exacto del harness: ver `back-rs/tests/contract/README.md` (TASK-0007); casos en modo `verify` contra el binario Rust *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo alto: fallo de login = panel inaccesible. Rollback: no conmutar tráfico (ADR-017).

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:**
- **Archivos modificados:**
- **Pruebas ejecutadas y resultados reales:**
- **Criterios satisfechos y pendientes:**
- **Diferencias detectadas respecto al original:**
- **Decisiones que requieren revisión humana:**
- **Evidencia y commit:**
