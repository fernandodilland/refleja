# Migración del backend de Refleja a Rust — índice

> **Fase actual: C — DESPLEGADO EN PRODUCCIÓN (18 oct 2026, 13:06 hora del servidor).** La API Rust sirve `api.refleja.org` en el puerto 20834; el Python quedó apagado, deshabilitado y bloqueado (no borrado). Ver «Despliegue realizado».
> _Texto previo:_ B — Implementación local COMPLETA. El backend Rust (`../../back-rs`) implementa las 15 rutas y todo el comportamiento observable del backend Python, verificado con un arnés diferencial (Python vs Rust, misma BD). **No se ha desplegado ni probado contra producción.**
> Análisis del 2026-10-18 sobre `main` @ `f4d996c`; implementación en la rama `migration/rust-backend`.
> Lo que sigue (requiere al propietario): TASK-0001/0002/0003/0005 (datos del servidor), revisión de 0045–0048, y el cutover según [`runbook-cutover.md`](runbook-cutover.md).

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
| [`09-task-plan.md`](09-task-plan.md) | 50 tareas, dependencias, olas | ejecutado en local (ver estados) |
| [`traceability.md`](traceability.md) | Endpoint → código → pruebas | completo |
| [`runbook-cutover.md`](runbook-cutover.md) | Despliegue gradual, conmutación y rollback | borrador para aprobación |
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

## Resultado de la implementación (resumen)
- 15/15 rutas migradas + documentación interactiva de desarrollo (EP-016); `tests/contract/diff.py`: 223 peticiones idénticas + volcado de 8 tablas idéntico + modo producción + fail-closed + compatibilidad de sesiones/tokens Python↔Rust ([`traceability.md`](traceability.md)).
- Memoria (benchmark local macOS, [`evidence/bench-2026-10-18.md`](evidence/bench-2026-10-18.md)): ≈7 MB en reposo vs 25–150 MB de Python; pico con 8 logins simultáneos 75 MB vs 560–634 MB. **Medir en el servidor Linux** antes de dar la cifra por buena.
- Hallazgo: bajo carga concurrente en MariaDB ≥11.8 el backend Python produce 500 (error 1020); Rust los evita con `READ COMMITTED` + reintentos (ADR-020).

## Despliegue realizado (2026-10-18)
- `./desplegar.sh simulacro` → validó en el servidor real: configuración, base de datos y **esquema completo** (`refleja-api --check`). Esto resuelve TASK-0002 en lo que importa (el esquema de producción contiene todas las tablas/columnas que la API usa).
- `back-rs/scripts/dia-d.sh` → Python parado y bloqueado (`/etc/systemd/system/refleja-api.service.d/90-apagado-por-rust.conf`), Rust instalado (`releases/1.0.0-20261018190542-1f8a3c1`), salud local 200 y salud pública `https://api.refleja.org/api/health` OK.
- Verificado después: CORS (preflight desde `https://refleja.org` 200), `/api/docs` 404 en producción, front 200; **RSS del proceso Rust ≈ 6.7 MB**; `NRestarts=0`; vecinos intactos (`sistema-rs`, `archivo-correos-api-rs`, `rgm-api`, `fractory-api`, `nginx`, `mariadb` activos; las únicas unidades fallidas, `logrotate` y `motd-news`, ya lo estaban).
- Mapa de Sistemas actualizado (repo `sistema.fernandodilland`, commit `3e80f86`, publicado con `git pull --ff-only` en el servidor) y `/etc/sistemas-agente/supervisar.json` actualizado (respaldo `.antes-refleja-rs`); agente reiniciado.
- Volver al Python: `./desplegar.sh deshacer`. Revertir a otra release Rust: `./desplegar.sh revertir`.

## Checklist de despliegue (fuera del alcance local)
TASK-0001 (RAM real), 0002 (esquema real), 0003 (config/servidor), 0005 (tráfico) y 0050 (retirar Python) requieren acceso al servidor o autorización del propietario. No condicionan la corrección de la migración local, pero **deben hacerse antes del cutover**.

## Siguiente paso recomendado
1. Ejecutar TASK-0002 (esquema real, solo lectura) y TASK-0003 (config/servidor) y comparar con `back-rs/migrations/0001_baseline.sql`.
2. Ensayar `./desplegar.sh simulacro` y luego `./desplegar.sh dia-d` (ver `runbook-cutover.md`; puerto de producción 20834, ya configurado en CloudPanel).
3. Aprobar el runbook y conmutar; retirar Python solo con autorización (TASK-0050).

## Hallazgos que conviene conocer antes de aprobar
- La documentación del backend está **desactualizada** (6 vs 8 tablas; falta `/platform/logins`).
- Hay **quirks** que el front ya tolera y que el plan preserva por defecto (clave JSON `"None"`, cookie no borrada en 401 de refresh, `accepted` que cuenta eventos descartados, 307 por barra final…). Ver ADR-009/010.
- El hash Argon2id cuesta **64 MiB por login** también en Rust: el plan incluye un semáforo para que los picos no anulen el ahorro (ADR-014).
- El despliegue Rust sigue el patrón de tus otros proyectos (`./desplegar.sh`, `back-rs/scripts/`, `back-rs/despliegue/`); el `deploy.sh` de Python no se usa.
