# TASK-0045 · Revisión de seguridad y pruebas de seguridad del backend Rust

## Identificación
- **ID:** TASK-0045
- **Título:** Revisión de seguridad y pruebas de seguridad del backend Rust
- **Estado:** en revisión
- **Prioridad:** P1
- **Dominio:** Seguridad
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** alto
- **Tarea padre:** EPIC-G — Integración, seguridad, rendimiento y operación
- **Dependencias:** TASK-0044
- **Bloquea a:** TASK-0048

## Objetivo
Demostrar paridad de P-01…P-15 y evaluar S-01…S-15 sobre el código Rust; ejecutar auditoría de dependencias.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `05-security-review.md`

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- Pruebas en `tests/security/`: fail-closed, bypass imposible en prod, `alg:none`/otro `typ`, reuso de refresh, enumeración por tiempo, cookie flags, CORS, límites de body, logs sin IP/secretos (inspección de salida), `cargo audit`/`cargo deny`.
- Revisión de `unsafe` (debe ser 0) y de manejo de errores (`unwrap`/`expect` en rutas de petición).
- Actualizar `05` con resultados y hallazgos nuevos.

## Fuera de alcance
- No explotar sistemas reales; solo pruebas locales.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Seguir el alcance incluido; ante dudas de contrato, detenerse y registrar la incógnita en `08`.

## Contratos e invariantes
- Cualquier mejora (S-01…S-07) sin ADR aceptado se registra como recomendación, no se implementa.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/tests/security/**

**Archivos de referencia (solo lectura):**
- docs/migration/05-security-review.md

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Las anteriores.

## Criterios de aceptación
- [ ] Cada P-xx tiene al menos una prueba o justificación; `cargo audit` sin vulnerabilidades altas abiertas; informe en `05` actualizado.

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*
- Comando exacto del harness: ver `back-rs/tests/contract/README.md` (TASK-0007); casos en modo `verify` contra el binario Rust *(propuesto)*
- `cargo audit` *(si está instalado; si no, instalar y registrar versión)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Sin riesgo de datos: no se toca producción. Rollback: revertir los commits de la tarea (los archivos son nuevos y propios).

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:** implementado en `back-rs/` (ver archivos).
- **Archivos modificados:** `tests/contract/diff.py`, `tests/vectors.rs`
- **Pruebas ejecutadas y resultados reales:** Cubiertos P-01…P-08, P-12…P-15 con pruebas; **pendiente**: `cargo audit/deny` (no instalado) y revisión humana. Hallazgos nuevos: ver `05` §5.
- **Criterios satisfechos y pendientes:** ver estado de la ficha; los pendientes se detallan arriba cuando el estado no es `completada`.
- **Diferencias detectadas respecto al original:** ver `runbook-cutover.md` §5 y ADR-020/021/022 en `08`.
- **Decisiones que requieren revisión humana:** ver `08` §0.
- **Evidencia y commit:** rama `migration/rust-backend` (commit 37d8272 y anteriores).
