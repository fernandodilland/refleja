# TASK-0020 · Implementar `http/extract.rs`: extractores `PublicVid` y `AdminUser` con los mismos errores

## Identificación
- **ID:** TASK-0020
- **Título:** Implementar `http/extract.rs`: extractores `PublicVid` y `AdminUser` con los mismos errores
- **Estado:** completada
- **Prioridad:** P1
- **Dominio:** Seguridad
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** alto
- **Tarea padre:** EPIC-B — Cimientos del crate y pruebas de contrato
- **Dependencias:** TASK-0013, TASK-0016, TASK-0025
- **Bloquea a:** TASK-0029, TASK-0031, TASK-0035, TASK-0036, TASK-0037, TASK-0038, TASK-0039, TASK-0040, TASK-0041, TASK-0042

## Objetivo
Replicar `require_public_vid` y `require_admin` (y su orden respecto a la validación de body/query) como extractores de Axum.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/deps.py:26-78`
- `02` EP-003, EP-008
- `evidence/python-baseline/probe-output-2026-10-18.txt`

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- `PublicVid`: 401 `«Falta el token estadístico.»` si no hay cabecera `X-Refleja-Token`; `«Token expirado.»`; `«Token inválido.»` (firma, typ, sin `vid`).
- `AdminUser`: 401 `«No autenticado.»` (+`WWW-Authenticate: Bearer`) si falta cabecera o esquema ≠ `bearer` (insensible a mayúsculas); `«Sesión inválida o expirada.»` (+cabecera) ante cualquier error JWT; `«Usuario no válido.»` si el usuario no existe o `is_active=false` (consulta a BD por `sub`).
- **Orden**: los extractores de auth deben ejecutarse **antes** que los de body/query (ordenar parámetros del handler o usar `from_request` con auth primero) para que 401 preceda a 422.

## Fuera de alcance
- No implementar endpoints.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Probar con un handler de prueba que combine auth + `ApiJson` inválido.

## Contratos e invariantes
- `split(" ",1)[1].strip()` para extraer el token; el prefijo `bearer ` se compara en minúsculas.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/http/extract.rs

**Archivos de referencia (solo lectura):**
- back/app/deps.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- CT-015, CT-016, CT-066, CT-067, CT-070, CT-081 (a nivel de extractor con BD de prueba).
- 401 antes que 422.

## Criterios de aceptación
- [ ] Todos los mensajes y cabeceras coinciden con la evidencia.
- [ ] Admin desactivado ⇒ 401 inmediato.

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo alto: un error aquí abre o cierra todo el panel → revisión por TASK-0045.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:** implementado en `back-rs/` (ver archivos).
- **Archivos modificados:** `src/http/extract.rs`
- **Pruebas ejecutadas y resultados reales:** 401 antes que 422, usuario inactivo/ inexistente, `sub` no string, token expirado: `back-rs/tests/contract/diff.py` (≈230 peticiones Python vs Rust + 8 tablas + fases de producción y cutover): TODO OK
- **Criterios satisfechos y pendientes:** ver estado de la ficha; los pendientes se detallan arriba cuando el estado no es `completada`.
- **Diferencias detectadas respecto al original:** ver `runbook-cutover.md` §5 y ADR-020/021/022 en `08`.
- **Decisiones que requieren revisión humana:** ver `08` §0.
- **Evidencia y commit:** rama `migration/rust-backend` (commit 37d8272 y anteriores).
