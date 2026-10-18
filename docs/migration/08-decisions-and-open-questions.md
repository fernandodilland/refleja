# 08 · Decisiones (ADR) y preguntas abiertas

> **Ninguna decisión de esta lista está aceptada.** Todas son *propuestas* hechas por el agente de análisis el 2026-10-18 a partir de la evidencia.
> Quien aprueba: el propietario del proyecto (fernandodilland). Cuando una decisión se acepte, cambiar su estado a `aceptada`, anotar fecha y quién la aprobó, y desbloquear las tareas listadas.
> Estados: `propuesta` · `aceptada` · `rechazada` · `reemplazada`.

## 1. Registro de decisiones

| ID | Tema | Estado | Bloquea tareas |
|---|---|---|---|
| ADR-001 | Ubicación del código Rust | propuesta | 0006 |
| ADR-002 | Estrategia de migración (reescritura con equivalencia diferencial) | propuesta | todas |
| ADR-003 | Build y entrega del binario | propuesta (**requiere datos**, Q-11) | 0047, 0048 |
| ADR-004 | Stack de bibliotecas | propuesta | 0006 |
| ADR-005 | Configuración y compatibilidad de `.env` | propuesta | 0009 |
| ADR-006 | Esquema/DDL: ¿migraciones automáticas al arrancar? | propuesta | 0021, 0011 |
| ADR-007 | Upserts atómicos (`ON DUPLICATE KEY`) vs SELECT+INSERT | propuesta | 0023, 0024 |
| ADR-008 | Fidelidad del formato de errores 422 | propuesta | 0010, 0032 |
| ADR-009 | Política general: preservar quirks vs corregir | propuesta | todas las de endpoint |
| ADR-010 | Cookie de refresh no se borra en 401 de `/auth/refresh` | propuesta (preservar) | 0027 |
| ADR-011 | No migrar `/api/docs` ni `/api/openapi.json` | propuesta | 0016 |
| ADR-012 | Semántica de `round(x, 4)` de Python | propuesta | 0012, 0036 |
| ADR-013 | `formulario.json`: leer del disco vs embeber | propuesta | 0019 |
| ADR-014 | Rate limiting, concurrencia de Argon2 y proceso único | propuesta | 0014, 0018, 0026 |
| ADR-015 | Límite de body y timeouts | propuesta | 0016 |
| ADR-016 | BD de pruebas/desarrollo: MariaDB local (no SQLite) | propuesta | 0007, 0011 |
| ADR-017 | Estrategia de cutover (paralelo → conmutación → rollback) | propuesta | 0048 |
| ADR-018 | Logging/observabilidad sin IP | propuesta | 0016 |
| ADR-019 | Serialización de fechas (naive ISO, microsegundos) | propuesta | 0012 |

### ADR-001 · Ubicación: `back-rs/` junto a `back/` (mismo git)
- **Contexto:** el usuario pidió mantener el código dentro de este repo. `back/` es Python y debe seguir ejecutable para comparar y para rollback; `deploy.sh`/systemd apuntan a `back/`. El front se redespliega solo con cambios en `front/*`.
- **Opciones:** (A) `back-rs/` nuevo, Python intacto hasta el cutover; (B) reemplazar `back/` en una rama larga; (C) workspace Cargo en la raíz.
- **Propuesta:** **A**. Un único crate `refleja-api` (no workspace, el backend es pequeño: ~1 300 líneas). Tras el cutover y con autorización, `back/` se retira (TASK-0050).
- **Consecuencias:** `formulario.json` se localiza en `../front/src/` desde `back-rs/` igual que hoy; no cambia el patrón de ruta relativa (ver ADR-013). Duplicidad temporal de carpetas.
- **Evidencia:** `back/app/form_meta.py:42-46`, `README.md` raíz (watch paths).

### ADR-002 · Estrategia: reescritura completa con equivalencia demostrada por pruebas diferenciales
- **Contexto:** el backend es pequeño y cohesionado (3 routers, 8 tablas); no hay pruebas.
- **Propuesta:** (1) primero la suite de caracterización contra Python; (2) implementar por tareas pequeñas; (3) correr la misma suite contra Rust hasta paridad; (4) despliegue paralelo y conmutación con rollback inmediato (ADR-017). No se hace *strangler* por rutas (las tres APIs comparten esquema, tokens y cuotas).
- **Riesgo:** equivalencia incompleta si la suite omite quirks → mitigado por catálogo CT-xxx y revisión de TASK-0044.

