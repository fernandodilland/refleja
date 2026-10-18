# TASK-0049 · Actualizar documentación operativa: READMEs, tareas de VS Code y referencias

## Identificación
- **ID:** TASK-0049
- **Título:** Actualizar documentación operativa: READMEs, tareas de VS Code y referencias
- **Estado:** propuesta
- **Prioridad:** P3
- **Dominio:** Documentación
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** bajo
- **Tarea padre:** EPIC-G — Integración, seguridad, rendimiento y operación
- **Dependencias:** TASK-0044
- **Bloquea a:** ninguna

## Objetivo
Que la documentación del repo describa el backend Rust y corrija las contradicciones C-01, C-02 y C-07 detectadas.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- C-01, C-02, C-07 en `08`
- `README.md` raíz líneas 72-87
- `.vscode/tasks.json`
- `back/README.md`

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- Actualizar `README.md` raíz (estructura, cómo correr), añadir `back-rs/README.md` definitivo, tareas/lanzadores de `.vscode/`, y un aviso en `back/README.md` sobre el estado del backend Python.
- Corregir las contradicciones C-01 (8 tablas), C-02 (`/logins`), C-07 (`venv` vs `.venv`).

## Fuera de alcance
- No borrar `back/`.
- No modificar `back-rs/src` ni `Cargo.toml`.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Seguir el alcance incluido; ante dudas de contrato, detenerse y registrar la incógnita en `08`.

## Contratos e invariantes
- El puerto local de desarrollo sigue siendo 20832 (el front lo asume).

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- README.md
- back-rs/README.md
- .vscode/*.json
- back/README.md (aviso)

**Archivos de referencia (solo lectura):**
- docs/migration/**

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Seguir el README desde cero en una máquina limpia (o la actual) y registrar que funciona.

## Criterios de aceptación
- [ ] Comandos del README verificados con salida real.
- [ ] C-01, C-02, C-07 cerrados en `08`.

## Verificación
- Ejecución literal de los comandos documentados.

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
