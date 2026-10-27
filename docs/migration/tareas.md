# Migración Python→Rust: resumen de las 50 fichas de tarea (TASK-0001…0050)

Condensado de `tasks/TASK-*.md` (borradas; íntegras en git: `git log --diff-filter=D -- docs/migration/tasks`). Estado: 0001/0002/0003/0005 = «fuera de alcance local» (datos de servidor; 0002 resuelta de hecho por `refleja-api --check`, 0001 no se midió); 0050 (retirar `back/`) = pendiente, solo con autorización del dueño; el resto `completada`. Formato por tarea: `deps` = TASK-ids previos; `alcance` = lo que se construyó; `invariantes` = contratos que no deben romperse. Contexto general: `README.md` (este directorio).

### 0001 Medir la línea base real de recursos del backend Python en producción
estado=parcialmente resuelta por el despliegue (2026-10-18); deps=ninguna
- alcance: Medir con acceso **solo lectura**: `systemctl status refleja-api`, `ps -o pid,rss,vsz,etime,cmd -u refleja-api`, `/proc/<pid>/smaps_rollup` (Pss) de master y cada worker de uvicorn. ‖ Tomar ≥3 muestras en 24 h (reposo y pico) y registrar uptime, nº de peticiones por minuto del proxy y memoria de MariaDB **por separado**. ‖ Registrar qué incluye la cifra de 130 MB (¿suma de workers? ¿RSS o PSS?).
- invariantes: No incluir secretos, IPs de clientes ni rutas con credenciales en la evidencia.

### 0002 Confirmar esquema real, versión y privilegios de MariaDB (solo lectura)
estado=parcialmente resuelta por el despliegue (2026-10-18); deps=ninguna
- alcance: Con un usuario de **solo lectura**: `SELECT VERSION()`, `SELECT @@sql_mode, @@time_zone, @@max_connections`, `SHOW TABLES`, `SHOW CREATE TABLE` de las 8 tablas, `SHOW GRANTS FOR CURRENT_USER`, y estimación de filas (`information_schema.TABLES`). ‖ Guardar **solo DDL y metadatos** (nunca datos de filas).
- invariantes: No incluir contraseñas, nombres de usuario de BD ni hosts internos.

### 0003 Inventariar configuración efectiva y entorno del servidor de producción (sin secretos)
estado=parcialmente resuelta por el despliegue (2026-10-18); deps=ninguna
- alcance: Lista de **nombres** de variables definidas en el `.env` de producción y valores de las **no secretas** (`ENV, APP_*, CORS_ORIGINS, COOKIE_*, *_RATE_*, PUBLIC_MAX_*, REFRESH_COOKIE_NAME`); para `ORIGIN_SECRET` solo «definido sí/no». ‖ Unit file systemd vigente, sudoers vigente, fragmento del vhost de Nginx/CloudPanel (cabeceras reenviadas, `client_max_body_size`, timeouts). ‖ `/etc/os-release`, `uname -m`, `ldd --version`, espacio en disco, ¿existe `rustc`/`cargo`?, ¿está completo el checkout (incluye `front/src/formulario.json`)?, ¿se usó `migration.sql`?
- invariantes: Cero secretos en la evidencia.

### 0004 Revisar y resolver los ADR bloqueantes y los objetivos de éxito
estado=completada; deps=ninguna
- alcance: Decidir (aceptar/rechazar/modificar) como mínimo: **ADR-001, 002, 004, 006, 009, 016**. ‖ Fijar el objetivo cuantificado de RAM/latencia (Q-12) y la política sobre sesiones/tokens en el cutover (Q-15). ‖ Decidir los demás ADR cuando se vayan necesitando (ver columna *Bloquea tareas*).
- invariantes: Una decisión solo es válida si la registra el propietario; el agente no puede marcar un ADR como aceptado por sí mismo.

### 0005 Analizar tráfico real y consumidores de la API a partir de los logs del proxy
estado=fuera del alcance local (checklist de despliegue del propietario); deps=ninguna
- alcance: Agregar (sin conservar IPs) ≥7 días de logs de Nginx/Cloudflare: peticiones por método+ruta+estado, picos por minuto, `User-Agent` no navegador, orígenes (`Origin`) distintos de refleja.org, rutas 404, llamadas a `/api/health` y su origen.
- invariantes: Privacidad: solo agregados.

### 0006 Crear el crate `back-rs` con el esqueleto completo de módulos y herramientas
estado=completada; deps=0004
- alcance: `back-rs/Cargo.toml` con **todas** las dependencias de ADR-004 (versión verificada con `cargo search`/`cargo add` y registrada en ADR-004), `rust-toolchain.toml`, `rustfmt.toml`, `deny.toml`, `.gitignore` (`target/`, `.env`), `.env.example` (copia de `back/.env.example` + variables que faltan listadas en `06` §2). ‖ `src/main.rs`, `src/lib.rs` y **todos** los archivos de §5 de `01-context.md` como módulos vacíos que compilan; los `routes/{auth,public,platform}/mod.rs` completos (declaran submódulos y mezclan sus `router()`, cada uno devolviendo `Router::new()` por ahora). ‖ `scripts/check.sh` (fmt + clippy + test + `cargo audit`/`deny` si están instalados) y `back-rs/README.md` con comandos. ‖ Añadir `back-rs/target/` y `back-rs/.env` al `.gitignore` de la raíz.
- invariantes: Un archivo pertenece a una sola tarea; esta tarea es la única que puede editar `Cargo.toml`, `lib.rs`, `main.rs` (esqueleto) y los tres `mod.rs` de rutas. Cambios posteriores = solicitud a esta tarea (o a TASK-0044 para cableado final).

