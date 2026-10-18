# Matriz de trazabilidad (TASK-0044)

Estado real al 2026-10-18. «Prueba» = etiquetas de `back-rs/tests/contract/diff.py` (petición idéntica contra Python y Rust, respuesta y tablas comparadas) y `back-rs/tests/vectors.rs`.
Resultado de la última ejecución completa: **223 peticiones (fase 1) + 19 (modo producción) + 4 arranques fail-closed + 8 comprobaciones de cutover: TODO OK**, 19 pruebas de Rust en verde (14 unitarias + 5 de vectores de Python) (`cargo test --release`), `clippy -D warnings` limpio.

| Endpoint | Implementación | Pruebas (etiquetas del arnés) | Tareas |
|---|---|---|---|
| EP-001 `GET /api/health` | `routes/mod.rs` | health, HEAD, slash, PUT/POST, prod con `ORIGIN_SECRET` | 0016 |
| EP-002 `POST /public/session` | `routes/public.rs` | session {422×9, 403, 200}, país/UA, prod (bypass ignorado) | 0030 |
| EP-003 `POST /public/ping` | `routes/public.rs` | ping {401×6, 200, 429 rl} | 0031 |
| EP-004 `POST /public/collect` | `routes/collect.rs` | collect {validación ×40, flujo completo, idempotencia, minor, trab/fam, cuotas run/acciones/eventos, run ajeno, rl} | 0032–0035 |
| EP-005 `POST /auth/login` | `routes/auth.rs` | login {422, 403, 401×4, ok, case-insens, unicode}, cookies dev/prod | 0026 |
| EP-006 `POST /auth/refresh` | `routes/auth.rs` | refresh {sin cookie, basura, typ erróneo, ok, reuso, tras revocar familia}, cutover | 0027 |
| EP-007 `POST /auth/logout` | `routes/auth.rs` | logout {ok, de nuevo, sin cookie, basura}, prod con Domain | 0028 |
| EP-008 `GET /auth/me` | `routes/auth.rs` | me {sin auth, Basic, basura, bearer minúsculas/espacios, ok, refresh/public como access, expirado, sub numérico, inactivo, inexistente} | 0029 |
| EP-009 `GET /platform/overview` | `routes/platform.rs` | overview ×14 variantes de query + final | 0036 |
| EP-010 `GET /platform/realtime` | `routes/platform.rs` | realtime ×8 (límites, "5.0", " 5", claves `"None"`) | 0037 |
| EP-011 `GET /platform/funnel` | `routes/platform.rs` | funnel + final | 0038 |
| EP-012 `GET /platform/violence` | `routes/platform.rs` | violence ×5 + final | 0039 |
| EP-013 `GET /platform/municipios` | `routes/platform.rs` | municipios ×6 + final | 0040 |
| EP-014 `GET /platform/logins` | `routes/platform.rs` | logins ×5 + final | 0042 |
| EP-015 `GET /platform/timeseries` | `routes/platform.rs` | timeseries ×5 + final | 0041 |
| EP-016 `/api/docs`, `/api/openapi.json`, `/docs/oauth2-redirect` | `routes/docs.rs` (assets capturados de FastAPI; solo `ENV`≠prod) | dev ×8 (contenido idéntico byte a byte, 404 en `/api/redoc`, 405 `HEAD, GET`); prod: 404 en ambos | — |
| EP-IMP-1…4 (307, 404/405, CORS, guard) | `routes/mod.rs`, `http/cors.rs`, `http/origin_guard.rs` | preflight ×6, origen válido/ inválido, 404 con Origin, guard ×8 | 0016 |

| Flujo / control | Evidencia |
|---|---|
| FL-01…FL-07 | Escenario completo del arnés; volcado idéntico de `visitor, form_run, question_stat, event_counter, daily_metric, admin_login, admin_session, admin_user` |
| FL-08 bootstrap admin | `refleja-admin create-admin/hash-password` (fase 2c verifica el hash con argon2-cffi) |
| FL-09 arranque | fase 2b (fail-closed) + `verify_schema` (sin DDL) |
| P-01…P-15 | `05` §5 |
| Compatibilidad de cutover | fase 2c: access/refresh/público intercambiables Python↔Rust sobre la misma BD |

## No cubierto / pendiente (honesto)
- Esquema, configuración, tráfico y RAM **de producción** (TASK-0001/2/3/5): requieren acceso al servidor.
- Turnstile real de Cloudflare (se probó con un mock local).
- MariaDB 11.x concreta de producción (se probó con 12.3 local).
- Medición de RAM en Linux/servidor y ensayo de `deploy.sh` en el servidor real (`cargo audit`: ver `05` §5, hecho).
- Límite de cuerpo 256 KiB → 413: mejora sin equivalente en Python.