### ADR-003 · Build y entrega del binario
- **Opciones:** (A) compilar en CI/local y subir binario; (B) compilar en el servidor en `deploy.sh`; (C) imagen/contenedor.
- **Propuesta provisional:** **A** (el servidor probablemente no tenga toolchain y compilar consume la RAM que se quiere ahorrar), pero **no decidir** hasta conocer distro/glibc/arquitectura del servidor (Q-11). Alternativa `musl` estático si hay incompatibilidad.
- **Cómo se versiona:** el binario **no** se commitea; artefacto de release (GitHub Releases/scp) — por decidir.

### ADR-004 · Stack (versiones a fijar en TASK-0006 verificando crates.io)
Axum (+ Tokio, Tower, `tower-http`: `CorsLayer`, `TraceLayer`, `TimeoutLayer`, `RequestBodyLimitLayer`), SQLx con feature `mysql` + `runtime-tokio` + `tls-rustls` (+ `chrono`/`time`, `json`), `jsonwebtoken` (HS256), `argon2` (RustCrypto, PHC), `hmac` + `sha2`, `reqwest` con `rustls-tls` y sin características por defecto, `serde`/`serde_json`, `tracing` + `tracing-subscriber`, `thiserror`, `uuid`, `rand`, `dotenvy`, `lru` o implementación propia para el rate limiter. Versiones observadas con `cargo search` el 2026-10-18 (orientativas, no verificadas por compilación): axum 0.8.9, tokio 1.53.3, tower-http 0.7.1, sqlx 0.9.0, jsonwebtoken 11.1.0, argon2 0.6.0, reqwest 0.13.5.
- **Justificación:** son las indicadas en el prompt de migración (Axum/Tokio/Tower, SQLx para MariaDB) y cubren cada necesidad actual. Cada dependencia adicional exige justificación en su tarea.
- **Pendiente:** confirmar que `sqlx` 0.9 mantiene soporte MariaDB estable y comprobar licencias/`cargo deny`.

### ADR-005 · Configuración: mismos nombres de variables, mismo `.env`
- **Propuesta:** el binario lee las **mismas** variables (`06` §2) y el `.env` del directorio de trabajo; precedencia: variable de proceso > `.env` > default. `DATABASE_URL` acepta el esquema `mysql+pymysql://…` (se traduce a `mysql://`) y `mysql://`; se ignoran `sqlite:` en producción (error claro). Respetar `APP_HOST`/`APP_PORT` (hoy solo informativos).
- **Por qué:** permite desplegar sin tocar secretos y revertir cambiando solo el `ExecStart`.

### ADR-006 · Esquema: sin DDL automático al arrancar
- **Contexto:** hoy `create_all` + `ALTER … IF NOT EXISTS` al arrancar (FL-09), con fallos silenciados.
- **Propuesta:** el servicio Rust **no ejecuta DDL**. Se entregan migraciones SQL versionadas (baseline = `seed.example.sql` + `event_counter` + columnas de cuotas) aplicables con `sqlx migrate`/script explícito, e **idempotentes** para poder correrse sobre la BD de producción existente. Al arrancar solo se **verifica** (consulta ligera) que las tablas/columnas esperadas existan y falla rápido si no.
- **Riesgo:** si el esquema real de producción difiere (D-5), la verificación al arrancar puede fallar → por eso TASK-0002 va primero.
- **Alternativa:** replicar `CREATE TABLE IF NOT EXISTS` al arrancar (más fiel, menos seguro).

### ADR-007 · Contadores con `INSERT … ON DUPLICATE KEY UPDATE`
- **Propuesta:** `question_stat`, `event_counter`, `daily_metric` se incrementan con un único `INSERT … ON DUPLICATE KEY UPDATE x = x + ?` (efecto observable idéntico, menos viajes y sin SAVEPOINT). `visitor` y `form_run` mantienen get-or-create.
- **Nota:** `updated_at` debe fijarse explícitamente (D-2).

### ADR-008 · Errores 422
- **Hecho:** el front no depende del contenido de `detail` en 422 (solo estado). **Propuesta:** estado **422** y cuerpo `{"detail":[{"type","loc","msg","input"}…]}` con la **misma forma** y `loc` correctos, pero **mensajes `msg` no obligatoriamente idénticos a Pydantic** (texto en inglés). Si el propietario prefiere paridad total de textos, se hace tabla de mensajes (coste mayor).
- **Evidencia:** `[EJECUTADO]` `probe-output`; consumidores `analytics.js`, `platform.js`, `acceso.js:75`.

