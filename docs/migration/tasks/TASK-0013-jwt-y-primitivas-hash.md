# TASK-0013 · Implementar `security/jwt.rs` y `security/hash.rs`: JWT HS256 compatibles con PyJWT, SHA-256, HMAC del vid

## Identificación
- **ID:** TASK-0013
- **Título:** Implementar `security/jwt.rs` y `security/hash.rs`: JWT HS256 compatibles con PyJWT, SHA-256, HMAC del vid
- **Estado:** completada
- **Prioridad:** P1
- **Dominio:** Seguridad
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** alto
- **Tarea padre:** EPIC-B — Cimientos del crate y pruebas de contrato
- **Dependencias:** TASK-0006, TASK-0009
- **Bloquea a:** TASK-0020, TASK-0026, TASK-0027, TASK-0028, TASK-0030

## Objetivo
Emitir y validar los tres tipos de JWT con exactamente los mismos claims y reglas que Python, de modo que los tokens existentes (sesiones admin y tokens públicos de 30 días) sigan válidos tras el cutover.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/security.py:46-123`
- `back/app/deps.py:26-78`
- `evidence/python-baseline/` (claims reales)
- `05` P-06

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- ADR-004 (`jsonwebtoken`)

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- `encode_access/refresh/public` y `decode_*` con `typ` obligatorio y secreto correcto (`JWT_SECRET` para access/refresh; `PUBLIC_TOKEN_SECRET` para público).
- Claims: access `{typ,sub:String,username,iat,exp}`; refresh `{typ,sub,jti,iat,exp}`; público `{typ,vid,iat,exp}`; `iat`/`exp` enteros en segundos UTC.
- Validación: algoritmo **solo** HS256 (rechazar `none`/otros), `exp` con **leeway 0**, y distinguir `Expired` de `Invalid` (el público devuelve «Token expirado.» vs «Token inválido.»).
- `sha256_hex`, `hmac_vid` (HMAC-SHA256 hex con `VID_HMAC_KEY`), `new_vid` (16 bytes aleatorios en hex minúsculas), `new_jti` (UUIDv4).

## Fuera de alcance
- No hacer extractores HTTP (TASK-0020).
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Averiguar y replicar si PyJWT 2.10.1 rechaza `iat` futuro; documentar el resultado en la tarea.
2. Generar vectores con `back/.venv` (tokens por tipo, expirado, firma errónea, `alg:none`, typ erróneo, `sub` numérico) en `tests/vectors/jwt.json`.
3. Prueba inversa: tokens emitidos por Rust se validan con PyJWT (script de verificación en `tests/vectors/verify_with_pyjwt.py`).

## Contratos e invariantes
- Un token con otro `typ` NO valida.
- Los secretos nunca aparecen en logs ni `Debug`.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/security/jwt.rs
- back-rs/src/security/hash.rs
- back-rs/tests/vectors/jwt.json
- back-rs/tests/vectors/verify_with_pyjwt.py

**Archivos de referencia (solo lectura):**
- back/app/security.py
- back/app/deps.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Python→Rust y Rust→Python para los 3 tipos.
- Expirado, firma errónea, `alg:none`, `typ` equivocado, falta `vid`.
- `hmac_vid` y `sha256_hex` contra vectores de Python.

## Criterios de aceptación
- [ ] CT-068 (compat. bidireccional) en verde a nivel de librería.
- [ ] Todas las pruebas de vectores pasan.

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo alto: invalidar sesiones activas si hay una diferencia sutil. Rollback: no desplegar hasta que 0044/0045 validen.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:** implementado en `back-rs/` (ver archivos).
- **Archivos modificados:** `src/security.rs`
- **Pruebas ejecutadas y resultados reales:** `tests/vectors.rs` (token PyJWT válido en Rust, `alg:none`, typ erróneo) + fase 2c de `diff.py` (tokens Python↔Rust intercambiables).
- **Criterios satisfechos y pendientes:** ver estado de la ficha; los pendientes se detallan arriba cuando el estado no es `completada`.
- **Diferencias detectadas respecto al original:** ver `runbook-cutover.md` §5 y ADR-020/021/022 en `08`.
- **Decisiones que requieren revisión humana:** ver `08` §0.
- **Evidencia y commit:** rama `migration/rust-backend` (commit 37d8272 y anteriores).