### 0007 Construir el harness de pruebas de contrato diferenciales (Python vs Rust)
estado=completada; deps=0006, 0021
- alcance: `back-rs/tests/contract/` con runner (lee `cases/*.json`, modos `record` y `verify`), normalizadores (JWT por claims, `Set-Cookie` por atributos, timestamps por formato, `seconds_ago` ±2 s, conjuntos para empates sin orden). ‖ `tools/mariadb_ephemeral.sh` (datadir temporal, puerto no estándar, esquema cargado desde `back-rs/migrations/0001_baseline.sql` de TASK-0021, que ya incluye `event_counter`) y `tools/run_python_ref.sh` (levanta `back/.venv` contra esa BD con secretos de prueba). ‖ Mock de Turnstile (`TURNSTILE_VERIFY_URL`) controlable (éxito/fallo/timeout). ‖ Comparación del **estado final de tablas** (volcado normalizado). ‖ Un caso de ejemplo (`health`) grabado y verificado.
- invariantes: Los *goldens* se generan **solo** desde Python y no contienen secretos ni datos reales. ‖ El harness no depende de que el Rust exista para grabar.

### 0008 Capturar casos de contrato: meta, CORS, errores de framework y arranque/config
estado=completada; deps=0007
- alcance: Casos de health, 404, 405, barra final 307 (con y sin query string), preflight válido/ inválido, respuesta con `Origin` permitido, guard de origen (`ORIGIN_SECRET`), docs 404 en prod. ‖ Casos de arranque: fail-closed en prod, precedencia `.env` vs entorno, booleanos, `FORMULARIO_PATH` inexistente, `CORS_ORIGINS` con espacios.
- invariantes: Los goldens reflejan Python tal cual, incluidos quirks (ADR-009).

### 0009 Implementar `config.rs`: variables de entorno, `.env`, precedencia y fail-closed en producción
estado=completada; deps=0006
- alcance: `Settings` con **todas** las variables de `06` §2 y sus defaults. ‖ Carga: `.env` del directorio de trabajo (`dotenvy`) + entorno del proceso con precedencia del proceso; `extra` ignorado. ‖ Booleanos al estilo Pydantic (`true/false/1/0/yes/no/on/off`, sin distinguir mayúsculas); enteros inválidos ⇒ error de arranque claro. ‖ `is_prod` = `ENV.to_lowercase().starts_with("prod")`; `bypass_turnstile` = `DEV_BYPASS_TURNSTILE && !is_prod`; `cors_list` (split por coma, trim, sin vacíos). ‖ Validación fail-closed de `JWT_SECRET`, `PUBLIC_TOKEN_SECRET`, `VID_HMAC_KEY` (igual al default o `len < 32` caracteres) con mensaje que nombra la variable. ‖ Traducción de `DATABASE_URL` (`mysql+pymysql://…` → `mysql://…`); URL `sqlite:` ⇒ error claro (ADR-016). ‖ Nueva variable **opcional** `DB_MAX_CONNECTIONS` (default definido en TASK-0011) — documentada.
- invariantes: Mismos nombres y defaults que Python; `ENV` por defecto `development`. ‖ En producción `bypass_turnstile` es siempre `false`.

### 0010 Implementar `error.rs`: errores `{"detail"}`, respuestas 422 y extractores con errores propios
estado=completada; deps=0006
- alcance: `AppError::Detail{status, detail, headers}` y atajos (`unauthorized`, `forbidden`, `too_many`…). ‖ 422: `{"detail":[{"type","loc","msg","input","ctx?"}]}`; `loc` = `["body", …]` / `["query", nombre]` / `["header", nombre]`. ‖ `ApiJson<T>` (body ausente ⇒ `missing` en `["body"]`; JSON malformado ⇒ `json_invalid`; tipos erróneos ⇒ tipo/campo) y `ApiQuery<T>`. ‖ 500 ⇒ cuerpo texto plano `Internal Server Error`; fallback 404 `{"detail":"Not Found"}` y 405 `{"detail":"Method Not Allowed"}` con `allow`. ‖ JSON compacto, UTF-8 sin escapar, `content-type: application/json`.
- invariantes: Estado 422 (no 400) para validación; `detail` string para errores de negocio con el texto exacto en español.

### 0011 Implementar `db.rs`: pool SQLx MariaDB, sesión UTC y verificación de esquema al arrancar
estado=completada; deps=0009, 0021
- alcance: `connect(&Settings) -> MySqlPool`: `charset utf8mb4`, `after_connect: SET time_zone='+00:00'`, `max_lifetime` 1800 s, `test_before_acquire`, `acquire_timeout`, máximo de conexiones desde `DB_MAX_CONNECTIONS` (propuesta: 10, a validar en TASK-0046). ‖ `verify_schema(&pool)`: comprueba tablas y columnas listadas en `migrations/expected_schema.txt` (TASK-0021) y falla con mensaje que enumera lo que falta. ‖ Helper para transacciones (`begin`/`commit`/`rollback` en caída).
- invariantes: Todas las conexiones en UTC (por `func.now()` y `utcnow()` coherentes).

