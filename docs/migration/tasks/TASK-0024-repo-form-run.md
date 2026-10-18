# TASK-0024 · Implementar `repo/form_run.rs`: runs con `counted` JSON y `updated_at` garantizado

## Identificación
- **ID:** TASK-0024
- **Título:** Implementar `repo/form_run.rs`: runs con `counted` JSON y `updated_at` garantizado
- **Estado:** propuesta
- **Prioridad:** P1
- **Dominio:** Persistencia
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** medio
- **Tarea padre:** EPIC-C — Persistencia (MariaDB)
- **Dependencias:** TASK-0011, TASK-0012, TASK-0021
- **Bloquea a:** TASK-0034, TASK-0036, TASK-0037, TASK-0039

## Objetivo
Portar `get_run`/`create_run` y el guardado completo del run, preservando la semántica de `counted` y de `updated_at` (ordena `/realtime`).

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/analytics.py:234-255`
- `back/app/models.py:95-122`
- `04` §2.1 D-2

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- ADR-007

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- `FormRun` con todas las columnas; `counted: Option<Counted{r: Vec<String>, a: Vec<String>}>` serializado como JSON (texto en MariaDB).
- `get_by_uid`, `create(uid, visitor_id)` tolerante a carrera (devuelve el existente), `save(&run)` ⇒ `UPDATE` de columnas mutables + `updated_at = NOW()`.

## Fuera de alcance
- Sin lógica de eventos (TASK-0034).
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. `counted` ausente/`NULL` ⇒ vacío; preservar el orden de inserción dentro de `r`/`a`.

## Contratos e invariantes
- Toda modificación persistida actualiza `updated_at`.
- `run_uid` único global.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/repo/form_run.rs

**Archivos de referencia (solo lectura):**
- back/app/analytics.py
- back/app/models.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Round-trip de todos los campos y de `counted`; `updated_at` avanza; creación concurrente del mismo `run_uid` ⇒ una fila.

## Criterios de aceptación
- [ ] Pruebas en verde.

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo: carrera de lectura-modificación-escritura en `counted` (S-06) — se conserva el comportamiento; ver TASK-0035.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:**
- **Archivos modificados:**
- **Pruebas ejecutadas y resultados reales:**
- **Criterios satisfechos y pendientes:**
- **Diferencias detectadas respecto al original:**
- **Decisiones que requieren revisión humana:**
- **Evidencia y commit:**
