# 04 · Datos e integraciones

## 1. Motores
| Entorno | Motor | Evidencia |
|---|---|---|
| Producción | MariaDB 11.x (cabecera de `seed.example.sql:2`; versión exacta `[DESCONOCIDO]`) vía PyMySQL, `charset=utf8mb4` | `.env.example`, `README` |
| Desarrollo | SQLite (`sqlite:///./refleja_dev.db`) | `config.py:27`, `database.py:15-17` |
| Redis | **No se usa** `[CONFIRMADO]` (comentario que lo sugiere como mejora futura: `public.py:34-37`) |
| R2 / almacenamiento de objetos | **No se usa** `[CONFIRMADO]` |
| Colas / correo / webhooks | **No se usan** `[CONFIRMADO]` |

Conexión (MySQL): `pool_pre_ping=True`, `pool_recycle=1800`, `SET time_zone='+00:00'` en cada conexión (`database.py:20-24`). Pool por defecto de SQLAlchemy: `pool_size=5`, `max_overflow=10`, **por worker** (no configurado ⇒ defaults) `[INFERIDO]`.
Sesión síncrona por petición; `autoflush=False`, `expire_on_commit=False`. Los *handlers* son `def` (corren en el threadpool de 40 hilos de AnyIO) `[CONFIRMADO]`.

## 2. Esquema (declarado) — 8 tablas
Fuente: `back/seed.example.sql` (7 tablas) + `back/app/models.py` (8, incluye `event_counter`). Todas llevan `created_at`/`updated_at` (UTC, `DATETIME` sin fracciones). Charset `utf8mb4_unicode_ci`, InnoDB.

| Tabla | Columnas relevantes (tipo) | Claves / índices | Escritores | Lectores |
|---|---|---|---|---|
| `admin_user` | `id BIGINT AI`, `username VARCHAR(64) UNIQUE`, `password_hash VARCHAR(255)` (Argon2id PHC), `is_active TINYINT(1)`, `last_login_at DATETIME NULL` | `uq_admin_username` | login (`last_login_at`, re-hash), seed | login, refresh, me, require_admin |
| `admin_session` | `id`, `admin_user_id FK CASCADE`, `refresh_jti CHAR(36) UNIQUE`, `token_hash CHAR(64)` (sha256 hex), `user_agent_hash CHAR(64) NULL`, `expires_at`, `revoked_at NULL` | `uq_refresh_jti`, `idx_session_user`, `idx_session_expires` | login, refresh, logout | refresh, logout |
| `visitor` | `id`, `vid_hash CHAR(64) UNIQUE` (HMAC-SHA256 hex), `country CHAR(2) NULL`, `device VARCHAR(16) NULL`, `page_views INT`, `events_count/run_count/completed_count/action_count INT`, `last_seen_at DATETIME` | `uq_visitor_vid`, `idx_visitor_last_seen`, `idx_visitor_created` | session, ping, collect | collect, overview, realtime |
| `form_run` | `id`, `run_uid CHAR(36) UNIQUE`, `visitor_id FK SET NULL`, `age_bucket VARCHAR(16)`, `flow_type VARCHAR(8)`, `started`, `max_step SMALLINT`, `last_question_id VARCHAR(32)`, `completed`, `municipio VARCHAR(48)`, `risk_level VARCHAR(8)`, 6×`score_* SMALLINT`, `counted JSON NULL` | `uq_run_uid`, `idx_run_visitor/flow/municipio/completed/created/updated` | collect | collect, overview, realtime, funnel, violence, municipios |
| `question_stat` | `question_id VARCHAR(32) UNIQUE`, `reached_count BIGINT`, `answered_count BIGINT` | `uq_question_id` | collect | funnel |
| `daily_metric` | `metric_date DATE UNIQUE`, `page_views, form_starts, form_completes, minors, new_visitors BIGINT` | `uq_metric_date` | session, collect | timeseries |
| `admin_login` | `admin_user_id FK SET NULL`, `username VARCHAR(64)`, `browser VARCHAR(40)`, `os VARCHAR(40)`, `device VARCHAR(16)`, `country CHAR(2)`, `user_agent VARCHAR(255)` | `idx_login_user`, `idx_login_created` | login | logins |
| `event_counter` | `name VARCHAR(64) UNIQUE`, `count BIGINT` | UNIQUE(name) | collect | overview (3 contadores), municipios (`dir_muni:*`) |