### 0012 Implementar `timefmt.rs`: UTC naive, `isoformat` y `round(x, 4)` compatibles con Python
estado=completada; deps=0006
- alcance: `utcnow_naive()`, `today_utc()`, filtros de rango (`date_from → 00:00`, `date_to + 1 día`). ‖ `isoformat_naive(NaiveDateTime)`: `YYYY-MM-DDTHH:MM:SS` y `.ffffff` (6 dígitos) solo si microsegundos ≠ 0. ‖ `py_round4(f64)` con semántica de `round(x, 4)` de CPython y representación JSON equivalente a `repr(float)`.
- invariantes: `0.0` y `1.0` se serializan con `.0` (como Python `0.0`/`1.0`).

### 0013 Implementar `security/jwt.rs` y `security/hash.rs`: JWT HS256 compatibles con PyJWT, SHA-256, HMAC del vid
estado=completada; deps=0006, 0009
- alcance: `encode_access/refresh/public` y `decode_*` con `typ` obligatorio y secreto correcto (`JWT_SECRET` para access/refresh; `PUBLIC_TOKEN_SECRET` para público). ‖ Claims: access `{typ,sub:String,username,iat,exp}`; refresh `{typ,sub,jti,iat,exp}`; público `{typ,vid,iat,exp}`; `iat`/`exp` enteros en segundos UTC. ‖ Validación: algoritmo **solo** HS256 (rechazar `none`/otros), `exp` con **leeway 0**, y distinguir `Expired` de `Invalid` (el público devuelve «Token expirado.» vs «Token inválido.»). ‖ `sha256_hex`, `hmac_vid` (HMAC-SHA256 hex con `VID_HMAC_KEY`), `new_vid` (16 bytes aleatorios en hex minúsculas), `new_jti` (UUIDv4).
- invariantes: Un token con otro `typ` NO valida. ‖ Los secretos nunca aparecen en logs ni `Debug`.

### 0014 Implementar `security/password.rs`: Argon2id compatible con argon2-cffi y semáforo de memoria
estado=completada; deps=0006, 0009
- alcance: `hash_password` (Argon2id v19, m=65536 KiB, t=3, p=4, salida 32 B, sal 16 B, formato PHC). ‖ `verify_password(stored, password) -> bool` que usa los parámetros **embebidos** en el hash; cualquier error (hash inválido, otro algoritmo) ⇒ `false`. ‖ `needs_rehash(stored)`: igual que `PasswordHasher.check_needs_rehash` de argon2-cffi (compara versión, tipo, m, t, p, longitud de hash y de sal). ‖ Ejecución en `spawn_blocking` con **semáforo** (N configurable, propuesta 2) y cola; `dummy_hash` calculado de forma perezosa una sola vez.
- invariantes: Mismos parámetros por defecto que Python; la contraseña se trata como bytes UTF-8. ‖ La verificación del señuelo cuesta lo mismo que una real (misma función).

### 0015 Implementar `turnstile.rs`: verificación de Cloudflare Turnstile fail-closed
estado=completada; deps=0006, 0009
- alcance: `TurnstileClient::verify(token: Option<&str>, secret: &str, remote_ip: Option<&str>) -> bool`, `verify_login`, `verify_invisible`. ‖ Cliente `reqwest` compartido (rustls, timeout total 8 s, sin redirecciones inseguras). ‖ Bypass: `settings.bypass_turnstile && token == "dev-bypass"` ⇒ `true`. ‖ Token vacío/ausente o secreto vacío ⇒ `false` sin llamada de red. ‖ Solo `success == true` cuenta; error HTTP, JSON inválido o timeout ⇒ `false`.
- invariantes: `remoteip` solo se envía si hay IP.

### 0016 Implementar `app.rs`, `http/*` y `routes/health.rs`: router, CORS, guard de origen, 307/404/405 y arranque
estado=completada; deps=0009, 0010, 0011, 0015, 0018, 0019
- alcance: `AppState` (settings, pool, cliente Turnstile, rate limiter, form_meta) y `build_router(state)`; rutas bajo `/api`. ‖ CORS exacto (orígenes de config, credenciales, métodos `GET,POST,OPTIONS`, cabeceras `Authorization, Content-Type, X-Refleja-Token`, max-age 600; respuestas de preflight: 200 `text/plain` «OK» o 400 «Disallowed CORS origin»; `Vary: Origin`). ‖ Guard de origen **dentro** de CORS: si `ORIGIN_SECRET` ≠ vacío, rutas `/api*` salvo `OPTIONS` exigen la cabecera ⇒ 403 `{"detail":"Origen no autorizado."}` (con cabeceras CORS). ‖ Redirección 307 de `/x/` → `/x` solo cuando `/x` existe (conservando query); 404/405 JSON (fallbacks). ‖ `GET /api/health` ⇒ `{"status":"ok","env":<ENV>}`. ‖ `RequestBodyLimit`, timeout de petición, `TraceLayer` sin cabeceras/IP; `main.rs` (cableado mínimo: config → pool → verify_schema → serve en `APP_HOST:APP_PORT`, apagado con SIGTERM/SIGINT). ‖ Comparación del secreto de origen en tiempo constante.
- invariantes: Respuesta 403 del guard lleva cabeceras CORS. ‖ Ninguna ruta de docs en ningún `ENV`. ‖ El proceso escucha por defecto en `127.0.0.1:20832`.

