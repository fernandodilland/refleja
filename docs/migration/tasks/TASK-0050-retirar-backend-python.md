# TASK-0050 · Retirar el backend Python (solo con autorización explícita tras un cutover estable)

## Identificación
- **ID:** TASK-0050
- **Título:** Retirar el backend Python (solo con autorización explícita tras un cutover estable)
- **Estado:** bloqueada
- **Prioridad:** P3
- **Dominio:** Cierre
- **Responsable o agente asignado:** Propietario del proyecto (acceso al servidor) — un agente solo puede procesar la evidencia entregada
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** alto
- **Tarea padre:** EPIC-G — Integración, seguridad, rendimiento y operación
- **Dependencias:** TASK-0048
- **Bloquea a:** ninguna

## Objetivo
Eliminar `back/` y su despliegue una vez que el backend Rust haya operado estable durante el periodo acordado, conservando la historia en git.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- ADR-001/002/017
- `09` §1

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Autorización explícita del propietario con fecha y criterio de estabilidad (por definir).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- Crear una etiqueta git del último commit con Python (`python-backend-final`), retirar `back/`, `back/deploy*`, referencias en docs y `.gitignore`, y actualizar `README.md`.
- Verificar que nada del front o de la documentación referencia `back/`.

## Fuera de alcance
- No tocar `back-rs/`, `front/` ni la base de datos.
- No modificar `back-rs/src` ni `Cargo.toml`.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Seguir el alcance incluido; ante dudas de contrato, detenerse y registrar la incógnita en `08`.

## Contratos e invariantes
- Reversible vía la etiqueta git.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- (ninguno)

**Archivos de referencia (solo lectura):**
- back/**

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Búsqueda de referencias residuales (`grep -rn 'back/app\|uvicorn' .`).

## Criterios de aceptación
- [ ] Autorización registrada por escrito en esta ficha.
- [ ] Etiqueta creada; repo sin referencias huérfanas; Rust sigue sano tras el retiro (healthcheck).

## Verificación
- `git tag --list python-backend-final`
- `grep -rn 'uvicorn' . --include=*.md --include=*.json --include=*.sh` → solo referencias históricas

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo: perder la capacidad de rollback rápido. Mitigación: etiqueta + conservar el servicio Python parado N días antes de borrar.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:**
- **Archivos modificados:**
- **Pruebas ejecutadas y resultados reales:**
- **Criterios satisfechos y pendientes:**
- **Diferencias detectadas respecto al original:**
- **Decisiones que requieren revisión humana:**
- **Evidencia y commit:**
