# TASK-0018 · Implementar `http/rate_limit.rs`: ventana deslizante de 60 s con LRU acotado

## Identificación
- **ID:** TASK-0018
- **Título:** Implementar `http/rate_limit.rs`: ventana deslizante de 60 s con LRU acotado
- **Estado:** propuesta
- **Prioridad:** P1
- **Dominio:** HTTP
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** medio
- **Tarea padre:** EPIC-B — Cimientos del crate y pruebas de contrato
- **Dependencias:** TASK-0006
- **Bloquea a:** TASK-0016, TASK-0030, TASK-0031, TASK-0035

## Objetivo
Replicar `_rate_ok` (ventana deslizante en memoria, 50 000 claves LRU) con exactitud y seguridad de concurrencia.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/routers/public.py:34-60`
- ADR-014
- `05` S-02

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- ADR-014

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- `RateLimiter::allow(key, limit) -> bool` con reloj inyectable; descarta marcas ≤ now−60 s; añade la marca solo si se permite; expulsa por LRU al superar 50 000 claves.
- Acotar memoria: cada ventana guarda como máximo `limit` marcas.

## Fuera de alcance
- No añadir límites nuevos (login).
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Estructura protegida por `Mutex` (sección crítica corta) o fragmentada; sin bloqueo prolongado en `async`.

## Contratos e invariantes
- Con una petición por encima del límite en el mismo segundo ⇒ `false` y **no** se registra la marca.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/http/rate_limit.rs

**Archivos de referencia (solo lectura):**
- back/app/routers/public.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Límite exacto N y N+1; expiración tras 60 s (reloj falso); LRU (50 001 claves expulsa la menos reciente y respeta `move_to_end`); concurrencia con 64 hilos sin pánico ni exceso.
- Uso de memoria por clave acotado.

## Criterios de aceptación
- [ ] Pruebas en verde.
- [ ] Prueba de estrés: 1 M llamadas en <5 s en la máquina de desarrollo (informativa).

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo: contención de bloqueo → se mide en 0046.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:**
- **Archivos modificados:**
- **Pruebas ejecutadas y resultados reales:**
- **Criterios satisfechos y pendientes:**
- **Diferencias detectadas respecto al original:**
- **Decisiones que requieren revisión humana:**
- **Evidencia y commit:**
