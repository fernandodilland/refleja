# TASK-0016 · Implementar `app.rs`, `http/*` y `routes/health.rs`: router, CORS, guard de origen, 307/404/405 y arranque

## Identificación
- **ID:** TASK-0016
- **Título:** Implementar `app.rs`, `http/*` y `routes/health.rs`: router, CORS, guard de origen, 307/404/405 y arranque
- **Estado:** propuesta
- **Prioridad:** P1
- **Dominio:** HTTP
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** alto
- **Tarea padre:** EPIC-B — Cimientos del crate y pruebas de contrato
- **Dependencias:** TASK-0009, TASK-0010, TASK-0011, TASK-0015, TASK-0018, TASK-0019
- **Bloquea a:** TASK-0020, TASK-0026, TASK-0027, TASK-0028, TASK-0029, TASK-0030, TASK-0031, TASK-0035, TASK-0036, TASK-0037, TASK-0038, TASK-0039, TASK-0040, TASK-0041, TASK-0042

## Objetivo
Montar la aplicación Axum con el mismo comportamiento de middleware y de framework que FastAPI/Starlette: orden CORS→guard, preflight, redirección de barra final, 404/405 JSON, `/api/health` y apagado ordenado.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/main.py:26-72`
- `02` §0, EP-001, EP-IMP-1…4
- `evidence/python-baseline/probe-output-2026-10-18.txt`
- `07` CT-001…009

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- ADR-011 (sin docs)
- ADR-015 (límite de body/timeouts)
- ADR-018 (logging sin IP)
- ADR-009

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- `AppState` (settings, pool, cliente Turnstile, rate limiter, form_meta) y `build_router(state)`; rutas bajo `/api`.
- CORS exacto (orígenes de config, credenciales, métodos `GET,POST,OPTIONS`, cabeceras `Authorization, Content-Type, X-Refleja-Token`, max-age 600; respuestas de preflight: 200 `text/plain` «OK» o 400 «Disallowed CORS origin»; `Vary: Origin`).
- Guard de origen **dentro** de CORS: si `ORIGIN_SECRET` ≠ vacío, rutas `/api*` salvo `OPTIONS` exigen la cabecera ⇒ 403 `{"detail":"Origen no autorizado."}` (con cabeceras CORS).
- Redirección 307 de `/x/` → `/x` solo cuando `/x` existe (conservando query); 404/405 JSON (fallbacks).
- `GET /api/health` ⇒ `{"status":"ok","env":<ENV>}`.
- `RequestBodyLimit`, timeout de petición, `TraceLayer` sin cabeceras/IP; `main.rs` (cableado mínimo: config → pool → verify_schema → serve en `APP_HOST:APP_PORT`, apagado con SIGTERM/SIGINT).
- Comparación del secreto de origen en tiempo constante.

## Fuera de alcance
- No implementar rutas de dominio ni extractores de auth.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Cada `routes/*/mod.rs` ya existe (TASK-0006); aquí solo se monta `routes::router(state)`.
2. Comprobar con el harness CT-001…009 contra Rust.

## Contratos e invariantes
- Respuesta 403 del guard lleva cabeceras CORS.
- Ninguna ruta de docs en ningún `ENV`.
- El proceso escucha por defecto en `127.0.0.1:20832`.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/app.rs
- back-rs/src/http/mod.rs
- back-rs/src/http/cors.rs
- back-rs/src/http/origin_guard.rs
- back-rs/src/routes/mod.rs (solo lógica de montaje)
- back-rs/src/routes/health.rs
- back-rs/src/main.rs (cableado)

**Archivos de referencia (solo lectura):**
- back/app/main.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Casos de contrato CT-001…009 (goldens de TASK-0008) en modo `verify`.
- Cierre ordenado: petición en vuelo termina al enviar SIGTERM.

## Criterios de aceptación
- [ ] CT-001…009 verdes contra el binario Rust.
- [ ] El binario arranca con `.env` de desarrollo y responde `/api/health`.
- [ ] Sin IP ni cabeceras en logs (revisión de salida).

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo alto de diferencias sutiles de CORS/307 → casos de contrato obligatorios. Rollback: revertir archivos.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:**
- **Archivos modificados:**
- **Pruebas ejecutadas y resultados reales:**
- **Criterios satisfechos y pendientes:**
- **Diferencias detectadas respecto al original:**
- **Decisiones que requieren revisión humana:**
- **Evidencia y commit:**
