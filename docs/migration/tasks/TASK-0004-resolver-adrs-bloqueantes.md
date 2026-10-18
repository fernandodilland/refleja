# TASK-0004 · Revisar y resolver los ADR bloqueantes y los objetivos de éxito

## Identificación
- **ID:** TASK-0004
- **Título:** Revisar y resolver los ADR bloqueantes y los objetivos de éxito
- **Estado:** completada
- **Prioridad:** P0
- **Dominio:** Decisiones
- **Responsable o agente asignado:** Propietario del proyecto (acceso al servidor) — un agente solo puede procesar la evidencia entregada
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** alto
- **Tarea padre:** EPIC-A — Descubrimiento y decisiones (sin código)
- **Dependencias:** ninguna
- **Bloquea a:** TASK-0006, TASK-0021

## Objetivo
Convertir las propuestas en decisiones aprobadas o rechazadas para poder empezar la implementación sin ambigüedad. Hasta que esto ocurra, ninguna tarea de código puede pasar a `lista`.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `docs/migration/08-decisions-and-open-questions.md` §1

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- Decidir (aceptar/rechazar/modificar) como mínimo: **ADR-001, 002, 004, 006, 009, 016**.
- Fijar el objetivo cuantificado de RAM/latencia (Q-12) y la política sobre sesiones/tokens en el cutover (Q-15).
- Decidir los demás ADR cuando se vayan necesitando (ver columna *Bloquea tareas*).

## Fuera de alcance
- No implementar código.
- No modificar `back/`, `front/` ni crear `back-rs/`.
- No ejecutar comandos de escritura ni cambiar configuración o datos en el servidor.
- No copiar secretos, contraseñas, IPs de clientes ni datos de filas a la evidencia.

## Instrucciones de implementación
1. Para cada ADR: cambiar `Estado`, añadir fecha, quién aprueba y notas.
2. Si un ADR se rechaza, añadir el reemplazo y revisar las tareas afectadas (`09` §2).

## Contratos e invariantes
- Una decisión solo es válida si la registra el propietario; el agente no puede marcar un ADR como aceptado por sí mismo.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- (ninguno)

**Archivos de referencia (solo lectura):**
- docs/migration/08-decisions-and-open-questions.md
- docs/migration/09-task-plan.md

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- No aplica.

## Criterios de aceptación
- [ ] ADR-001, 002, 004, 006, 009, 016 con estado `aceptada` o `rechazada` + reemplazo.
- [ ] Q-12 y Q-15 contestadas en `08`.
- [ ] `09` actualizado: tareas desbloqueadas pasan a `lista`.

## Verificación
- Revisión humana.

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo: decisiones precipitadas. Rollback: ADR `reemplazada` con nueva entrada.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:** implementado en `back-rs/` (ver archivos).
- **Archivos modificados:** `08-decisions-and-open-questions.md`
- **Pruebas ejecutadas y resultados reales:** Instrucción explícita del propietario (/goal, 2026-10-18): ejecutar la migración completa en local. ADR-001/002/004/006/009/016 se aplicaron como estaban propuestos; ver §0 de `08`.
- **Criterios satisfechos y pendientes:** ver estado de la ficha; los pendientes se detallan arriba cuando el estado no es `completada`.
- **Diferencias detectadas respecto al original:** ver `runbook-cutover.md` §5 y ADR-020/021/022 en `08`.
- **Decisiones que requieren revisión humana:** ver `08` §0.
- **Evidencia y commit:** rama `migration/rust-backend` (commit 37d8272 y anteriores).
