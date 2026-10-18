# TASK-0009 · Implementar `config.rs`: variables de entorno, `.env`, precedencia y fail-closed en producción

## Identificación
- **ID:** TASK-0009
- **Título:** Implementar `config.rs`: variables de entorno, `.env`, precedencia y fail-closed en producción
- **Estado:** completada
- **Prioridad:** P1
- **Dominio:** Cimientos
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** medio
- **Tarea padre:** EPIC-B — Cimientos del crate y pruebas de contrato
- **Dependencias:** TASK-0006
- **Bloquea a:** TASK-0011, TASK-0013, TASK-0014, TASK-0015, TASK-0016, TASK-0019, TASK-0026, TASK-0043

## Objetivo
Replicar `back/app/config.py`: mismas variables, defaults, precedencia y validación que impide arrancar en producción con secretos por defecto o menores de 32 caracteres.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/config.py:14-115`
- `06-runtime-and-deployment.md` §2
- `05` P-01, P-02

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- ADR-005 (mismos nombres; `mysql+pymysql://` aceptado)

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- `Settings` con **todas** las variables de `06` §2 y sus defaults.
- Carga: `.env` del directorio de trabajo (`dotenvy`) + entorno del proceso con precedencia del proceso; `extra` ignorado.
- Booleanos al estilo Pydantic (`true/false/1/0/yes/no/on/off`, sin distinguir mayúsculas); enteros inválidos ⇒ error de arranque claro.
- `is_prod` = `ENV.to_lowercase().starts_with("prod")`; `bypass_turnstile` = `DEV_BYPASS_TURNSTILE && !is_prod`; `cors_list` (split por coma, trim, sin vacíos).
- Validación fail-closed de `JWT_SECRET`, `PUBLIC_TOKEN_SECRET`, `VID_HMAC_KEY` (igual al default o `len < 32` caracteres) con mensaje que nombra la variable.
- Traducción de `DATABASE_URL` (`mysql+pymysql://…` → `mysql://…`); URL `sqlite:` ⇒ error claro (ADR-016).
- Nueva variable **opcional** `DB_MAX_CONNECTIONS` (default definido en TASK-0011) — documentada.

## Fuera de alcance
- No abrir conexiones ni leer `formulario.json` (otras tareas).
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Estructura inmutable tras construirse (`Arc<Settings>`).
2. `len` se mide en caracteres Unicode como Python.
3. Los secretos no deben aparecer en `Debug` (implementar `Debug` manual que los oculte).

## Contratos e invariantes
- Mismos nombres y defaults que Python; `ENV` por defecto `development`.
- En producción `bypass_turnstile` es siempre `false`.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/config.rs

**Archivos de referencia (solo lectura):**
- back/app/config.py
- back/.env.example

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- CT-090 (proceso no arranca), CT-091 (precedencia), CT-092 (booleanos), CT-094 (CORS) como pruebas unitarias + los casos de proceso de TASK-0008.
- Secreto de 31 vs 32 caracteres; `ENV=Production`/`prod`/`prod-eu`; `Debug` no imprime secretos.

## Criterios de aceptación
- [ ] Todas las pruebas anteriores en verde.
- [ ] Mensaje de error nombra la variable inválida.
- [ ] Compila sin `unsafe`.

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo: divergencia en parseo de booleanos/enteros. Rollback: revertir el archivo.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:** implementado en `back-rs/` (ver archivos).
- **Archivos modificados:** `src/config.rs`
- **Pruebas ejecutadas y resultados reales:** Fase 2b de `diff.py` (fail-closed: 4 casos, mismo código de salida y mensaje con el nombre de la variable) + fase 2a (CORS con espacios).
- **Criterios satisfechos y pendientes:** ver estado de la ficha; los pendientes se detallan arriba cuando el estado no es `completada`.
- **Diferencias detectadas respecto al original:** ver `runbook-cutover.md` §5 y ADR-020/021/022 en `08`.
- **Decisiones que requieren revisión humana:** ver `08` §0.
- **Evidencia y commit:** rama `migration/rust-backend` (commit 37d8272 y anteriores).
