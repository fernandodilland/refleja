# TASK-0027 · Implementar `POST /api/auth/refresh` con rotación y detección de reuso

## Identificación
- **ID:** TASK-0027
- **Título:** Implementar `POST /api/auth/refresh` con rotación y detección de reuso
- **Estado:** propuesta
- **Prioridad:** P1
- **Dominio:** Auth
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** alto
- **Tarea padre:** EPIC-D — Dominio Auth
- **Dependencias:** TASK-0007, TASK-0010, TASK-0013, TASK-0016, TASK-0025, TASK-0026
- **Bloquea a:** TASK-0044

## Objetivo
Replicar la cadena de decisión de refresh (incluyendo la revocación de la familia ante reuso y la ausencia de `Set-Cookie` en los 401).

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/routers/auth.py:137-196`
- `02` EP-006
- `03` FL-05
- `evidence/python-baseline/probe-output-2026-10-18.txt` (reuso)
- ADR-010

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- ADR-010 (preservar no-limpiar cookie)
- ADR-009

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- Ramas y mensajes exactos de `02` EP-006; en éxito: `revoked_at=now` en la sesión vieja, nueva sesión, nueva cookie, nuevo access token.
- Reuso (sesión ya revocada): `UPDATE … SET revoked_at=now WHERE admin_user_id=? AND revoked_at IS NULL`, commit, `WARN` con `admin_user_id`, 401 «Sesión revocada por seguridad.».
- Comparar `sha256(cookie)` con `token_hash`; expiración con `expires_at < now`.
- Casos CT-057…064 y prueba de concurrencia.

## Fuera de alcance
- No enviar `Set-Cookie` en ningún 401 (comportamiento actual).
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Hacer el chequeo y la rotación en una transacción; documentar y probar qué ocurre con dos refresh simultáneos de la misma cookie (resultado esperado: uno rota, el otro puede caer en reuso, igual que Python) y que el front lo evita (`auth-common.js:26-42`).

## Contratos e invariantes
- Un refresh rotado deja de ser válido.
- La familia completa se invalida al reutilizar.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/routes/auth/refresh.rs
- back-rs/tests/contract/cases/auth/refresh*.json

**Archivos de referencia (solo lectura):**
- back/app/routers/auth.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- CT-057…064, 067, 068.
- Estrés: 20 refresh concurrentes con la misma cookie sin pánico ni más de una rotación exitosa.

## Criterios de aceptación
- [ ] CT-057…064 verdes.
- [ ] Sin `Set-Cookie` en 401 (assert explícito).

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*
- Comando exacto del harness: ver `back-rs/tests/contract/README.md` (TASK-0007); casos en modo `verify` contra el binario Rust *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo alto de cerrar sesiones indebidamente. Rollback: no conmutar tráfico.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:**
- **Archivos modificados:**
- **Pruebas ejecutadas y resultados reales:**
- **Criterios satisfechos y pendientes:**
- **Diferencias detectadas respecto al original:**
- **Decisiones que requieren revisión humana:**
- **Evidencia y commit:**
