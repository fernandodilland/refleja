# TASK-0017 · Implementar `http/client.rs`: IP, país y parsers de User-Agent idénticos a Python

## Identificación
- **ID:** TASK-0017
- **Título:** Implementar `http/client.rs`: IP, país y parsers de User-Agent idénticos a Python
- **Estado:** completada
- **Prioridad:** P1
- **Dominio:** HTTP
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** bajo
- **Tarea padre:** EPIC-B — Cimientos del crate y pruebas de contrato
- **Dependencias:** TASK-0006
- **Bloquea a:** TASK-0026, TASK-0030, TASK-0031, TASK-0035

## Objetivo
Portar `client_country`, `client_ip`, `device_from_ua`, `browser_from_ua` y `os_from_ua` con exactitud, incluidos sus casos límite.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/deps.py:11-23`
- `back/app/analytics.py:21-23,53-92`

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- `client_country`: `CF-IPCountry` con longitud 2 y distinto de `XX`/`T1` ⇒ mayúsculas; si no, `None`.
- `client_ip`: `CF-Connecting-IP` o IP del socket; `None` si no hay.
- `device_from_ua`: tablet (`iPad|Tablet`, sin distinguir mayúsculas) antes que mobile (`Mobi|Android|iPhone|iPod`), por defecto `desktop`, UA vacío ⇒ `desktop`.
- `browser_from_ua` (orden: Edg, OPR/Opera, Chrome sin Chromium, Firefox, Safari, «Otro»; UA vacío ⇒ `None`) y `os_from_ua` (Windows, iOS, macOS, Android, Linux, «Otro»).

## Fuera de alcance
- No depender de librerías de parsing de UA.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Generar con `back/.venv` un corpus ≥60 UAs (Chrome/Firefox/Safari/Edge/Opera, iOS/Android/Linux/Windows/macOS, bots, vacío) y sus resultados en `tests/vectors/ua.json`.

## Contratos e invariantes
- Las comparaciones de subcadena son sensibles a mayúsculas salvo los regex marcados `re.I`.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/http/client.rs
- back-rs/tests/vectors/ua.json

**Archivos de referencia (solo lectura):**
- back/app/analytics.py
- back/app/deps.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Vectores UA completos; país `xx`, `XX`, `T1`, `mx`, `MEX`, vacío.

## Criterios de aceptación
- [ ] 100 % de coincidencia con los vectores de Python.

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo bajo.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:** implementado en `back-rs/` (ver archivos).
- **Archivos modificados:** `src/client.rs`
- **Pruebas ejecutadas y resultados reales:** `tests/vectors.rs` (12 UAs con resultados de Python) + paridad de `admin_login`/`visitor` en el volcado de tablas.
- **Criterios satisfechos y pendientes:** ver estado de la ficha; los pendientes se detallan arriba cuando el estado no es `completada`.
- **Diferencias detectadas respecto al original:** ver `runbook-cutover.md` §5 y ADR-020/021/022 en `08`.
- **Decisiones que requieren revisión humana:** ver `08` §0.
- **Evidencia y commit:** rama `migration/rust-backend` (commit 37d8272 y anteriores).
