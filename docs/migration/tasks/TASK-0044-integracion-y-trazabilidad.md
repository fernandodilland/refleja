# TASK-0044 · Tarea de integración: ensamblado final, suite completa y matriz de trazabilidad

## Identificación
- **ID:** TASK-0044
- **Título:** Tarea de integración: ensamblado final, suite completa y matriz de trazabilidad
- **Estado:** propuesta
- **Prioridad:** P1
- **Dominio:** Integración
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** alto
- **Tarea padre:** EPIC-G — Integración, seguridad, rendimiento y operación
- **Dependencias:** TASK-0008, TASK-0026, TASK-0027, TASK-0028, TASK-0029, TASK-0030, TASK-0031, TASK-0035, TASK-0036, TASK-0037, TASK-0038, TASK-0039, TASK-0040, TASK-0041, TASK-0042, TASK-0043
- **Bloquea a:** TASK-0045, TASK-0046, TASK-0047, TASK-0049

## Objetivo
Verificar globalmente que no se omitió ningún endpoint ni comportamiento, resolver conflictos entre entregas y producir la matriz de trazabilidad endpoint→tarea→prueba.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `09` §4 (reglas de integración)
- `02` (15 rutas)
- `07` (catálogo CT-xxx)

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- Revisar los diffs de todas las tareas contra `01`, ADR y contratos; ejecutar fmt/clippy/test/contract completos.
- Cableado final de `main.rs`/`routes` (único punto donde se admiten ediciones transversales).
- Crear `docs/migration/traceability.md` (EP-xxx, FL-xxx, CT-xxx, P-xx → tarea, archivo, prueba, estado real).
- Registrar desviaciones y quirks restantes con ADR.

## Fuera de alcance
- No añadir funcionalidad nueva.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Ejecutar la suite completa **dos veces** desde BD limpia y comparar volcados.
2. Probar el escenario de punta a punta: front local (`wrangler dev`) contra Rust con Turnstile en bypass.

## Contratos e invariantes
- Ninguna fila de la matriz con estado `verificado` sin evidencia de ejecución.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- docs/migration/traceability.md
- back-rs/src/main.rs (cableado final)

**Archivos de referencia (solo lectura):**
- docs/migration/**

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Suite completa L0–L3.

## Criterios de aceptación
- [ ] 100 % de EP-001…015 y CT definidos pasan; matriz completa; cero `TODO`/`todo!()`/`unimplemented!()` (`grep -rn` vacío).
- [ ] Front real funciona de punta a punta contra Rust (sesión, cuestionario, panel, refresh).

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*
- Comando exacto del harness: ver `back-rs/tests/contract/README.md` (TASK-0007); casos en modo `verify` contra el binario Rust *(propuesto)*
- `grep -rn 'todo!\|unimplemented!' back-rs/src` → sin resultados

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo alto de integración tardía. Rollback: revertir cableado.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:**
- **Archivos modificados:**
- **Pruebas ejecutadas y resultados reales:**
- **Criterios satisfechos y pendientes:**
- **Diferencias detectadas respecto al original:**
- **Decisiones que requieren revisión humana:**
- **Evidencia y commit:**
