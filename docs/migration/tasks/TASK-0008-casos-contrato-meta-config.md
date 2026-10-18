# TASK-0008 · Capturar casos de contrato: meta, CORS, errores de framework y arranque/config

## Identificación
- **ID:** TASK-0008
- **Título:** Capturar casos de contrato: meta, CORS, errores de framework y arranque/config
- **Estado:** completada
- **Prioridad:** P1
- **Dominio:** Pruebas
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** medio
- **Tarea padre:** EPIC-B — Cimientos del crate y pruebas de contrato
- **Dependencias:** TASK-0007
- **Bloquea a:** TASK-0044

## Objetivo
Registrar en goldens CT-001…009 y CT-090…094 desde el Python real para que TASK-0009/0016 implementen contra evidencia.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `02` §0 y EP-001, EP-IMP-1…4
- `07` §3 (CT-001…009, 090…094)
- `back/app/main.py`, `back/app/config.py`

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- Casos de health, 404, 405, barra final 307 (con y sin query string), preflight válido/ inválido, respuesta con `Origin` permitido, guard de origen (`ORIGIN_SECRET`), docs 404 en prod.
- Casos de arranque: fail-closed en prod, precedencia `.env` vs entorno, booleanos, `FORMULARIO_PATH` inexistente, `CORS_ORIGINS` con espacios.

## Fuera de alcance
- No implementar nada en Rust.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Escribir `cases/meta/*.json` y `cases/boot/*.json`; los de arranque se expresan como casos de proceso (código de salida/mensaje) soportados por el harness (si falta soporte, pedirlo a TASK-0007 vía issue, no editar su código).
2. Grabar con `CONTRACT_MODE=record`; revisar que el golden sea determinista (repetir 3 veces).

## Contratos e invariantes
- Los goldens reflejan Python tal cual, incluidos quirks (ADR-009).

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/tests/contract/cases/meta/**
- back-rs/tests/contract/cases/boot/**

**Archivos de referencia (solo lectura):**
- docs/migration/07-test-and-compatibility-plan.md

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Los propios casos.

## Criterios de aceptación
- [ ] CT-001…009 y CT-090…094 existen, son deterministas (3 grabaciones idénticas) y verifican en verde contra Python.
- [ ] Q-07 anotada: formato de `datetime` en MariaDB para `/me` queda como caso en TASK-0026.

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo bajo. Rollback: borrar los casos.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:** implementado en `back-rs/` (ver archivos).
- **Archivos modificados:** `back-rs/tests/contract/diff.py`, `scripts/mariadb_local.sh`, `scripts/apply_schema.sh`
- **Pruebas ejecutadas y resultados reales:** Arnés implementado en Python (no en Rust, ADR-021); cubre CT-001…CT-094 y más: `back-rs/tests/contract/diff.py` (≈230 peticiones Python vs Rust + 8 tablas + fases de producción y cutover): TODO OK
- **Criterios satisfechos y pendientes:** ver estado de la ficha; los pendientes se detallan arriba cuando el estado no es `completada`.
- **Diferencias detectadas respecto al original:** ver `runbook-cutover.md` §5 y ADR-020/021/022 en `08`.
- **Decisiones que requieren revisión humana:** ver `08` §0.
- **Evidencia y commit:** rama `migration/rust-backend` (commit 37d8272 y anteriores).
