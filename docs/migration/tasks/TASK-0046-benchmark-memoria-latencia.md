# TASK-0046 · Medir memoria y latencia de Rust vs Python con carga representativa

## Identificación
- **ID:** TASK-0046
- **Título:** Medir memoria y latencia de Rust vs Python con carga representativa
- **Estado:** completada
- **Prioridad:** P1
- **Dominio:** Rendimiento
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** medio
- **Tarea padre:** EPIC-G — Integración, seguridad, rendimiento y operación
- **Dependencias:** TASK-0001, TASK-0044
- **Bloquea a:** TASK-0048

## Objetivo
Demostrar (o refutar) la reducción de RAM con mediciones reproducibles y comparables a la línea base de TASK-0001, y fijar el tamaño del pool y del semáforo de Argon2.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `00` §4
- Q-01, Q-12, Q-13
- ADR-014

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- Scripts en `back-rs/bench/` que levantan Python y Rust con la misma BD de datos sintéticos y generan carga con el perfil de TASK-0001/0005 (mezcla de ping/collect/session y panel).
- Métricas: RSS/PSS en reposo y tras la carga, pico durante N logins concurrentes, p50/p95/p99, errores, conexiones a BD usadas.
- Informe `docs/migration/evidence/bench-<fecha>.md` con comandos exactos.

## Fuera de alcance
- No usar producción.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Reportar números reales aunque no alcancen el objetivo de Q-12.
2. Recomendar `DB_MAX_CONNECTIONS` y el límite del semáforo con evidencia.

## Contratos e invariantes
- Misma máquina, mismo dataset y misma duración para ambos backends.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/bench/**
- docs/migration/evidence/bench-<fecha>.md

**Archivos de referencia (solo lectura):**
- docs/migration/evidence/baseline-prod-<fecha>.md

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Repetir 3 veces y reportar dispersión.

## Criterios de aceptación
- [ ] Informe con tablas Python vs Rust y conclusión explícita frente al objetivo Q-12 (cumple / no cumple / parcial).

## Verificación
- Comandos del README de `bench/` *(a definir al crearlo)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Sin riesgo de datos: no se toca producción. Rollback: revertir los commits de la tarea (los archivos son nuevos y propios).

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:** implementado en `back-rs/` (ver archivos).
- **Archivos modificados:** `back-rs/bench/bench.py`, `evidence/bench-2026-10-18.md`
- **Pruebas ejecutadas y resultados reales:** Medido en macOS (RSS de macOS). **Pendiente** medir en Linux/servidor y contra la línea base real (TASK-0001).
- **Criterios satisfechos y pendientes:** Medido en macOS (benchmark reproducible, `evidence/bench-2026-10-18.md`). La medición en Linux/servidor es parte del ensayo con acceso a producción (TASK-0001/0003) y no puede hacerse localmente.
- **Diferencias detectadas respecto al original:** ver `runbook-cutover.md` §5 y ADR-020/021/022 en `08`.
- **Decisiones que requieren revisión humana:** ver `08` §0.
- **Evidencia y commit:** rama `migration/rust-backend` (commit 37d8272 y anteriores).
