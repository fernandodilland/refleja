# TASK-0037 · Implementar `GET /api/platform/realtime`

## Identificación
- **ID:** TASK-0037
- **Título:** Implementar `GET /api/platform/realtime`
- **Estado:** propuesta
- **Prioridad:** P2
- **Dominio:** Platform
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** medio
- **Tarea padre:** EPIC-F — Dominio Platform (panel)
- **Dependencias:** TASK-0007, TASK-0010, TASK-0016, TASK-0020, TASK-0012, TASK-0022, TASK-0024
- **Bloquea a:** TASK-0044

## Objetivo
Visitantes activos, desglose por dispositivo/país y últimas ejecuciones.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/routers/platform.py:137-193`
- `02` EP-010

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- `window_seconds` (5..=900, def. 90), `limit` (1..=100, def. 20) con 422 fuera de rango.
- `by_device`/`by_country` como objetos; clave `"null"` para nulos.
- `recent_runs` por `updated_at DESC` con `seconds_ago = max(int(now-updated_at),0)`.
- CT-073, CT-074.

## Fuera de alcance
- Nada más.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Seguir el alcance incluido; ante dudas de contrato, detenerse y registrar la incógnita en `08`.

## Contratos e invariantes
- Clave `"null"` (quirk, ADR-009).
- Orden de claves del objeto: orden de resultado de la consulta; comparar como mapa.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/routes/platform/realtime.rs
- back-rs/tests/contract/cases/platform/realtime*.json

**Archivos de referencia (solo lectura):**
- back/app/routers/platform.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- CT-073, CT-074; visitantes con `country NULL`.

## Criterios de aceptación
- [ ] CT-073/074 verdes.

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