### 0017 Implementar `http/client.rs`: IP, país y parsers de User-Agent idénticos a Python
estado=completada; deps=0006
- alcance: `client_country`: `CF-IPCountry` con longitud 2 y distinto de `XX`/`T1` ⇒ mayúsculas; si no, `None`. ‖ `client_ip`: `CF-Connecting-IP` o IP del socket; `None` si no hay. ‖ `device_from_ua`: tablet (`iPad|Tablet`, sin distinguir mayúsculas) antes que mobile (`Mobi|Android|iPhone|iPod`), por defecto `desktop`, UA vacío ⇒ `desktop`. ‖ `browser_from_ua` (orden: Edg, OPR/Opera, Chrome sin Chromium, Firefox, Safari, «Otro»; UA vacío ⇒ `None`) y `os_from_ua` (Windows, iOS, macOS, Android, Linux, «Otro»).
- invariantes: Las comparaciones de subcadena son sensibles a mayúsculas salvo los regex marcados `re.I`.

### 0018 Implementar `http/rate_limit.rs`: ventana deslizante de 60 s con LRU acotado
estado=completada; deps=0006
- alcance: `RateLimiter::allow(key, limit) -> bool` con reloj inyectable; descarta marcas ≤ now−60 s; añade la marca solo si se permite; expulsa por LRU al superar 50 000 claves. ‖ Acotar memoria: cada ventana guarda como máximo `limit` marcas.
- invariantes: Con una petición por encima del límite en el mismo segundo ⇒ `false` y **no** se registra la marca.

### 0019 Implementar `form_meta.rs` y `municipios.rs`: allowlist de qids, flujos y slugs de municipio
estado=completada; deps=0006, 0009
- alcance: Resolución de ruta: `FORMULARIO_PATH` o `../front/src/formulario.json` relativo al directorio de trabajo; carga única al arrancar. ‖ Derivación: `qid = questions[k].qid || k`; flujo por prefijo `pareja_|fam_|trab_`; orden de claves del JSON conservado (`serde_json` con `preserve_order`); `INTRO_ORDER` por claves `age`/`start`. ‖ *Fallback* (archivo ausente/ inválido/ sin preguntas): 12 preguntas por flujo + `age`,`start` (+ advertencia en log). ‖ `VALID_QUESTION_IDS = VALID_QIDS ∪ {MINOR,LOCATION,RESULT}`; `qid_ok_for_flow(qid, flow)`. ‖ `normalize_municipio`: `strip().lower()`, espacios→`-`, eliminar `[^a-z0-9-]`, truncar a 48, `strip('-')`, y validar contra los 52 slugs.
- invariantes: Mismo orden del embudo que el JSON actual (13/12/12). ‖ El fallback conserva 12/12/12 (C-06).

### 0020 Implementar `http/extract.rs`: extractores `PublicVid` y `AdminUser` con los mismos errores
estado=completada; deps=0013, 0016, 0025
- alcance: `PublicVid`: 401 `«Falta el token estadístico.»` si no hay cabecera `X-Refleja-Token`; `«Token expirado.»`; `«Token inválido.»` (firma, typ, sin `vid`). ‖ `AdminUser`: 401 `«No autenticado.»` (+`WWW-Authenticate: Bearer`) si falta cabecera o esquema ≠ `bearer` (insensible a mayúsculas); `«Sesión inválida o expirada.»` (+cabecera) ante cualquier error JWT; `«Usuario no válido.»` si el usuario no existe o `is_active=false` (consulta a BD por `sub`). ‖ **Orden**: los extractores de auth deben ejecutarse **antes** que los de body/query (ordenar parámetros del handler o usar `from_request` con auth primero) para que 401 preceda a 422.
- invariantes: `split(" ",1)[1].strip()` para extraer el token; el prefijo `bearer ` se compara en minúsculas.

### 0021 Crear migraciones SQL baseline idempotentes y la lista de esquema esperado
estado=completada; deps=0002, 0004, 0006
- alcance: `back-rs/migrations/0001_baseline.sql`: 8 tablas con `CREATE TABLE IF NOT EXISTS` (incluye `event_counter`) y columnas de cuotas/`counted`, idénticas al DDL de producción de TASK-0002 (si difiere de `seed.example.sql`, **prevalece producción**). ‖ `migrations/expected_schema.txt` (tabla.columna.tipo) usado por `db::verify_schema`. ‖ `scripts/apply_schema.sh` para aplicar con el cliente `mariadb` a una BD local. ‖ Prueba que aplicar la migración sobre la BD ya migrada es *no-op*.
- invariantes: Mismas tablas, columnas, tipos, índices y FKs que producción; ON UPDATE solo donde exista en producción (D-2).