### ADR-009 · Política: preservar quirks observables por defecto
- **Propuesta:** cualquier comportamiento observable actual (incluidos defectos menores) se **preserva** salvo ADR aceptado. Quirks identificados: clave JSON `"null"` (realtime), 401 de refresh sin `Set-Cookie`, `accepted` cuenta eventos descartados, run ajeno mutable, redirect 307 por barra final, `top_reached` incluye `age/start`, empates sin orden.
- **Por qué:** minimiza riesgo con consumidores desconocidos (Q-04).

### ADR-010 · Refresh: no limpiar la cookie en 401
- **Propuesta:** preservar (no enviar `Set-Cookie` en los 401 de `/auth/refresh`). Mejora opcional futura: limpiarla como pretendía el código.

### ADR-011 · No migrar documentación interactiva
- Solo existe en dev. Se sustituye por `docs/migration/02-endpoint-inventory.md`.

### ADR-012 · `round(x, 4)`
- Python redondea el *double* a 4 decimales con *round-half-even* sobre su representación decimal exacta (`round(0.00005,4)` → `0.0001`). **Propuesta:** implementar una función `py_round4` verificada con vectores generados desde Python (≥10 000 pares enteros), y serializar el `f64` con la misma representación más corta que Python (`repr`) — `serde_json` (Ryu) produce la misma salida para los casos habituales; se prueba. Casos `0.0` ⇒ `0.0`, `1.0` ⇒ `1.0`.

### ADR-013 · `formulario.json`
- **Opciones:** (A) leer en runtime de `../front/src/formulario.json` o `FORMULARIO_PATH` (igual que hoy); (B) embeber con `include_str!` (requiere recompilar al cambiar el formulario); (C) A con *fallback* a B.
- **Propuesta:** **C**: runtime con ruta configurable, y si falta → el *fallback* **actual** 12/12/12 (preserva el comportamiento, aunque sea inexacto) registrando una advertencia. Reinicio necesario para recargar (como hoy).
- **Pregunta:** ¿el servidor tiene el repo completo (con `front/`) junto al binario? (Q-03).

### ADR-014 · Rate limits y Argon2
- **Propuesta:** (1) rate limiter en memoria con las mismas ventanas/cuotas (60 s deslizante, LRU 50 000, límites configurables); al pasar de 2 procesos a 1 los límites efectivos se **duplican en rigor** (más estricto): aceptable y documentado; (2) semáforo global que limite a *N* verificaciones/hashes Argon2 concurrentes (p. ej. 2) ejecutadas en `spawn_blocking`, para acotar RAM (64 MiB c/u); (3) **no** añadir rate limit nuevo al login sin aprobación (cambia contrato 429).

### ADR-015 · Límite de body y timeouts
- **Propuesta:** `RequestBodyLimit` de 64 KiB (50 eventos × ≈ 600 B máx ≈ 30 KiB), timeout de petición 15 s, timeout de Turnstile 8 s. Error del límite: 413 (nuevo; hoy no existe) → aprobar valor.

### ADR-016 · BD de pruebas
- **Propuesta:** MariaDB local (Homebrew ya instalado) para desarrollo y pruebas; **se abandona SQLite** en el servicio Rust (SQLx `mysql` únicamente). Script de ayuda para crear BD efímera por ejecución de pruebas. Consecuencia: el flujo de dev "cero configuración" cambia (se documenta en TASK-0049).

### ADR-017 · Cutover
- **Propuesta:** (1) Rust escucha en un puerto alterno (p. ej. 20833) con la misma BD (o réplica) en modo *shadow* (solo `health`/lecturas de panel con admin de prueba); (2) conmutar el reverse proxy a Rust, dejando Python parado pero instalado; (3) rollback = volver el proxy y reiniciar Python; (4) tras N días sin incidentes y con autorización, retirar Python. Los tokens existentes siguen válidos por compartir secretos.
- **Pregunta:** ¿ventana de mantenimiento aceptable? (Q-15).

### ADR-018 · Observabilidad
- **Propuesta:** `tracing` a stdout (journald) con nivel configurable (`RUST_LOG`), sin cabeceras, cuerpos ni IPs; logs de nivel WARN para reuso de refresh como hoy. Sin métricas/Prometheus por ahora.

### ADR-019 · Fechas
- **Propuesta:** `DATETIME` naive UTC; serializar `YYYY-MM-DDTHH:MM:SS[.ffffff]` como `datetime.isoformat()` de Python (sin sufijo de zona). Si MariaDB devuelve sin fracción, la salida no tendrá microsegundos (verificar, Q-07).

## 2. Incógnitas, contradicciones y preguntas abiertas

