# 03 · Flujos de negocio de extremo a extremo

Cada flujo indica evento inicial, validaciones, secuencia, lecturas/escrituras, transacciones, externos, errores, resultado,
idempotencia y evidencia. No hay colas, workers, cron ni tareas en segundo plano `[CONFIRMADO]` (búsqueda en `back/app`: sin `BackgroundTasks`,
`asyncio.create_task`, `threading` salvo el candado del rate limit). No hay WebSockets, webhooks entrantes, correo, R2/S3 ni Redis.

| ID | Flujo | Endpoints | Tareas |
|---|---|---|---|
| FL-01 | Emisión de token estadístico (visitante anónimo) | EP-002 | TASK-0030 |
| FL-02 | Señal de vida / "Activos ahora" | EP-003, EP-010 | TASK-0031, 0037 |
| FL-03 | Ingesta de eventos del cuestionario | EP-004 | TASK-0032…0035 |
| FL-04 | Login de administrador | EP-005 | TASK-0026 |
| FL-05 | Renovación y rotación de sesión (refresh) con detección de reuso | EP-006 | TASK-0027 |
| FL-06 | Cierre de sesión | EP-007 | TASK-0028 |
| FL-07 | Consulta del panel (`/plataforma`) | EP-009…015 | TASK-0036…0042 |
| FL-08 | Alta de administrador / bootstrap (operativo, fuera de HTTP) | — | TASK-0043 |
| FL-09 | Arranque del servicio y migraciones ligeras | — | TASK-0009/0011/0021 |

---

## FL-01 · Emisión de token estadístico
**Inicia:** el front (`analytics.js:122-146`) tras resolver Turnstile invisible; cachea el token 30 días en `localStorage`.
1. Valida body (422). 2. Rate limit por IP (30/min, memoria) → 429. 3. `siteverify` a Cloudflare (timeout 8 s) → 403 si falla.
4. Genera `vid` (128 bit, `secrets.token_hex(16)`), `vid_h = HMAC_SHA256(VID_HMAC_KEY, vid)`. 5. `INSERT visitor(vid_hash,country,device,page_views=0,last_seen_at=now)`
   dentro de SAVEPOINT (tolera `IntegrityError` de unicidad, irrelevante en la práctica) y `daily_metric.new_visitors += 1`. 6. Commit. 7. JWT `typ=public` firmado con `PUBLIC_TOKEN_SECRET`.
**Transacción:** una (commit al final). **Reintento/idempotencia:** ninguna; reintentar crea otro visitante. **Privacidad:** el `vid` en claro solo existe en el JWT del cliente; en BD solo el HMAC. **Evidencia:** `public.py:63-97`, `security.py:51-60,106-111`.

## FL-02 · Señal de vida
Cada ~25 s (visible) / ~1 min (oculta) el front llama `POST /public/ping`. Sólo actualiza `visitor.last_seen_at`. "Activos ahora" = `COUNT(visitor WHERE last_seen_at >= now-90s)` (`platform.py:41-44`).
Si el visitante no existe (p. ej. BD depurada) se **crea** sin sumar `new_visitors` (`public.py:121`, discrepancia menor con FL-01). `[CONFIRMADO]`.

## FL-03 · Ingesta de eventos (`/public/collect`) — flujo crítico
**Inicia:** el front encola eventos y los envía por lotes (≤`BATCH_SIZE`) con debounce, y con `keepalive` al ocultar la pestaña (`analytics.js:149-195`).
Los eventos se **reenvían** si la respuesta no es `ok` (por eso la idempotencia por run importa).

**Algoritmo (orden exacto):**
1. `require_public_vid` → 401 si el token no valida. 2. Validación del body (422) — *nótese que el 401 se evalúa antes que el 422*.
3. Rate limit `coll:<vid_h>` 120/min → 429.
4. `device` = UA-derivado; si algún evento trae `device`, **el primero** que lo trae lo sobrescribe (solo se usa al **crear** visitante; un visitante existente no se actualiza) `[CONFIRMADO]`.
5. `get_or_create_visitor`. 6. Cuota (`_Quota`) inicializada con los contadores **cargados** del visitante.
7. Para cada evento, mientras `events_count + d_events < PUBLIC_MAX_EVENTS(2000)`: `_process_event(...)`; `d_events += 1`; `accepted += 1` **aunque** el evento se haya descartado.
8. `UPDATE visitor SET events_count+=…, run_count+=…, completed_count+=…, action_count+=…, page_views+=…, last_seen_at=now` (incrementos atómicos). 9. Commit. 10. `{"ok":true,"accepted":n}`.

**`_process_event` por tipo:**

| Tipo | Clase | Efecto (resumen) |
|---|---|---|
| `page_view` | acción | si `action_count < 300`: `d_actions++`, `d_page_views++`, `daily_metric.page_views += 1` |
| `urgent_click` / `hide_click` / `restart` | acción | `event_counter[name] += 1` con ese nombre |
| `directory_municipio` | acción | `normalize_municipio(municipio)`; si es válido: `event_counter["dir_muni:"+slug] += 1`; (la acción se cuenta aunque el municipio sea inválido) |
| `run_start` | run | `started=1`; `max_step=max(…,1)`; `last_question_id="age"`; cuenta `age` como *reached* |
| `answer` | run | cuenta `question_id` como *answered* y `next_id` como *reached* **solo si** pertenecen al flujo (`qid_ok_for_flow`); marca `started`; si trae `flow_type`: `form_starts += 1` la **primera vez** que el run fija flujo (y no está completado), y **sobrescribe** `run.flow_type`; guarda `age_bucket`; `max_step=max`; `last_question_id=nxt or question_id` |
| `minor` | run | `started`, `age_bucket="minor"`, `last_question_id="MINOR"`; si no estaba completado: `completed=1`, `minors += 1`, `form_completes += 1` |
| `municipio` | run | si slug válido: `run.municipio`, `last_question_id="LOCATION"` (no marca `started`) |
| `result` | run | `started`, `last_question_id="RESULT"`, `risk_level`, `municipio` (si válido), **reemplaza los 6 puntajes** si viene `scores` (los ausentes valen 0); si no estaba completado: `completed=1`, `form_completes += 1` |