### 0022 Implementar `repo/visitor.rs`: get-or-create, touch y cuotas atómicas
estado=completada; deps=0011, 0012, 0021
- alcance: `Visitor` (campos de `04` §2), `get_or_create(tx, vid_hash, country, device) -> (Visitor, created)` (SELECT → INSERT tolerando `duplicate key` → SELECT). ‖ `touch(tx, vid_hash)` ⇒ `last_seen_at = utcnow`. ‖ `bump_quota(tx, vid_hash, events, runs, completions, page_views, actions)` en **un** UPDATE con `col = col + ?` y `last_seen_at`, `updated_at`.
- invariantes: `get_or_create` de un visitante existente **no** modifica country/device.

### 0023 Implementar `repo/counters.rs`: `question_stat`, `event_counter` y `daily_metric` atómicos
estado=completada; deps=0011, 0012, 0021
- alcance: `bump_question(tx, qid, reached, answered)`: ignora qid ∉ `VALID_QUESTION_IDS` y deltas 0. ‖ `bump_counter(tx, name, n)`: trunca `name` a 64 caracteres; ignora vacío o `n==0`. ‖ `bump_daily(tx, deltas)`: fecha = hoy UTC; filtra deltas 0; columnas permitidas `page_views, form_starts, form_completes, minors, new_visitors`. ‖ Implementar con `INSERT … ON DUPLICATE KEY UPDATE x = x + ?` fijando `updated_at`.
- invariantes: Resultado final idéntico a SELECT+INSERT+UPDATE de Python, incluso con llamadas concurrentes.

### 0024 Implementar `repo/form_run.rs`: runs con `counted` JSON y `updated_at` garantizado
estado=completada; deps=0011, 0012, 0021
- alcance: `FormRun` con todas las columnas; `counted: Option<Counted{r: Vec<String>, a: Vec<String>}>` serializado como JSON (texto en MariaDB). ‖ `get_by_uid`, `create(uid, visitor_id)` tolerante a carrera (devuelve el existente), `save(&run)` ⇒ `UPDATE` de columnas mutables + `updated_at = NOW()`.
- invariantes: Toda modificación persistida actualiza `updated_at`. ‖ `run_uid` único global.

### 0025 Implementar `repo/admin.rs`: usuarios, sesiones de refresh e historial de login
estado=completada; deps=0011, 0012, 0021
- alcance: `get_user_by_username`, `get_user_by_id`, `set_last_login(user_id, now)`, `set_password_hash(user_id, hash)`. ‖ `insert_login(AdminLogin)`, `insert_session(NewSession)`, `get_session_by_jti`, `revoke_session(id, now)`, `revoke_all_active(user_id, now)` (solo las `revoked_at IS NULL`).
- invariantes: `username` sensible a mayúsculas según la colación `utf8mb4_unicode_ci` (comparación de MariaDB, **insensible**): no normalizar en Rust; documentar el comportamiento observado.

### 0026 Implementar `POST /api/auth/login` (y helpers de sesión/cookie compartidos)
estado=completada; deps=0007, 0009, 0010, 0012, 0013, 0014, 0015, 0016, 0017, 0025
- alcance: Handler `POST /auth/login` con orden: 422 → Turnstile (403) → usuario → verificación Argon2 **siempre** (real o señuelo) → 401 → `needs_rehash` → `last_login_at` → `admin_login` (browser/os/device por UA, país, UA ≤255) → `admin_session` (`sha256` del refresh, `sha256` del UA, `expires_at`) → commit. ‖ Respuesta `{access_token, token_type:"bearer", expires_in: ACCESS_TTL*60}` y `Set-Cookie` exacto (`HttpOnly`, `Max-Age`, `Path=/api/auth`, `SameSite`, `Secure` si `COOKIE_SECURE||is_prod`, `Domain` si configurado). ‖ `routes/auth/session.rs` (`issue_session`) y `routes/auth/cookie.rs` (set/clear) usados también por 0027/0028. ‖ Casos de contrato CT-050…056 (grabados de Python).
- invariantes: Sin IP en BD ni logs. ‖ La contraseña nunca se registra. ‖ El mensaje de 403 es `«Verificación anti-bot fallida.»`.

### 0027 Implementar `POST /api/auth/refresh` con rotación y detección de reuso
estado=completada; deps=0007, 0010, 0013, 0016, 0025, 0026
- alcance: Ramas y mensajes exactos de `02` EP-006; en éxito: `revoked_at=now` en la sesión vieja, nueva sesión, nueva cookie, nuevo access token. ‖ Reuso (sesión ya revocada): `UPDATE … SET revoked_at=now WHERE admin_user_id=? AND revoked_at IS NULL`, commit, `WARN` con `admin_user_id`, 401 «Sesión revocada por seguridad.». ‖ Comparar `sha256(cookie)` con `token_hash`; expiración con `expires_at < now`. ‖ Casos CT-057…064 y prueba de concurrencia.
- invariantes: Un refresh rotado deja de ser válido. ‖ La familia completa se invalida al reutilizar.

