# TASK-0014 · Implementar `security/password.rs`: Argon2id compatible con argon2-cffi y semáforo de memoria

## Identificación
- **ID:** TASK-0014
- **Título:** Implementar `security/password.rs`: Argon2id compatible con argon2-cffi y semáforo de memoria
- **Estado:** propuesta
- **Prioridad:** P1
- **Dominio:** Seguridad
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** alto
- **Tarea padre:** EPIC-B — Cimientos del crate y pruebas de contrato
- **Dependencias:** TASK-0006, TASK-0009
- **Bloquea a:** TASK-0026, TASK-0043

## Objetivo
Verificar los hashes Argon2id existentes y generar nuevos con los mismos parámetros, acotando cuántos hashes de 64 MiB pueden estar en memoria a la vez.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/security.py:15-43`
- `back/app/routers/auth.py:36-38,100-116`
- `seed.example.sql:157-169`
- ADR-014

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- ADR-014 (semáforo; sin rate limit nuevo)

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- `hash_password` (Argon2id v19, m=65536 KiB, t=3, p=4, salida 32 B, sal 16 B, formato PHC).
- `verify_password(stored, password) -> bool` que usa los parámetros **embebidos** en el hash; cualquier error (hash inválido, otro algoritmo) ⇒ `false`.
- `needs_rehash(stored)`: igual que `PasswordHasher.check_needs_rehash` de argon2-cffi (compara versión, tipo, m, t, p, longitud de hash y de sal).
- Ejecución en `spawn_blocking` con **semáforo** (N configurable, propuesta 2) y cola; `dummy_hash` calculado de forma perezosa una sola vez.

## Fuera de alcance
- No implementar el endpoint de login.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Generar con `back/.venv` ≥5 hashes de prueba (contraseñas con acentos/ñ/emoji, 256 caracteres) en `tests/vectors/argon2.json`.
2. Medir tiempo y RSS de un hash en Rust y anotarlos en la tarea (insumo de 0046).

## Contratos e invariantes
- Mismos parámetros por defecto que Python; la contraseña se trata como bytes UTF-8.
- La verificación del señuelo cuesta lo mismo que una real (misma función).

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/security/password.rs
- back-rs/tests/vectors/argon2.json

**Archivos de referencia (solo lectura):**
- back/app/security.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Hashes de argon2-cffi verifican en Rust (positivo y negativo).
- `needs_rehash` verdadero con parámetros distintos, falso con los actuales.
- Con semáforo=1 y 4 tareas concurrentes, nunca hay >1 hash simultáneo (contador instrumentado).

## Criterios de aceptación
- [ ] CT-056 a nivel de librería en verde.
- [ ] Hash generado por Rust verifica con `argon2-cffi` (script incluido).

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo: latencia de login si el semáforo es pequeño → configurable. Rollback: revertir archivo.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:**
- **Archivos modificados:**
- **Pruebas ejecutadas y resultados reales:**
- **Criterios satisfechos y pendientes:**
- **Diferencias detectadas respecto al original:**
- **Decisiones que requieren revisión humana:**
- **Evidencia y commit:**
