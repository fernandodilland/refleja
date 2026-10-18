# TASK-0002 · Confirmar esquema real, versión y privilegios de MariaDB (solo lectura)

## Identificación
- **ID:** TASK-0002
- **Título:** Confirmar esquema real, versión y privilegios de MariaDB (solo lectura)
- **Estado:** lista
- **Prioridad:** P0
- **Dominio:** Descubrimiento
- **Responsable o agente asignado:** Propietario del proyecto (acceso al servidor) — un agente solo puede procesar la evidencia entregada
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** medio
- **Tarea padre:** EPIC-A — Descubrimiento y decisiones (sin código)
- **Dependencias:** ninguna
- **Bloquea a:** TASK-0021

## Objetivo
Resolver Q-02, Q-05, Q-06 y C-03: saber el DDL exacto de producción (incluida `event_counter`, que `seed.example.sql` no define) para que las migraciones y consultas Rust sean correctas.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/seed.example.sql` (7 tablas, sin `event_counter`)
- `back/app/models.py:167-176` (`EventCounter`)
- `back/app/database.py:46-74` (`create_all` + `ALTER … IF NOT EXISTS`)

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- Con un usuario de **solo lectura**: `SELECT VERSION()`, `SELECT @@sql_mode, @@time_zone, @@max_connections`, `SHOW TABLES`, `SHOW CREATE TABLE` de las 8 tablas, `SHOW GRANTS FOR CURRENT_USER`, y estimación de filas (`information_schema.TABLES`).
- Guardar **solo DDL y metadatos** (nunca datos de filas).

## Fuera de alcance
- Ninguna sentencia DML/DDL. No volcar datos. No tocar `seed.sql`/`migration.sql`.
- No modificar `back/`, `front/` ni crear `back-rs/`.
- No ejecutar comandos de escritura ni cambiar configuración o datos en el servidor.
- No copiar secretos, contraseñas, IPs de clientes ni datos de filas a la evidencia.

## Instrucciones de implementación
1. Entregar `docs/migration/evidence/prod-schema-<fecha>.sql` (solo `CREATE TABLE`) y `prod-db-meta-<fecha>.md`.
2. Comparar con `seed.example.sql` + `models.py`; llenar una tabla de diferencias en `04` §2.1 (D-5).
3. Cerrar o actualizar Q-02, Q-05, Q-06, C-03 en `08`.

## Contratos e invariantes
- No incluir contraseñas, nombres de usuario de BD ni hosts internos.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- docs/migration/evidence/prod-schema-<fecha>.sql
- docs/migration/evidence/prod-db-meta-<fecha>.md

**Archivos de referencia (solo lectura):**
- back/seed.example.sql
- back/app/models.py
- docs/migration/04-data-and-integrations.md

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- No aplica.

## Criterios de aceptación
- [ ] DDL de las 8 tablas presente y sin datos.
- [ ] Tabla de diferencias con seed.example.sql en `04` §2.1.
- [ ] Versión de MariaDB, `sql_mode` y privilegios registrados.

## Verificación
- Revisión humana. Opcional: `mariadb < prod-schema.sql` sobre una BD local vacía para comprobar que el DDL es cargable.

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo: exponer datos si se vuelca de más → revisar el archivo antes de commitear. Rollback: borrar el archivo.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:**
- **Archivos modificados:**
- **Pruebas ejecutadas y resultados reales:**
- **Criterios satisfechos y pendientes:**
- **Diferencias detectadas respecto al original:**
- **Decisiones que requieren revisión humana:**
- **Evidencia y commit:**
