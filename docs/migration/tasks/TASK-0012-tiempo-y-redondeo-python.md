# TASK-0012 · Implementar `timefmt.rs`: UTC naive, `isoformat` y `round(x, 4)` compatibles con Python

## Identificación
- **ID:** TASK-0012
- **Título:** Implementar `timefmt.rs`: UTC naive, `isoformat` y `round(x, 4)` compatibles con Python
- **Estado:** propuesta
- **Prioridad:** P1
- **Dominio:** Cimientos
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** medio
- **Tarea padre:** EPIC-B — Cimientos del crate y pruebas de contrato
- **Dependencias:** TASK-0006
- **Bloquea a:** TASK-0022, TASK-0023, TASK-0024, TASK-0025, TASK-0026, TASK-0036, TASK-0037, TASK-0038, TASK-0041, TASK-0042

## Objetivo
Garantizar que fechas y tasas se serialicen exactamente como lo hace Python (`datetime.isoformat()` naive, `round(float, 4)`).

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/security.py:67-73`
- `back/app/routers/platform.py:131-133,213-219`
- ADR-012, ADR-019

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- ADR-012
- ADR-019

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- `utcnow_naive()`, `today_utc()`, filtros de rango (`date_from → 00:00`, `date_to + 1 día`).
- `isoformat_naive(NaiveDateTime)`: `YYYY-MM-DDTHH:MM:SS` y `.ffffff` (6 dígitos) solo si microsegundos ≠ 0.
- `py_round4(f64)` con semántica de `round(x, 4)` de CPython y representación JSON equivalente a `repr(float)`.

## Fuera de alcance
- No acceder a BD.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Generar vectores con `back/.venv` (≥10 000 pares: valores `n/d` con `d` ≤ 10 000, y casos límite `0.00005`, `0.5`, `1/3`) guardarlos en `tests/vectors/round4.json` y comprobarlos.
2. Verificar que `serde_json` imprime esos `f64` como Python (`0.1235`, `0.6667`, `1.0`, `0.0`).

## Contratos e invariantes
- `0.0` y `1.0` se serializan con `.0` (como Python `0.0`/`1.0`).

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/timefmt.rs
- back-rs/tests/vectors/round4.json

**Archivos de referencia (solo lectura):**
- back/app/security.py
- back/app/routers/platform.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Vectores `round4`, `isoformat` con/ sin microsegundos, límites de día UTC.

## Criterios de aceptación
- [ ] 100 % de los vectores coinciden.
- [ ] Prueba de serialización JSON de `f64` equivalente a Python.

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo: diferencias de redondeo en casos exactos de punto medio. Rollback: revertir archivo.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:**
- **Archivos modificados:**
- **Pruebas ejecutadas y resultados reales:**
- **Criterios satisfechos y pendientes:**
- **Diferencias detectadas respecto al original:**
- **Decisiones que requieren revisión humana:**
- **Evidencia y commit:**
