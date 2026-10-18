# Migración del backend de Refleja a Rust — índice

> **Fase actual: A — Descubrimiento y planificación (completa, pendiente de aprobación).** No se ha modificado el backend ni se ha creado código Rust.
> Análisis del 2026-10-18 sobre `main` @ `f4d996c`. La implementación **no debe empezar** hasta que el propietario apruebe el plan y las decisiones bloqueantes (TASK-0004).

**Objetivo:** reemplazar el backend FastAPI (`back/`, ≈130 MB de RAM reportados) por un servicio **Rust + Axum + Tokio + Tower** con SQLx/MariaDB, **sin cambiar contratos externos**, dentro de este mismo repositorio (`back-rs/`, ADR-001 propuesto).

## Cómo leer esto
1. [`01-context.md`](01-context.md) — contexto canónico (empieza aquí).
2. [`AGENT-GUIDE.md`](AGENT-GUIDE.md) — reglas para agentes.
3. [`09-task-plan.md`](09-task-plan.md) — plan, olas, propietarios de archivos y DAG; fichas en [`tasks/`](tasks/).

## Documentos
| Archivo | Contenido | Estado |
|---|---|---|
| [`00-scope-and-baseline.md`](00-scope-and-baseline.md) | Alcance, comandos ejecutados, línea base parcial, riesgos iniciales | completo |
| [`01-context.md`](01-context.md) | Resumen, arquitectura actual/objetivo, contratos, mapa de equivalencia | completo (decisiones = propuestas) |
| [`02-endpoint-inventory.md`](02-endpoint-inventory.md) | 15 rutas + comportamientos implícitos, con evidencia | completo |
| [`03-business-flows.md`](03-business-flows.md) | 9 flujos de extremo a extremo | completo |
| [`04-data-and-integrations.md`](04-data-and-integrations.md) | Esquema, consultas, tipos, Turnstile, `formulario.json` | completo; **esquema de producción sin verificar** |
| [`05-security-review.md`](05-security-review.md) | Controles a preservar (P-xx) y hallazgos (S-xx) | completo |
| [`06-runtime-and-deployment.md`](06-runtime-and-deployment.md) | Ejecución, variables, despliegue, observabilidad | completo; producción sin verificar |
| [`07-test-and-compatibility-plan.md`](07-test-and-compatibility-plan.md) | Estrategia diferencial y catálogo CT-xxx | completo |
| [`08-decisions-and-open-questions.md`](08-decisions-and-open-questions.md) | 19 ADR (todos `propuesta`) y 23 incógnitas/contradicciones (16 Q + 7 C) | vivo |
| [`09-task-plan.md`](09-task-plan.md) | 50 tareas, dependencias, olas | **propuesto** |
| [`AGENT-GUIDE.md`](AGENT-GUIDE.md) | Reglas y contrato entre agentes | completo |
| [`tasks/`](tasks/) | Una ficha por tarea (TASK-0001…0050) | propuestas |
| [`evidence/python-baseline/`](evidence/python-baseline/) | Script de sondas y salida real del backend Python (SQLite local) | evidencia |

Documentos **no creados a propósito** (se generan durante la ejecución): `traceability.md` (TASK-0044), `runbook-cutover.md` (TASK-0048), evidencias de producción (`evidence/baseline-prod-*`, `prod-schema-*`, `prod-config-*`, `traffic-*`; TASK-0001/2/3/5), informe de rendimiento (TASK-0046). No se crean vacíos para no inventar contenido.

## Resumen de cobertura
- **Inspeccionado:** `back/app/**` completo (módulos de `app/` + 3 routers), `seed.example.sql`, `migrations/002`, `deploy.sh`, `deploy/*`, `.env.example`, `requirements.txt`, `back/README.md`, y los consumidores `analytics.js`, `auth-common.js`, `acceso.js`, `platform.js`, `formulario.json`.
- **Ejecutado:** backend Python en local (SQLite aislado, `DEV_BYPASS_TURNSTILE`), sondas HTTP de las 15 rutas y sus errores principales; ver [`evidence/`](evidence/python-baseline/).
- **No inspeccionado (por diseño o falta de acceso):** `back/.env`, `back/seed.sql` (secretos); producción (esquema, config, logs, métricas, tráfico); comportamiento con MariaDB; Cloudflare/CloudPanel; generación del sitio estático.
- **Encontrado sin pruebas:** el backend no tiene ninguna prueba automática.

## Incógnitas que impiden avanzar (resumen; detalle en `08`)
1. **Esquema real de MariaDB** (Q-02, C-03: `seed.example.sql` no tiene `event_counter`) → TASK-0002.
2. **Línea base real de RAM** y objetivo de éxito (Q-01, Q-12) → TASK-0001 + decisión.
3. **Servidor de producción** (Q-11, Q-03): distro/glibc/toolchain, config efectiva → TASK-0003 (condiciona ADR-003).
4. **ADR bloqueantes** sin aprobar: 001, 002, 004, 006, 009, 016 → TASK-0004.

## Siguiente paso recomendado
Aprobar/ajustar el plan y ejecutar la **Ola 0** (TASK-0001…0005; requieren acceso del propietario al servidor, no modifican código). Después TASK-0006 (esqueleto del crate) y TASK-0007 (harness de contrato).

## Hallazgos que conviene conocer antes de aprobar
- La documentación del backend está **desactualizada** (6 vs 8 tablas; falta `/platform/logins`).
- Hay **quirks** que el front ya tolera y que el plan preserva por defecto (clave JSON `"null"`, cookie no borrada en 401 de refresh, `accepted` que cuenta eventos descartados, 307 por barra final…). Ver ADR-009/010.
- El hash Argon2id cuesta **64 MiB por login** también en Rust: el plan incluye un semáforo para que los picos no anulen el ahorro (ADR-014).
- `deploy.sh` y `healthcheck` actuales **no son reutilizables tal cual** para un binario Rust (TASK-0047).