**Reglas de run:** `_run_for` devuelve `None` (evento ignorado) si falta `run_uid` o si el run no existe y `run_count + d_runs >= 20`. El run se identifica **solo por `run_uid` global** (sin comprobar propietario) `[CONFIRMADO]` → un token válido que conozca el `run_uid` de otro puede mutarlo (hallazgo S-05, riesgo bajo: estadística, no PII).
**Idempotencia por pregunta:** `form_run.counted = {"r":[qid…], "a":[qid…]}`; cada qid se cuenta una sola vez por run y tipo → `question_stat` solo suma la primera vez. Se re-escribe todo el JSON (lectura-modificación-escritura sin bloqueo → posible doble conteo bajo concurrencia, `[INFERIDO]`).
**Validación de qids:** `VALID_QUESTION_IDS = qids de formulario.json ∪ {age,start} ∪ {MINOR,LOCATION,RESULT}`; flujo: `qid_ok_for_flow(qid, flow)` (intro/terminales siempre; si no, el qid debe pertenecer al flujo, o `flow is None`).
**Ejemplo ejecutado:** `answer(pareja_1, next_id=fam_1)` no cuenta `fam_1` (flujo distinto) y sí `pareja_2` en el siguiente `answer` `[EJECUTADO]` (`funnel`: `fam_1.reached=0`, `pareja_2.reached=1`).
**Segundo `result` sobre run completado:** vuelve a escribir `risk_level` pero no suma `form_completes` `[EJECUTADO]`.
**Errores:** ver EP-004. **Tolerancia:** el exceso de cuotas **no** produce error. **Consistencia:** una transacción; si algo lanza excepción → 500 con cuerpo de texto plano `Internal Server Error` (comportamiento por defecto de Starlette, `[NO VERIFICADO]` por no haberlo provocado) y rollback.

## FL-04 · Login de administrador
Ver EP-005. Puntos clave: verificación Argon2id con parámetros embebidos en el hash almacenado (compatibilidad con hashes creados por argon2-cffi: `m=65536,t=3,p=4`, PHC `$argon2id$v=19$…`);
hash señuelo calculado **al importar el módulo** (`auth.py:38`) para igualar tiempos; re-hash transparente si los parámetros del hasher cambian (`check_needs_rehash`).
Historial `admin_login` sin IP. **Evidencia:** `auth.py:83-134`, `security.py:17-43`.

## FL-05 · Refresh con rotación y detección de reuso
Cadena de decisión descrita en EP-006. Estado: tabla `admin_session` (1 fila por refresh emitido; `revoked_at` marca rotación o logout). **Reuso** ⇒ revoca todas las sesiones activas del usuario (`UPDATE … WHERE revoked_at IS NULL`) y responde 401.
El token de refresh es un JWT firmado con `JWT_SECRET` y además se compara su `sha256` con `token_hash` (defensa adicional). No se purgan sesiones expiradas (sin job) `[CONFIRMADO]`.
`[EJECUTADO]` secuencia: refresh#1 200 → reuso de la cookie anterior 401 "Sesión revocada por seguridad." → la cookie nueva también queda revocada (401).

## FL-06 · Logout
Revoca la sesión de la cookie (si válida) y borra la cookie. Idempotente; siempre 200.

## FL-07 · Panel
El front (`platform.js:582-618`) hace en paralelo `overview, funnel, violence, municipios, timeseries, realtime` (+ `logins?limit=200`); `authFetch` renueva access token con `/auth/refresh` y reintenta una vez ante 401 (`auth-common.js:55-72`).
Lecturas puras sobre las tablas de FL-03; sin caché. Ver EP-009…015 para formas.

## FL-08 · Bootstrap de administradores (operativo)
No hay endpoint de alta. Dev: `python -m app.seed` (usuario `admin`, contraseña de `SEED_ADMIN_*` o `admin`). Producción: `seed.sql`/`migration.sql` confidenciales con hash Argon2id generado con `app.security.hash_password` (`seed.example.sql:157-169`).
La migración debe ofrecer un reemplazo (TASK-0043) para generar hash e insertar admin sin Python.

## FL-09 · Arranque y migraciones ligeras
`lifespan` → `init_db()`: `Base.metadata.create_all` (crea tablas faltantes, **incluida `event_counter`** que no está en `seed.example.sql`) y, solo en MySQL/MariaDB, ejecuta 5 sentencias `ALTER TABLE … ADD COLUMN IF NOT EXISTS`
(`events_count, run_count, completed_count, action_count` en `visitor`; `counted JSON` en `form_run`), ignorando cualquier error (`database.py:46-74`). Además `form_meta` lee `formulario.json` al importar; si falla, usa un *fallback* (12 preguntas por flujo ⇒ **distinto** del real 13/12/12) `[CONFIRMADO]`.
**Decisión pendiente (ADR-006):** si el binario Rust debe ejecutar migraciones al arrancar (como hoy) o delegarlas a un paso explícito.