### 0028 Implementar `POST /api/auth/logout`
estado=completada; deps=0007, 0010, 0013, 0016, 0025, 0026
- alcance: Con cookie válida y no revocada ⇒ `revoked_at=now`+commit; JWT inválido se ignora; siempre 200 `{"ok":true}` + `Set-Cookie` de borrado (`Max-Age=0`, `expires` en el pasado, `Path=/api/auth`). ‖ CT-065.
- invariantes: No devuelve 401 nunca.

### 0029 Implementar `GET /api/auth/me`
estado=completada; deps=0007, 0010, 0016, 0020, 0025
- alcance: Handler con extractor `AdminUser`; `last_login_at` ISO naive o `null`. ‖ CT-066 (401×3 + 200) y comportamiento de `last_login_at` con MariaDB (Q-07).
- invariantes: Formato de fecha igual a `datetime.isoformat()` observado en MariaDB local.

### 0030 Implementar `POST /api/public/session`
estado=completada; deps=0007, 0010, 0013, 0015, 0016, 0017, 0018, 0022, 0023
- alcance: Orden: 422 → rate limit `sess:<ip>` (30/min; `ip` o «unknown») ⇒ 429 «Demasiadas solicitudes.» → Turnstile invisible ⇒ 403 → `new_vid`, `hmac_vid`, device por UA, país → `get_or_create` + `bump_daily(new_visitors=1)` si creado → commit → JWT público. ‖ Respuesta `{token, expires_in_days}`. ‖ CT-010…014.
- invariantes: El `vid` en claro solo viaja en el JWT; en BD solo `hmac_vid`. ‖ IP solo para Turnstile y rate limit.

### 0031 Implementar `POST /api/public/ping`
estado=completada; deps=0007, 0010, 0016, 0017, 0018, 0020, 0022
- alcance: Extractor `PublicVid`; rate limit `ping:<vid_h>` 30/min ⇒ 429 «Demasiadas señales.»; `get_or_create` (sin sumar `new_visitors`) + `touch`; `{"ok":true}`. ‖ CT-015…018.
- invariantes: Si el visitante no existe se crea (comportamiento actual).

### 0032 Implementar `collect/schema.rs`: esquemas de entrada y validación equivalentes a Pydantic
estado=completada; deps=0007, 0010, 0006
- alcance: Tipos: `EventType` (10 valores), `Scores` (6 enteros 0..=60, default 0), `CollectEvent` (campos y límites de `02` EP-004: longitudes en **caracteres**, `step` 0..=20, enums cerrados), `CollectBatch{events: 0..=50}`. ‖ Compatibilidad: si no existe `events` pero sí `type`, tratar el objeto como `{events:[objeto]}`. ‖ Campos desconocidos ignorados; `null` en opcionales ⇒ `None`. ‖ **Sondear Python** para fijar coerciones (lax mode): `"5"`→int, `5.0`→int, `5.5`→error, `true`→int, strings numéricos en campos str, etc.; replicar o listar divergencias para aprobación. ‖ Errores a 422 con `loc` correcto (`["body","events",0,"type"]`…).
- invariantes: Un lote de 50 es válido; 51 ⇒ 422; vacío ⇒ válido.

### 0033 Implementar `collect/quota.rs` y `collect/actions.rs`: cuotas por vida y eventos de acción
estado=completada; deps=0007, 0019, 0022, 0023, 0032
- alcance: `Quota` (valores iniciales del visitante + deltas; `events_left`, `can_create_run`, `actions_left` con `PUBLIC_MAX_*`). ‖ `process_action(tx, &mut Quota, &Event)`: si `!actions_left` ⇒ ignora; si no, `d_actions+=1` y efecto (ver `03`); `directory_municipio` cuenta la acción aunque el municipio sea inválido. ‖ CT-031…033, CT-043.
- invariantes: `page_view` suma `daily_metric.page_views` y `d_page_views` (→ `visitor.page_views` vía `bump_quota`). ‖ Contadores con nombre exacto: `urgent_click`, `hide_click`, `restart`, `dir_muni:<slug>`.

### 0034 Implementar `collect/runs.rs`: `run_start`, `answer`, `minor`, `municipio`, `result` con idempotencia por qid
estado=completada; deps=0007, 0019, 0023, 0024, 0032, 0033
- alcance: `run_for`: `None` si falta/vacío `run_uid`, o si no existe y `!can_create_run`; si no existe y hay cuota ⇒ crear y `d_runs+=1`. ‖ `count_q(run, qid, kind)`: ignora qid ∉ `VALID_QUESTION_IDS`; una vez por run y tipo; actualiza `run.counted` y `bump_question`. ‖ Reglas de `run_start`, `answer` (coherencia de flujo, `form_starts` la primera vez que se fija flujo y no está completado, sobrescritura de `flow_type`, `age_bucket`, `max_step`, `last_question_id=nxt or question_id`), `minor`, `municipio`, `result` (reemplazo de los 6 scores si vienen, completado único).
- invariantes: `form_completes`/`minors` se suman una vez por run. ‖ El `flow_type` del evento puede sobrescribir el del run. ‖ `started` se marca como en Python (no en `municipio`).

