# TASK-0031 · Implementar `POST /api/public/ping`

## Identificación
- **ID:** TASK-0031
- **Título:** Implementar `POST /api/public/ping`
- **Estado:** propuesta
- **Prioridad:** P1
- **Dominio:** Public
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** bajo
- **Tarea padre:** EPIC-E — Dominio Public (estadística)
- **Dependencias:** TASK-0007, TASK-0010, TASK-0016, TASK-0017, TASK-0018, TASK-0020, TASK-0022
- **Bloquea a:** TASK-0044

## Objetivo
Señal de vida: actualizar `last_seen_at` sin consumir cuotas.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/routers/public.py:100-124`
- `02` EP-003
- `03` FL-02

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- Extractor `PublicVid`; rate limit `ping:<vid_h>` 30/min ⇒ 429 «Demasiadas señales.»; `get_or_create` (sin sumar `new_visitors`) + `touch`; `{"ok":true}`.
- CT-015…018.

## Fuera de alcance
- No tocar cuotas, eventos ni contadores.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Seguir el alcance incluido; ante dudas de contrato, detenerse y registrar la incógnita en `08`.

## Contratos e invariantes
- Si el visitante no existe se crea (comportamiento actual).

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/routes/public/ping.rs
- back-rs/tests/contract/cases/public/ping*.json

**Archivos de referencia (solo lectura):**
- back/app/routers/public.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- CT-015…018; visitante inexistente se crea con país/device del request.

## Criterios de aceptación
- [ ] CT-015…018 verdes.

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
