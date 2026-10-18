# TASK-0019 · Implementar `form_meta.rs` y `municipios.rs`: allowlist de qids, flujos y slugs de municipio

## Identificación
- **ID:** TASK-0019
- **Título:** Implementar `form_meta.rs` y `municipios.rs`: allowlist de qids, flujos y slugs de municipio
- **Estado:** propuesta
- **Prioridad:** P1
- **Dominio:** Dominio
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** medio
- **Tarea padre:** EPIC-B — Cimientos del crate y pruebas de contrato
- **Dependencias:** TASK-0006, TASK-0009
- **Bloquea a:** TASK-0016, TASK-0033, TASK-0034, TASK-0038

## Objetivo
Portar la validación del cuestionario: cargar `formulario.json`, derivar `VALID_QIDS`, `QID_FLOW`, `FLOW_ORDER`, `INTRO_ORDER`, y normalizar/validar municipios, con el mismo *fallback*.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/form_meta.py:1-88`
- `back/app/analytics.py:25-50`
- `04` §8
- ADR-013

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- ADR-013

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- Resolución de ruta: `FORMULARIO_PATH` o `../front/src/formulario.json` relativo al directorio de trabajo; carga única al arrancar.
- Derivación: `qid = questions[k].qid || k`; flujo por prefijo `pareja_|fam_|trab_`; orden de claves del JSON conservado (`serde_json` con `preserve_order`); `INTRO_ORDER` por claves `age`/`start`.
- *Fallback* (archivo ausente/ inválido/ sin preguntas): 12 preguntas por flujo + `age`,`start` (+ advertencia en log).
- `VALID_QUESTION_IDS = VALID_QIDS ∪ {MINOR,LOCATION,RESULT}`; `qid_ok_for_flow(qid, flow)`.
- `normalize_municipio`: `strip().lower()`, espacios→`-`, eliminar `[^a-z0-9-]`, truncar a 48, `strip('-')`, y validar contra los 52 slugs.

## Fuera de alcance
- No servir el archivo por HTTP.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Copiar los 52 slugs desde `analytics.py:29-41` sin alterar.
2. Vectores para `normalize_municipio` generados con Python (acentos, mayúsculas, símbolos, 100 caracteres).

## Contratos e invariantes
- Mismo orden del embudo que el JSON actual (13/12/12).
- El fallback conserva 12/12/12 (C-06).

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/form_meta.rs
- back-rs/src/municipios.rs
- back-rs/tests/vectors/municipios.json

**Archivos de referencia (solo lectura):**
- back/app/form_meta.py
- back/app/analytics.py
- front/src/formulario.json

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Carga del `formulario.json` real: 39 claves, 13/12/12, orden de intro; archivo inexistente/ vacío/ corrupto ⇒ fallback (CT-093).
- `qid_ok_for_flow` tabla completa: intro, terminales, qid de otro flujo, desconocido, `flow=None`.
- Vectores de municipios.

## Criterios de aceptación
- [ ] Todas las pruebas en verde.
- [ ] Cambiar el `formulario.json` de prueba cambia el resultado sin tocar código.

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo bajo. Rollback: revertir archivos.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:**
- **Archivos modificados:**
- **Pruebas ejecutadas y resultados reales:**
- **Criterios satisfechos y pendientes:**
- **Diferencias detectadas respecto al original:**
- **Decisiones que requieren revisión humana:**
- **Evidencia y commit:**