### 0035 Implementar `POST /api/public/collect`: orquestación, transacción y rate limit
estado=completada; deps=0007, 0016, 0017, 0018, 0020, 0022, 0032, 0033, 0034
- alcance: `routes/public/collect/mod.rs`: handler con orden 401 → 422 → 429 (`coll:<vid_h>`, 120/min, «Demasiadas peticiones.») → `device` (primer evento con device) → `get_or_create` → bucle (`events_left`) → `bump_quota` → commit → `{ok:true, accepted}`. ‖ Transacción única; error en medio ⇒ rollback y 500. ‖ CT-020, CT-044…046 y pruebas de concurrencia (varios lotes simultáneos del mismo token y del mismo run).
- invariantes: Ningún evento tras alcanzar `PUBLIC_MAX_EVENTS` se procesa; no es error. ‖ El lote vacío es 200 `accepted:0`.

### 0036 Implementar filtros compartidos y `GET /api/platform/overview`
estado=completada; deps=0007, 0010, 0016, 0020, 0012, 0022, 0023, 0024
- alcance: Query: `date_from`, `date_to` (fecha ISO), `flow_type`, `municipio` (strings libres); 422 con `loc ["query",…]`. Filtro: `created_at >= date_from 00:00` y `< (date_to+1d) 00:00`, `flow_type =`, `municipio =`. ‖ Las 13 claves de respuesta con sus fuentes (filtradas y no filtradas, ver `02`), `completion_rate`/`start_rate` con `py_round4`, `active_now` ventana 90 s. ‖ CT-070…072.
- invariantes: `total_visitors`, `active_now`, `entered_not_started`, `repeat_visitors` y contadores NO se filtran. ‖ Con denominador 0 las tasas valen `0.0`.

### 0037 Implementar `GET /api/platform/realtime`
estado=completada; deps=0007, 0010, 0016, 0020, 0012, 0022, 0024
- alcance: `window_seconds` (5..=900, def. 90), `limit` (1..=100, def. 20) con 422 fuera de rango. ‖ `by_device`/`by_country` como objetos; clave `"null"` para nulos. ‖ `recent_runs` por `updated_at DESC` con `seconds_ago = max(int(now-updated_at),0)`. ‖ CT-073, CT-074.
- invariantes: Clave `"null"` (quirk, ADR-009). ‖ Orden de claves del objeto: orden de resultado de la consulta; comparar como mapa.

### 0038 Implementar `GET /api/platform/funnel`
estado=completada; deps=0007, 0010, 0016, 0020, 0012, 0019, 0023
- alcance: Estructura exacta (`intro[]`, `flows{pareja[],fam[],trab[]}`, `completed_by_flow{}`, `top_reached[]`), `drop = max(reached-answered,0)`, `drop_rate = py_round4(drop/reached)` (0.0 si reached=0). ‖ `top_reached`: filas de `question_stat` excepto `MINOR/LOCATION/RESULT`, ordenadas por `reached` desc y **estables**; documentar el desempate observado en MariaDB. ‖ CT-075.
- invariantes: El orden de pasos sale de `form_meta.FLOW_ORDER`/`INTRO_ORDER`. ‖ `top_reached` incluye `age` y `start`.

### 0039 Implementar `GET /api/platform/violence`
estado=completada; deps=0007, 0010, 0016, 0020, 0024, 0036
- alcance: Filtros de `filters.rs`. `totals` (SUM con COALESCE), `present` (>0), `dominant` (primero en orden `psicologica,fisica,economica,patrimonial,sexual,intimidacion` con el máximo si máximo>0), `completed_runs`. ‖ Calcular `present`/`dominant` **en SQL o en streaming** (no cargar todo a memoria) manteniendo resultados idénticos; justificarlo con prueba de equivalencia. ‖ CT-076.
- invariantes: Empates: gana el primero del orden fijo.

### 0040 Implementar `GET /api/platform/municipios`
estado=completada; deps=0007, 0010, 0016, 0020, 0023, 0036
- alcance: `limit` 1..=100 (def. 60); `items` agrupa `form_run.municipio IS NOT NULL` con filtros de fecha y `flow_type` (sin `municipio`), orden `count DESC`; `directory` de `event_counter` `name LIKE 'dir_muni:%'` orden `count DESC` limit; `municipio = name.split(':',1)[1]`. ‖ CT-077.
- invariantes: Empates sin orden definido: comparar como conjunto o con el orden observado.

### 0041 Implementar `GET /api/platform/timeseries`
estado=completada; deps=0007, 0010, 0016, 0020, 0012, 0023
- alcance: `date_from`/`date_to` inclusivos sobre `metric_date`, orden ASC, `date` en ISO (`YYYY-MM-DD`). ‖ CT-079, CT-080.
- invariantes: Rango vacío ⇒ `items: []`.

### 0042 Implementar `GET /api/platform/logins`
estado=completada; deps=0007, 0010, 0016, 0020, 0012, 0025
- alcance: `limit` 1..=500 (def. 100), `ORDER BY created_at DESC`; campos exactos; `created_at` ISO naive. ‖ CT-078, CT-081.
- invariantes: Sin IP.

