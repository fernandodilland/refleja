# TASK-0003 · Inventariar configuración efectiva y entorno del servidor de producción (sin secretos)

## Identificación
- **ID:** TASK-0003
- **Título:** Inventariar configuración efectiva y entorno del servidor de producción (sin secretos)
- **Estado:** lista
- **Prioridad:** P0
- **Dominio:** Descubrimiento
- **Responsable o agente asignado:** Propietario del proyecto (acceso al servidor) — un agente solo puede procesar la evidencia entregada
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** medio
- **Tarea padre:** EPIC-A — Descubrimiento y decisiones (sin código)
- **Dependencias:** ninguna
- **Bloquea a:** TASK-0047

## Objetivo
Resolver Q-03, Q-08, Q-11 y C-04: qué variables están definidas, qué valores no secretos tienen, cómo es el servidor (distro, arquitectura, glibc, toolchain) y cómo está montado el checkout, para decidir ADR-003, ADR-005 y ADR-013.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/.env.example`
- `back/deploy/refleja-api.service`
- `back/deploy.sh`
- `back/README.md:49-120`

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- Lista de **nombres** de variables definidas en el `.env` de producción y valores de las **no secretas** (`ENV, APP_*, CORS_ORIGINS, COOKIE_*, *_RATE_*, PUBLIC_MAX_*, REFRESH_COOKIE_NAME`); para `ORIGIN_SECRET` solo «definido sí/no».
- Unit file systemd vigente, sudoers vigente, fragmento del vhost de Nginx/CloudPanel (cabeceras reenviadas, `client_max_body_size`, timeouts).
- `/etc/os-release`, `uname -m`, `ldd --version`, espacio en disco, ¿existe `rustc`/`cargo`?, ¿está completo el checkout (incluye `front/src/formulario.json`)?, ¿se usó `migration.sql`?

## Fuera de alcance
- No leer ni copiar valores de secretos (`JWT_SECRET`, `PUBLIC_TOKEN_SECRET`, `VID_HMAC_KEY`, `TURNSTILE_SECRET_*`, contraseña de BD, `ORIGIN_SECRET`).
- No modificar `back/`, `front/` ni crear `back-rs/`.
- No ejecutar comandos de escritura ni cambiar configuración o datos en el servidor.
- No copiar secretos, contraseñas, IPs de clientes ni datos de filas a la evidencia.

## Instrucciones de implementación
1. Producir `docs/migration/evidence/prod-config-<fecha>.md` con tablas por tema.
2. Actualizar `06` §2 y §5, y cerrar Q-03, Q-08, Q-11, C-04 en `08`.

## Contratos e invariantes
- Cero secretos en la evidencia.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- docs/migration/evidence/prod-config-<fecha>.md

**Archivos de referencia (solo lectura):**
- docs/migration/06-runtime-and-deployment.md
- docs/migration/08-decisions-and-open-questions.md

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- No aplica.

## Criterios de aceptación
- [ ] Evidencia sin secretos con todos los puntos de *Alcance incluido*.
- [ ] Q-03, Q-08, Q-11, C-04 resueltas o con motivo.
- [ ] ADR-003 puede decidirse con los datos entregados.

## Verificación
- Revisión humana; grep de la evidencia para confirmar que no contiene patrones de secretos (`grep -nEi 'secret|password|token' …` debe mostrar solo nombres de variables).

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo: filtrado accidental de secretos → revisar antes de commitear. Rollback: borrar el archivo y rotar secretos si se filtraron.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:**
- **Archivos modificados:**
- **Pruebas ejecutadas y resultados reales:**
- **Criterios satisfechos y pendientes:**
- **Diferencias detectadas respecto al original:**
- **Decisiones que requieren revisión humana:**
- **Evidencia y commit:**
