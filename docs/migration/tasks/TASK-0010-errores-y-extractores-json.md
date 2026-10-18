# TASK-0010 · Implementar `error.rs`: errores `{"detail"}`, respuestas 422 y extractores con errores propios

## Identificación
- **ID:** TASK-0010
- **Título:** Implementar `error.rs`: errores `{"detail"}`, respuestas 422 y extractores con errores propios
- **Estado:** propuesta
- **Prioridad:** P1
- **Dominio:** Cimientos
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** medio
- **Tarea padre:** EPIC-B — Cimientos del crate y pruebas de contrato
- **Dependencias:** TASK-0006
- **Bloquea a:** TASK-0016, TASK-0026, TASK-0027, TASK-0028, TASK-0029, TASK-0030, TASK-0031, TASK-0032, TASK-0036, TASK-0037, TASK-0038, TASK-0039, TASK-0040, TASK-0041, TASK-0042

## Objetivo
Centralizar los formatos de error observables: `{"detail": "…"}` con cabeceras opcionales, 422 con la estructura de Pydantic y 500 de texto plano; y proveer extractores `ApiJson`/`ApiQuery` que mapeen fallos de deserialización a 422 con `loc` correctos.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `02` §0 y «Comportamientos implícitos»
- `evidence/python-baseline/probe-output-2026-10-18.txt` (422 reales)

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- ADR-008 (fidelidad 422)
- ADR-009

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- `AppError::Detail{status, detail, headers}` y atajos (`unauthorized`, `forbidden`, `too_many`…).
- 422: `{"detail":[{"type","loc","msg","input","ctx?"}]}`; `loc` = `["body", …]` / `["query", nombre]` / `["header", nombre]`.
- `ApiJson<T>` (body ausente ⇒ `missing` en `["body"]`; JSON malformado ⇒ `json_invalid`; tipos erróneos ⇒ tipo/campo) y `ApiQuery<T>`.
- 500 ⇒ cuerpo texto plano `Internal Server Error`; fallback 404 `{"detail":"Not Found"}` y 405 `{"detail":"Method Not Allowed"}` con `allow`.
- JSON compacto, UTF-8 sin escapar, `content-type: application/json`.

## Fuera de alcance
- No definir esquemas de dominio (cada endpoint).
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Los `type` usados deben coincidir con Pydantic para los casos comunes: `missing`, `json_invalid`, `literal_error`, `too_long`, `greater_than_equal`, `less_than_equal`, `string_too_long`, `string_too_short`, `int_parsing`, `date_from_datetime_parsing`…; si ADR-008 se acepta con mensajes libres, `type`/`loc` siguen siendo obligatorios.
2. No filtrar internals (rutas, SQL) en 500.

## Contratos e invariantes
- Estado 422 (no 400) para validación; `detail` string para errores de negocio con el texto exacto en español.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/error.rs

**Archivos de referencia (solo lectura):**
- back/app/schemas.py
- docs/migration/evidence/python-baseline/probe-output-2026-10-18.txt

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Una prueba por tipo de error con comparación del JSON completo contra los ejemplos reales de la evidencia.
- Compacidad y UTF-8 (`Falta el token estadístico.`).

## Criterios de aceptación
- [ ] Las salidas coinciden con los ejemplos 422/404/405 de la evidencia (o difieren solo en `msg` si ADR-008 lo permite).
- [ ] Sin `unwrap()` en rutas de error.

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo: `type` de Pydantic desconocidos para algún caso. Rollback: revertir archivo.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:**
- **Archivos modificados:**
- **Pruebas ejecutadas y resultados reales:**
- **Criterios satisfechos y pendientes:**
- **Diferencias detectadas respecto al original:**
- **Decisiones que requieren revisión humana:**
- **Evidencia y commit:**