| ID | Tipo | Descripción | Impacto | Urgencia | Cómo resolver | Quién |
|---|---|---|---|---|---|---|
| Q-01 | Desconocido | RAM **real** de producción: ¿suma de 2 workers?, ¿qué parte es BD/proxy? | Define objetivo y éxito | Alta | TASK-0001 (`ps`, `smem`, `systemctl status`) | Propietario (acceso SSH) |
| Q-02 | Desconocido | Esquema real de MariaDB (tablas, columnas, índices, `event_counter`, ON UPDATE) | Puede cambiar queries/migraciones | **Crítica** | TASK-0002 (`SHOW CREATE TABLE …` solo lectura) | Propietario |
| Q-03 | Desconocido | Configuración efectiva: ¿`ORIGIN_SECRET`?, `CORS_ORIGINS`, `COOKIE_*`, ¿repo completo en servidor?, rutas | Contratos (cookie/CORS) y despliegue | Alta | TASK-0003 (lista de nombres + valores no secretos) | Propietario |
| Q-04 | Desconocido | ¿Otros consumidores de la API además del front propio? ¿escáneres/ bots que dependan de errores? | Preservación de contratos | Media | TASK-0005 (logs de Nginx/Cloudflare) | Propietario |
| Q-05 | Desconocido | Versión exacta de MariaDB y `sql_mode` | Tipos/fechas/JSON | Alta | TASK-0002 | Propietario |
| Q-06 | Desconocido | Privilegios del usuario `refleja` (¿`ALTER`? ¿`CREATE`?) | ADR-006 | Media | TASK-0002 (`SHOW GRANTS`) | Propietario |
| Q-07 | Desconocido | Serialización de `last_login_at`/`created_at` en MariaDB (¿fracciones?) | Cuerpo de `/me` y `/logins` | Media | TASK-0008 contra MariaDB local de la misma versión | Agente |
| Q-08 | Desconocido | ¿Está definido `ORIGIN_SECRET` en prod? (si sí, el `health` de `deploy.sh` fallaría) | Despliegue | Media | TASK-0003 | Propietario |
| Q-09 | Desconocido | Política de retención (visitor, form_run, admin_session…) | Fuera de alcance; informa tamaño | Baja | Decisión del propietario | Propietario |
| Q-10 | Desconocido | Backups y restauración de la BD | Rollback de datos | Media | Propietario | Propietario |
| Q-11 | Desconocido | Servidor: distro, arquitectura, glibc, ¿permite binarios externos?, ¿toolchain? | ADR-003 | **Alta** | TASK-0003 (`uname -a`, `ldd --version`, `/etc/os-release`) | Propietario |
| Q-12 | Desconocido | Objetivo cuantificado de RAM/latencia que define "éxito" | Criterio de aceptación de TASK-0046 | Alta | Decisión del propietario (propuesta no aprobada en `09`: RSS en reposo < 30 MB, pico bajo carga declarada < 100 MB) | Propietario |
| Q-13 | Desconocido | Volumen de tráfico (req/s, usuarios simultáneos, filas) | Perfil de carga | Media | TASK-0001/0005 | Propietario |
| Q-14 | Desconocido | ¿Monitores externos usan `/api/health`? ¿esperan el cuerpo exacto? | Preservar `health` | Baja | TASK-0005 | Propietario |
| Q-15 | Desconocido | ¿Se acepta cerrar sesiones admin / invalidar tokens públicos en el cutover? (por defecto **no**) | ADR-017 | Media | Decisión | Propietario |
| C-01 | Contradictorio | README: "6 tablas" vs código 8 | Documentación | Baja | Actualizar README (TASK-0049) | Agente |
| C-02 | Contradictorio | README: endpoints de panel sin `/logins` | Documentación | Baja | TASK-0049 | Agente |
| C-03 | Contradictorio | `seed.example.sql` sin `event_counter` | Esquema | **Alta** | TASK-0002 / 0021 | Agente+Propietario |
| C-04 | Contradictorio | `migration.sql` descrito en README pero vacío localmente | Procedimiento de alta | Media | TASK-0003 | Propietario |
| C-05 | Contradictorio | `_clear_refresh_cookie` antes de `raise` no tiene efecto (cookie no se borra) | Contrato de refresh | Baja | ADR-010 | Propietario |
| C-06 | Contradictorio | `form_meta` *fallback* 12/12/12 vs formulario real 13/12/12 | Embudo si falla la carga | Baja | ADR-013 | Propietario |
| C-07 | Contradictorio | `README` raíz/back mencionan `venv`; `deploy.sh` usa `venv/`, README dev usa `.venv/` | Docs | Baja | TASK-0049 | Agente |
| Q-16 | Resuelto | ¿Docker disponible para pruebas? **No** (`docker` no instalado); sí MariaDB por Homebrew | ADR-016 | — | Verificado el 2026-10-18 | — |
