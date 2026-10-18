# TASK-0011 · Implementar `db.rs`: pool SQLx MariaDB, sesión UTC y verificación de esquema al arrancar

## Identificación
- **ID:** TASK-0011
- **Título:** Implementar `db.rs`: pool SQLx MariaDB, sesión UTC y verificación de esquema al arrancar
- **Estado:** propuesta
- **Prioridad:** P1
- **Dominio:** Persistencia
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** medio
- **Tarea padre:** EPIC-C — Persistencia (MariaDB)
- **Dependencias:** TASK-0009, TASK-0021
- **Bloquea a:** TASK-0016, TASK-0022, TASK-0023, TASK-0024, TASK-0025, TASK-0043

## Objetivo
Equivalente de `database.py`: pool con reciclaje y *ping* previo, `time_zone` UTC en cada conexión y verificación (sin DDL) de que el esquema esperado existe.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/database.py:14-35,46-74`
- `04` §1 y §3
- ADR-006

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- ADR-006 (sin DDL al arrancar)
- ADR-016

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- `connect(&Settings) -> MySqlPool`: `charset utf8mb4`, `after_connect: SET time_zone='+00:00'`, `max_lifetime` 1800 s, `test_before_acquire`, `acquire_timeout`, máximo de conexiones desde `DB_MAX_CONNECTIONS` (propuesta: 10, a validar en TASK-0046).
- `verify_schema(&pool)`: comprueba tablas y columnas listadas en `migrations/expected_schema.txt` (TASK-0021) y falla con mensaje que enumera lo que falta.
- Helper para transacciones (`begin`/`commit`/`rollback` en caída).

## Fuera de alcance
- No ejecutar DDL ni migraciones (ADR-006).
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Si `verify_schema` falla, el proceso termina con código ≠ 0 antes de abrir el puerto.
2. Los errores de BD se convierten en `AppError::Internal` sin exponer SQL.

## Contratos e invariantes
- Todas las conexiones en UTC (por `func.now()` y `utcnow()` coherentes).

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/db.rs

**Archivos de referencia (solo lectura):**
- back/app/database.py
- back-rs/migrations/expected_schema.txt

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Integración con MariaDB efímera: pool conecta; `SELECT @@session.time_zone` = `+00:00`; `verify_schema` ok con el baseline y falla al borrar una columna.

## Criterios de aceptación
- [ ] Pruebas en verde.
- [ ] Mensaje de `verify_schema` lista exactamente lo faltante.
- [ ] Ninguna sentencia DDL en el código (`grep -n 'CREATE\|ALTER' back-rs/src/db.rs` vacío).

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo: tamaño de pool insuficiente/excesivo → se mide en 0046. Rollback: revertir archivo.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:**
- **Archivos modificados:**
- **Pruebas ejecutadas y resultados reales:**
- **Criterios satisfechos y pendientes:**
- **Diferencias detectadas respecto al original:**
- **Decisiones que requieren revisión humana:**
- **Evidencia y commit:**
