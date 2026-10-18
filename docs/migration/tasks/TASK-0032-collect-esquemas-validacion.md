# TASK-0032 · Implementar `collect/schema.rs`: esquemas de entrada y validación equivalentes a Pydantic

## Identificación
- **ID:** TASK-0032
- **Título:** Implementar `collect/schema.rs`: esquemas de entrada y validación equivalentes a Pydantic
- **Estado:** propuesta
- **Prioridad:** P1
- **Dominio:** Public
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** alto
- **Tarea padre:** EPIC-E — Dominio Public (estadística)
- **Dependencias:** TASK-0007, TASK-0010, TASK-0006
- **Bloquea a:** TASK-0033, TASK-0034, TASK-0035

## Objetivo
Deserializar y validar `CollectBatch`/`CollectEvent`/`Scores` aceptando y rechazando exactamente lo mismo que Pydantic 2.10 (incluida la compatibilidad con evento suelto).

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/schemas.py:18-77`
- `02` EP-004
- `evidence/python-baseline/probe-output-2026-10-18.txt` (422 reales)

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- ADR-008

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- Tipos: `EventType` (10 valores), `Scores` (6 enteros 0..=60, default 0), `CollectEvent` (campos y límites de `02` EP-004: longitudes en **caracteres**, `step` 0..=20, enums cerrados), `CollectBatch{events: 0..=50}`.
- Compatibilidad: si no existe `events` pero sí `type`, tratar el objeto como `{events:[objeto]}`.
- Campos desconocidos ignorados; `null` en opcionales ⇒ `None`.
- **Sondear Python** para fijar coerciones (lax mode): `"5"`→int, `5.0`→int, `5.5`→error, `true`→int, strings numéricos en campos str, etc.; replicar o listar divergencias para aprobación.
- Errores a 422 con `loc` correcto (`["body","events",0,"type"]`…).

## Fuera de alcance
- Sin lógica de procesamiento.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Grabar las sondas en `cases/public/collect_validation*.json` (CT-021…030 + coerciones).

## Contratos e invariantes
- Un lote de 50 es válido; 51 ⇒ 422; vacío ⇒ válido.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/routes/public/collect/schema.rs
- back-rs/tests/contract/cases/public/collect_validation*.json

**Archivos de referencia (solo lectura):**
- back/app/schemas.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- CT-021…030 y tabla de coerciones.
- Prueba por propiedad: estructuras aleatorias válidas/ inválidas comparadas con un oráculo hecho con tablas.

## Criterios de aceptación
- [ ] CT-021…030 verdes.
- [ ] Tabla de coerciones documentada en el archivo y sin divergencias sin aprobar.

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
