# TASK-0048 · Redactar el runbook de despliegue gradual y conmutación (cutover) con criterios go/no-go

## Identificación
- **ID:** TASK-0048
- **Título:** Redactar el runbook de despliegue gradual y conmutación (cutover) con criterios go/no-go
- **Estado:** propuesta
- **Prioridad:** P1
- **Dominio:** Operación
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** alto
- **Tarea padre:** EPIC-G — Integración, seguridad, rendimiento y operación
- **Dependencias:** TASK-0045, TASK-0046, TASK-0047
- **Bloquea a:** TASK-0050

## Objetivo
Definir paso a paso cómo pasar el tráfico de Python a Rust con verificación y vuelta atrás, para que el propietario lo ejecute con confianza.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- ADR-017
- `06`
- Q-15

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- ADR-017 aceptada
- Q-15 respondida

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- Fases: preflight (backup, versión de esquema, secretos idénticos), *shadow* en puerto alterno (health + lectura de panel con admin de prueba), conmutación del reverse proxy, observación (métricas a mirar y umbrales), rollback inmediato, retiro diferido de Python.
- Checklist go/no-go con criterios medibles (error rate, p95, RSS, conteos coherentes entre ambos backends en la ventana compartida).
- Plan de comunicación.

## Fuera de alcance
- No ejecutar el cutover.
- No modificar `back-rs/src` ni `Cargo.toml`.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Seguir el alcance incluido; ante dudas de contrato, detenerse y registrar la incógnita en `08`.

## Contratos e invariantes
- Los tokens existentes siguen válidos (mismos secretos); si Q-15 permite cerrarlos, documentarlo.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- docs/migration/runbook-cutover.md

**Archivos de referencia (solo lectura):**
- docs/migration/06-runtime-and-deployment.md

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Simulacro de lectura («tabletop») con el propietario y registro de observaciones.

## Criterios de aceptación
- [ ] Runbook aprobado por el propietario por escrito en el archivo (fecha/nombre).
- [ ] Cada paso tiene comando, resultado esperado y condición de aborto.

## Verificación
- Revisión humana.

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo: omitir un paso de rollback. Rollback: n/a (documento).

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:**
- **Archivos modificados:**
- **Pruebas ejecutadas y resultados reales:**
- **Criterios satisfechos y pendientes:**
- **Diferencias detectadas respecto al original:**
- **Decisiones que requieren revisión humana:**
- **Evidencia y commit:**