Nombres de contador usados: `urgent_click`, `hide_click`, `restart`, `dir_muni:<slug>` (slug ∈ 51 municipios + `otro` = 52 valores, lista cerrada en `analytics.py:29-41`; ≤64 chars).

### 2.1 Discrepancias entre esquema declarado, modelos y README
| # | Hallazgo | Estado |
|---|---|---|
| D-1 | `seed.example.sql` **no contiene `event_counter`**; solo la crea `create_all` al arrancar con tipos generados por SQLAlchemy | `[CONFIRMADO]` |
| D-2 | `create_all` define `updated_at` con `DEFAULT now()` pero **sin `ON UPDATE CURRENT_TIMESTAMP`** (el `onupdate` es del lado Python). Las 7 tablas de `seed.sql` sí lo tienen en el DDL. En la práctica `updated_at` lo fija SQLAlchemy en cada UPDATE (ORM y Core) | `[CONFIRMADO]` (código) |
| D-3 | `README` dice "6 tablas"; el código define 8 | `[CONTRADICTORIO]` |
| D-4 | `README` dice que `migration.sql` crea `admin_login` + usuarios; el archivo local está vacío (0 B) y `admin_login` está en `seed.example.sql` | `[CONTRADICTORIO]` |
| D-5 | Esquema real de producción (columnas añadidas por *light migrations*, tipos reales, índices) | `[DESCONOCIDO]` → TASK-0002 |
| D-6 | `models.py`: `AdminSession.admin_user_id` y `FormRun.visitor_id` son `BigInteger`; `seed.example.sql` define `BIGINT` — coherente. `JSON` en MariaDB es alias de `LONGTEXT` | `[CONFIRMADO]` |

**Invariante a preservar:** `form_run.updated_at` debe actualizarse en **toda** modificación del run porque `/platform/realtime` ordena por él (`platform.py:166`). En Rust: `SET updated_at = UTC_TIMESTAMP()/NOW()` explícito (el ON UPDATE de BD no se puede asumir, D-2).

## 3. Consultas (inventario)
SQLAlchemy ORM/Core generado; no hay SQL crudo ni procedimientos, triggers ni vistas `[CONFIRMADO]` (único SQL literal: los 5 `ALTER … ADD COLUMN IF NOT EXISTS`, `database.py:57-63`).

**Escrituras (atomicidad):** todas son incrementos SQL (`x = x + n`) o inserciones con *upsert* manual (SELECT → INSERT en SAVEPOINT → UPDATE). Patrones a conservar:
- Contadores/rollups: `_ensure_*` (SELECT, INSERT en SAVEPOINT tolerante a `IntegrityError`) + `UPDATE … SET col = col + n`. En Rust se puede reemplazar por `INSERT … ON DUPLICATE KEY UPDATE col = col + VALUES(col)` (equivalente observable; ADR-007).
- `get_or_create_visitor`: SELECT → INSERT (SAVEPOINT) → reintento SELECT ante colisión.
- `form_run`: lectura por `run_uid`, modificación en memoria, UPDATE completo al commit (**incluye JSON `counted`**).

**Lecturas del panel:** `COUNT`, `COUNT(DISTINCT visitor_id)`, subconsulta `GROUP BY visitor_id HAVING COUNT(id) > 1`, `SUM` de 6 columnas, `GROUP BY municipio ORDER BY count DESC LIMIT n`, `SELECT * ORDER BY updated_at DESC LIMIT n`, etc. (`platform.py`). `/violence` carga **todas** las filas completadas con 6 columnas a memoria para calcular `present/dominant` (sin límite; O(n) en filas) — candidato a agregarse en SQL (TASK-0039).
**Riesgos de rendimiento (con evidencia):** `/violence` sin límite; `/overview` hace ~9 consultas secuenciales; resto acotado por `limit`. N+1: no se observa.