### 0043 Crear la CLI `refleja-admin` (generar hash Argon2 y alta de administrador)
estado=completada; deps=0009, 0011, 0014, 0025
- alcance: `refleja-admin hash-password` (lee la contraseña de la entrada estándar/prompt sin eco; imprime el PHC). ‖ `refleja-admin create-admin --username <u>` (contraseña por prompt o `REFLEJA_ADMIN_PASSWORD`; idempotente: no duplica; ≥12 caracteres y rechaza `admin`). ‖ Usa `DATABASE_URL`/`.env` como el servicio.
- invariantes: La contraseña nunca aparece en argumentos de línea de comandos ni en logs.

### 0044 Tarea de integración: ensamblado final, suite completa y matriz de trazabilidad
estado=completada; deps=0008, 0026, 0027, 0028, 0029, 0030, 0031, 0035, 0036, 0037, 0038, 0039, 0040, 0041, 0042, 0043
- alcance: Revisar los diffs de todas las tareas contra `01`, ADR y contratos; ejecutar fmt/clippy/test/contract completos. ‖ Cableado final de `main.rs`/`routes` (único punto donde se admiten ediciones transversales). ‖ Crear `docs/migration/traceability.md` (EP-xxx, FL-xxx, CT-xxx, P-xx → tarea, archivo, prueba, estado real). ‖ Registrar desviaciones y quirks restantes con ADR.
- invariantes: Ninguna fila de la matriz con estado `verificado` sin evidencia de ejecución.

### 0045 Revisión de seguridad y pruebas de seguridad del backend Rust
estado=completada; deps=0044
- alcance: Pruebas en `tests/security/`: fail-closed, bypass imposible en prod, `alg:none`/otro `typ`, reuso de refresh, enumeración por tiempo, cookie flags, CORS, límites de body, logs sin IP/secretos (inspección de salida), `cargo audit`/`cargo deny`. ‖ Revisión de `unsafe` (debe ser 0) y de manejo de errores (`unwrap`/`expect` en rutas de petición). ‖ Actualizar `05` con resultados y hallazgos nuevos.
- invariantes: Cualquier mejora (S-01…S-07) sin ADR aceptado se registra como recomendación, no se implementa.

### 0046 Medir memoria y latencia de Rust vs Python con carga representativa
estado=completada; deps=0001, 0044
- alcance: Scripts en `back-rs/bench/` que levantan Python y Rust con la misma BD de datos sintéticos y generan carga con el perfil de TASK-0001/0005 (mezcla de ping/collect/session y panel). ‖ Métricas: RSS/PSS en reposo y tras la carga, pico durante N logins concurrentes, p50/p95/p99, errores, conexiones a BD usadas. ‖ Informe `docs/migration/evidence/bench-<fecha>.md` con comandos exactos.
- invariantes: Misma máquina, mismo dataset y misma duración para ambos backends.

### 0047 Preparar empaquetado, unidad systemd, script de despliegue y rollback para el binario Rust
estado=completada; deps=0003, 0044
- alcance: `back-rs/deploy/refleja-api-rs.service` (mismo usuario, `WorkingDirectory`, `Restart`, `NoNewPrivileges`; **otro puerto** para convivencia, ADR-017), sudoers equivalente, `deploy-rs.sh` (descarga/copia del binario, *swap* atómico, healthcheck a `/api/health`, rollback al binario anterior). ‖ Documentar el build reproducible del binario (target y flags) y dónde se publica el artefacto. ‖ Ensayo en un entorno de prueba (VM/local) con el mismo layout de directorios.
- invariantes: Rollback restablece servicio en <1 min sin recompilar.

### 0048 Redactar el runbook de despliegue gradual y conmutación (cutover) con criterios go/no-go
estado=completada; deps=0045, 0046, 0047
- alcance: Fases: preflight (backup, versión de esquema, secretos idénticos), *shadow* en puerto alterno (health + lectura de panel con admin de prueba), conmutación del reverse proxy, observación (métricas a mirar y umbrales), rollback inmediato, retiro diferido de Python. ‖ Checklist go/no-go con criterios medibles (error rate, p95, RSS, conteos coherentes entre ambos backends en la ventana compartida). ‖ Plan de comunicación.
- invariantes: Los tokens existentes siguen válidos (mismos secretos); si Q-15 permite cerrarlos, documentarlo.

### 0049 Actualizar documentación operativa: READMEs, tareas de VS Code y referencias
estado=completada; deps=0044
- alcance: Actualizar `README.md` raíz (estructura, cómo correr), añadir `back-rs/README.md` definitivo, tareas/lanzadores de `.vscode/`, y un aviso en `back/README.md` sobre el estado del backend Python. ‖ Corregir las contradicciones C-01 (8 tablas), C-02 (`/logins`), C-07 (`venv` vs `.venv`).
- invariantes: El puerto local de desarrollo sigue siendo 20832 (el front lo asume).

### 0050 Retirar el backend Python (solo con autorización explícita tras un cutover estable)
estado=fuera del alcance local (checklist de despliegue del propietario); deps=0048
- alcance: Crear una etiqueta git del último commit con Python (`python-backend-final`), retirar `back/`, `back/deploy*`, referencias en docs y `.gitignore`, y actualizar `README.md`. ‖ Verificar que nada del front o de la documentación referencia `back/`.
- invariantes: Reversible vía la etiqueta git.
