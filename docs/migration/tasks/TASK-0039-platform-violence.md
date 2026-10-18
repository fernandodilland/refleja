# TASK-0039 · Implementar `GET /api/platform/violence`

## Identificación
- **ID:** TASK-0039
- **Título:** Implementar `GET /api/platform/violence`
- **Estado:** propuesta
- **Prioridad:** P2
- **Dominio:** Platform
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** medio
- **Tarea padre:** EPIC-F — Dominio Platform (panel)
- **Dependencias:** TASK-0007, TASK-0010, TASK-0016, TASK-0020, TASK-0024, TASK-0036
- **Bloquea a:** TASK-0044

## Objetivo
Totales, presencia y dominancia por tipo de violencia sobre runs completados.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/routers/platform.py:252-298`
- `02` EP-012

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- Filtros de `filters.rs`. `totals` (SUM con COALESCE), `present` (>0), `dominant` (primero en orden `psicologica,fisica,economica,patrimonial,sexual,intimidacion` con el máximo si máximo>0), `completed_runs`.
- Calcular `present`/`dominant` **en SQL o en streaming** (no cargar todo a memoria) manteniendo resultados idénticos; justificarlo con prueba de equivalencia.
- CT-076.

## Fuera de alcance
- Nada más.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Seguir el alcance incluido; ante dudas de contrato, detenerse y registrar la incógnita en `08`.

## Contratos e invariantes
- Empates: gana el primero del orden fijo.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/routes/platform/violence.rs
- back-rs/tests/contract/cases/platform/violence*.json

**Archivos de referencia (solo lectura):**
- back/app/routers/platform.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- CT-076 con empates de máximo, runs sin scores, filtros.

## Criterios de aceptación
- [ ] CT-076 verde.
- [ ] Memoria constante respecto al número de filas (prueba con 200 000 filas sintéticas).

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