## 4. Tipos, nulos y fechas (reglas de conversión)
- **Fechas:** `DATETIME` naive en UTC; Python usa `datetime.now(timezone.utc).replace(tzinfo=None)` (`security.py:71-73`). `metric_date` = fecha UTC (`analytics._today`). Serialización JSON: ISO sin zona (`isoformat()`); `last_login_at` vía Pydantic (también ISO naive). Ver incógnita Q-07 sobre microsegundos.
- **Booleanos:** `TINYINT(1)` ↔ `bool` (`started`, `completed`, `is_active`).
- **Enteros:** `SMALLINT` para scores/`max_step`; `BIGINT` para contadores; los *rates* usan `float` redondeado con `round(x, 4)` de Python (redondeo del *double* exacto, ver ADR-012).
- **JSON:** solo `form_run.counted` (`{"r":[…],"a":[…]}` o `NULL`).
- **UUID:** `run_uid` es texto libre ≤36 (no se valida como UUID); `refresh_jti` es `uuid4` en texto.
- **Decimales:** no hay.

## 5. Migraciones y semillas
`back/migrations/002_visitor_quota.sql` (idempotente; **no hay 001**) y las 5 *light migrations* de `init_db`. Semillas: `seed.sql` (confidencial), `seed.example.sql` (plantilla), `app/seed.py` (dev). Orden documentado: `seed.sql` → `migration.sql` → reinicio del servicio. Sin herramienta de migración versionada `[CONFIRMADO]`.

## 6. Retención, borrado, auditoría
Sin purga automática: `admin_session` (sesiones expiradas/revocadas), `admin_login`, `visitor`, `form_run` crecen indefinidamente. Sin auditoría más allá de `admin_login`. Política de retención `[DESCONOCIDO]` (→ pregunta Q-09).

## 7. Integraciones externas
| Integración | Propósito | Contrato | Auth | Timeout / reintentos | Degradación | Evidencia |
|---|---|---|---|---|---|---|
| **Cloudflare Turnstile `siteverify`** | Anti-bot en `/public/session` (secret *invisible*) y `/auth/login` (secret *managed*) | `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` `application/x-www-form-urlencoded` `secret`, `response`, `remoteip?`; usa solo `success` | secret en `.env` | 8 s, sin reintentos | cualquier error/timeout/HTTP≠2xx ⇒ `false` ⇒ 403 (fail-closed) | `turnstile.py` |
| **Cloudflare (proxy)** | Cabeceras `CF-IPCountry`, `CF-Connecting-IP`; TLS/DNS | cabeceras HTTP | — | — | sin cabeceras ⇒ país `None`, IP del socket | `deps.py` |
| **CloudPanel / Nginx** | Reverse proxy a `127.0.0.1:20832` | — | restricción de origen a Cloudflare (según README) | — | `[NO VERIFICADO]` la configuración real | `README` |
| **Front (estático)** | Consumidor de la API; además provee `formulario.json` que el backend **lee del disco** | ver `02` | — | — | fallback a estructura 12/12/12 | `form_meta.py:42-46` |
| **freeipapi.com / ipapi.co** | *Solo front* (geolocalización del municipio) | — | — | — | **No** es del backend | `front/src/municipio.js:358-367` |

No hay SDKs de terceros más allá de `httpx` (HTTP) y el widget JS de Turnstile en el front.

## 8. Contrato implícito con `formulario.json`
El backend deriva `VALID_QIDS`, `QID_FLOW`, `FLOW_ORDER` e `INTRO_ORDER` de `front/src/formulario.json` **al importar** (por defecto `repo/front/src/formulario.json`, o `FORMULARIO_PATH`).
Hoy: 39 claves (`age`, `start`, `pareja_1..13`, `fam_1..12`, `trab_1..12`), ninguna con `qid` distinto de su clave `[CONFIRMADO]`. `flowLengths` del JSON coincide (13/12/12). El orden de claves del JSON define el orden del embudo. Cambiar el formulario exige **reiniciar** el servicio (carga única) `[CONFIRMADO]`.
La migración debe decidir cómo obtener este archivo (leerlo en runtime desde el checkout vs. embebido en el binario) → ADR-013.
