# TASK-0015 · Implementar `turnstile.rs`: verificación de Cloudflare Turnstile fail-closed

## Identificación
- **ID:** TASK-0015
- **Título:** Implementar `turnstile.rs`: verificación de Cloudflare Turnstile fail-closed
- **Estado:** propuesta
- **Prioridad:** P1
- **Dominio:** Integraciones
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** medio
- **Tarea padre:** EPIC-B — Cimientos del crate y pruebas de contrato
- **Dependencias:** TASK-0006, TASK-0009
- **Bloquea a:** TASK-0016, TASK-0026, TASK-0030

## Objetivo
Replicar `back/app/turnstile.py`: bypass solo en desarrollo, POST `application/x-www-form-urlencoded` a `siteverify` con timeout 8 s y cualquier fallo ⇒ `false`.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/turnstile.py:11-42`
- `05` P-02, P-03
- `04` §7

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- `TurnstileClient::verify(token: Option<&str>, secret: &str, remote_ip: Option<&str>) -> bool`, `verify_login`, `verify_invisible`.
- Cliente `reqwest` compartido (rustls, timeout total 8 s, sin redirecciones inseguras).
- Bypass: `settings.bypass_turnstile && token == "dev-bypass"` ⇒ `true`.
- Token vacío/ausente o secreto vacío ⇒ `false` sin llamada de red.
- Solo `success == true` cuenta; error HTTP, JSON inválido o timeout ⇒ `false`.

## Fuera de alcance
- No reintentos.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. URL configurable (`TURNSTILE_VERIFY_URL`) para pruebas.
2. No registrar secretos ni el token.

## Contratos e invariantes
- `remoteip` solo se envía si hay IP.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/turnstile.rs

**Archivos de referencia (solo lectura):**
- back/app/turnstile.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Con servidor mock: éxito, `success:false`, HTTP 500, JSON basura, timeout (>8 s con reloj acelerado o timeout reducido por config de prueba).
- Bypass efectivo en dev y **imposible** con `ENV=production`.
- Verificar el cuerpo enviado (`secret`, `response`, `remoteip`).

## Criterios de aceptación
- [ ] Todas las pruebas pasan sin red externa.
- [ ] Ninguna llamada a Cloudflare real en las pruebas.

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo bajo. Rollback: revertir archivo.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:**
- **Archivos modificados:**
- **Pruebas ejecutadas y resultados reales:**
- **Criterios satisfechos y pendientes:**
- **Diferencias detectadas respecto al original:**
- **Decisiones que requieren revisión humana:**
- **Evidencia y commit:**
