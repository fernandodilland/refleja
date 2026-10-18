# TASK-0025 · Implementar `repo/admin.rs`: usuarios, sesiones de refresh e historial de login

## Identificación
- **ID:** TASK-0025
- **Título:** Implementar `repo/admin.rs`: usuarios, sesiones de refresh e historial de login
- **Estado:** propuesta
- **Prioridad:** P1
- **Dominio:** Persistencia
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** medio
- **Tarea padre:** EPIC-C — Persistencia (MariaDB)
- **Dependencias:** TASK-0011, TASK-0012, TASK-0021
- **Bloquea a:** TASK-0020, TASK-0026, TASK-0027, TASK-0028, TASK-0029, TASK-0042, TASK-0043

## Objetivo
Operaciones de `admin_user`, `admin_session` y `admin_login` necesarias para login, refresh, logout y `require_admin`.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/routers/auth.py`
- `back/app/deps.py:73-77`
- `back/app/models.py:43-72,150-164`

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- `get_user_by_username`, `get_user_by_id`, `set_last_login(user_id, now)`, `set_password_hash(user_id, hash)`.
- `insert_login(AdminLogin)`, `insert_session(NewSession)`, `get_session_by_jti`, `revoke_session(id, now)`, `revoke_all_active(user_id, now)` (solo las `revoked_at IS NULL`).

## Fuera de alcance
- Sin lógica de decisión (rama de reuso, etc.): vive en los handlers.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. `updated_at` explícito en cada UPDATE.

## Contratos e invariantes
- `username` sensible a mayúsculas según la colación `utf8mb4_unicode_ci` (comparación de MariaDB, **insensible**): no normalizar en Rust; documentar el comportamiento observado.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/repo/admin.rs

**Archivos de referencia (solo lectura):**
- back/app/routers/auth.py
- back/app/models.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Round-trips; `revoke_all_active` no toca ya revocadas; `refresh_jti` único; lookup de usuario con distinta capitalización (documentar resultado igual que Python).

## Criterios de aceptación
- [ ] Pruebas en verde.

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo bajo.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:**
- **Archivos modificados:**
- **Pruebas ejecutadas y resultados reales:**
- **Criterios satisfechos y pendientes:**
- **Diferencias detectadas respecto al original:**
- **Decisiones que requieren revisión humana:**
- **Evidencia y commit:**
