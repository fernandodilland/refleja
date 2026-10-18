# 02 · Inventario de endpoints

Fuente de verdad: código (`back/app/main.py`, `back/app/routers/*.py`) **+ ejecución local** (`evidence/python-baseline/`).
No hay OpenAPI publicado en producción (`docs_url`/`openapi_url` = `None` si `ENV` empieza por `prod`, `main.py:30-32`),
por lo que no existe especificación que comparar; la comparación OpenAPI↔código **no aplica** (ver §4). Routers registrados
en `main.py:70-72` con prefijo `/api`. No hay registro dinámico de rutas, WebSockets, webhooks entrantes ni rutas condicionales
salvo `/api/docs` y `/api/openapi.json` (solo `ENV` ≠ prod).

**Total: 15 rutas de aplicación + 2 de documentación (dev) + comportamientos implícitos del framework.**

| ID | Método y path | Auth | Dominio | Tarea de migración |
|---|---|---|---|---|
| EP-001 | `GET /api/health` | ninguna | meta | TASK-0016 |
| EP-002 | `POST /api/public/session` | Turnstile invisible | public | TASK-0030 |
| EP-003 | `POST /api/public/ping` | `X-Refleja-Token` | public | TASK-0031 |
| EP-004 | `POST /api/public/collect` | `X-Refleja-Token` | public | TASK-0032…0035 |
| EP-005 | `POST /api/auth/login` | Turnstile managed + credenciales | auth | TASK-0026 |
| EP-006 | `POST /api/auth/refresh` | cookie `refleja_rt` | auth | TASK-0027 |
| EP-007 | `POST /api/auth/logout` | cookie (opcional) | auth | TASK-0028 |
| EP-008 | `GET /api/auth/me` | Bearer access | auth | TASK-0029 |
| EP-009 | `GET /api/platform/overview` | Bearer access | platform | TASK-0036 |
| EP-010 | `GET /api/platform/realtime` | Bearer access | platform | TASK-0037 |
| EP-011 | `GET /api/platform/funnel` | Bearer access | platform | TASK-0038 |
| EP-012 | `GET /api/platform/violence` | Bearer access | platform | TASK-0039 |
| EP-013 | `GET /api/platform/municipios` | Bearer access | platform | TASK-0040 |
| EP-014 | `GET /api/platform/logins` | Bearer access | platform | TASK-0042 |
| EP-015 | `GET /api/platform/timeseries` | Bearer access | platform | TASK-0041 |
| EP-016 | `GET /api/docs`, `GET /api/openapi.json` | ninguna | meta (**solo dev**) | no migrar (ADR-011) |
| EP-IMP-1 | Redirección de barra final (`/api/health/` → 307) | — | framework | TASK-0016 |
| EP-IMP-2 | 404 / 405 JSON por defecto | — | framework | TASK-0016/0010 |
| EP-IMP-3 | Preflight CORS `OPTIONS` | — | framework | TASK-0016 |
| EP-IMP-4 | Guard de origen (`X-Origin-Secret`) | — | middleware | TASK-0016 |

> `GET /api/platform/logins` **no figura** en `back/README.md:16-17` pero existe en código (`platform.py:332`) y el front lo usa
> (`platform.js:618`). `[CONTRADICTORIO]` documentación ↔ código. Prevalece el código.

## 0. Convenciones transversales (aplican a todos)

- **Errores**: `HTTPException` → `{"detail": "<texto en español>"}` con cabeceras opcionales. Validación Pydantic/FastAPI → **422** con
  `{"detail":[{"type","loc","msg","input","ctx"}]}` (formato de Pydantic v2) `[EJECUTADO]`. El front solo lee `detail` en el login
  (`front/src/acceso.js:75`) y el resto solo usa `r.ok` / `r.status` (`analytics.js:131,175,277,282`, `auth-common.js:36,64`, `platform.js:37`).
  → Los **códigos de estado** y los `detail` de tipo string son contrato; el *formato exacto* de los mensajes 422 es contrato **débil**
  (ADR-008).
- **Orden de evaluación** (FastAPI): en `/public/collect`, `/public/ping` y todo `/platform/*` la **dependencia de auth se resuelve antes
  que la validación de body/query**: sin token válido se obtiene 401 aunque el body/query sea inválido `[EJECUTADO]`
  (`/platform/overview?date_from=bad` sin auth → 401).
- **Serialización**: JSON compacto (`separators=(",",":")`), UTF-8 sin escapes (`ensure_ascii=False`) `[EJECUTADO]`; `datetime` naive UTC en ISO-8601
  (`2026-10-18T06:15:34.573642` en SQLite; en MariaDB `DATETIME(0)` no hay microsegundos `[NO VERIFICADO]`).
- **Rate limit** en memoria por proceso (ventana deslizante 60 s, LRU 50 000 claves) solo en session/ping/collect (`public.py:34-60`).
  Con `--workers 2` el límite efectivo por clave es **×2** (cada worker tiene su contador) `[INFERIDO]`.
- **CORS** (`main.py:55-62`): orígenes de `CORS_ORIGINS`, `allow_credentials=true`, métodos `GET, POST, OPTIONS`, cabeceras
  `Authorization, Content-Type, X-Refleja-Token`, `max_age=600`. Preflight válido → 200 `text/plain` "OK"; origen no permitido → 400
  `text/plain` "Disallowed CORS origin" `[EJECUTADO]`. Cabecera `Access-Control-Allow-Headers` devuelta incluye además las "safelisted"
  de Starlette (`Accept, Accept-Language, Content-Language`) `[EJECUTADO]`.
- **IP / país**: `client_ip` = `CF-Connecting-IP` o IP del socket (solo para Turnstile y rate limit; no se persiste). `client_country` = `CF-IPCountry`
  salvo `XX`/`T1`/longitud≠2 → `None` (`deps.py:11-23`).

---

## EP-001 · `GET /api/health`
- **Declaración:** `back/app/main.py:65-67` (`health`). Sin auth. Sin DB.
- **Respuesta 200:** `{"status":"ok","env":"<ENV>"}` (`ENV` crudo, p. ej. `production`) `[EJECUTADO]`.
- **Consumidores:** `deploy.sh` (`HEALTH_PATH=/api/health`, healthcheck + rollback), posiblemente monitores externos `[DESCONOCIDO]`.
- **Nota:** el guard de origen aplica a `/api*` también aquí. Si `ORIGIN_SECRET` estuviera definido, el `curl` de `deploy.sh` (sin cabecera)
  recibiría 403 y provocaría rollback `[INFERIDO]` (README indica `ORIGIN_SECRET` vacío en prod → `[NO VERIFICADO]` el valor real).
- **Tests existentes:** ninguno.

## EP-002 · `POST /api/public/session`
- **Declaración:** `routers/public.py:63-97` (`create_session`). Esquema `SessionRequest` (`schemas.py:8-9`).
- **Body:** `{"turnstile_token": str(1..2048)}` requerido. Sin query/cookies/headers obligatorios. Usa `CF-Connecting-IP`, `CF-IPCountry`, `User-Agent`.
- **Flujo:** 1) validación 422 → 2) rate limit `sess:<ip>` (`SESSION_RATE_PER_MIN`=30) → 429 `{"detail":"Demasiadas solicitudes."}` →
  3) Turnstile invisible → 403 `{"detail":"Verificación anti-bot fallida."}` → 4) `vid`=128 bit aleatorio, `vid_h`=HMAC-SHA256(VID_HMAC_KEY, vid) →
  5) INSERT `visitor` (dispositivo por UA, país CF) + `daily_metric.new_visitors += 1` → commit → 6) JWT público.
- **Respuesta 200:** `{"token":"<JWT HS256>","expires_in_days":30}`; JWT claims `{"typ":"public","vid":"<32 hex>","iat","exp"}` (30 días) `[EJECUTADO]`.
- **Escribe:** `visitor`, `daily_metric` (upsert del día UTC). **Externo:** `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` (timeout 8 s; cualquier excepción ⇒ `false`).
- **Dev:** con `ENV≠prod` y `DEV_BYPASS_TURNSTILE=true`, el token `dev-bypass` pasa (`turnstile.py:17`).
- **Idempotencia:** ninguna; cada llamada crea un visitante nuevo. **Concurrencia:** sin riesgos relevantes.
- **Riesgo:** la IP del rate limit proviene de una cabecera confiada sin verificar (`CF-Connecting-IP`); solo es segura si el origen solo acepta tráfico de Cloudflare (CloudPanel) `[INFERIDO]`.

## EP-003 · `POST /api/public/ping`
- **Declaración:** `public.py:100-124` (`ping`). Dependencia `require_public_vid` (`deps.py:26-50`).
- **Entrada:** cabecera `X-Refleja-Token`; sin body.
- **Errores:** 401 `"Falta el token estadístico."` / `"Token expirado."` / `"Token inválido."` (firma incorrecta, `typ`≠`public`, sin `vid`) `[EJECUTADO]`;
  429 `{"detail":"Demasiadas señales."}` (clave `ping:<vid_h>`, `PING_RATE_PER_MIN`=30).
- **Efecto:** `get_or_create_visitor` (si no existe lo crea, **sin** sumar `new_visitors`) + `UPDATE visitor SET last_seen_at=utcnow()` → commit.
- **Respuesta 200:** `{"ok":true}`. No toca cuotas ni eventos.
- **Consumidor:** `analytics.js:250-285` (cada ~25 s; ante 401 renueva token; ante 429 espera 60 s).

## EP-004 · `POST /api/public/collect`
- **Declaración:** `public.py:285-323` (`collect`), `_process_event` (`public.py:187-282`), esquemas `schemas.py:18-77`, lógica `analytics.py`, `form_meta.py`.
- **Entrada:** cabecera `X-Refleja-Token`; body `CollectBatch`: `{"events":[CollectEvent,…]}` con `1..` hasta **50** eventos (lista vacía permitida → `accepted:0`)
  **o** un evento suelto `{"type":…}` (compatibilidad; se envuelve) `[EJECUTADO]`.
- **CollectEvent** (todos opcionales salvo `type`): `type` ∈ {`page_view`,`run_start`,`answer`,`minor`,`municipio`,`result`,`urgent_click`,`hide_click`,`restart`,`directory_municipio`};
  `run_uid` (≤36, **no** se valida como UUID); `question_id` (≤32); `next_id` (≤32); `step` 0..20; `flow_type` ∈ {`pareja`,`fam`,`trab`};
  `age_bucket` ∈ {`minor`,`18-25`,`26-40`,`41+`}; `municipio` (≤48); `risk_level` ∈ {`low`,`medium`,`high`};
  `scores` {`psicologica`,`fisica`,`economica`,`patrimonial`,`sexual`,`intimidacion`} enteros 0..60 (default 0); `device` ∈ {`mobile`,`desktop`,`tablet`}.
  Campos extra se **ignoran** (Pydantic por defecto) `[INFERIDO]` (→ caso de prueba).
- **Errores:** 401 (token, ver EP-003); 422 (body inválido: tipo desconocido, >50 eventos, JSON malformado, body ausente) `[EJECUTADO]`; 429 `{"detail":"Demasiadas peticiones."}` (clave `coll:<vid_h>`, 120/min).
  El rate limit se consume **después** de pasar la validación del body.
- **Respuesta 200:** `{"ok":true,"accepted":<n>}`; `accepted` cuenta los eventos **procesados hasta agotar la cuota**, incluidos los que se descartaron en silencio
  (sin `run_uid`, qid inválido, cuota de acciones) `[CONFIRMADO]`.
- **Escribe:** `visitor` (cuotas + `last_seen_at` + `page_views`), `form_run`, `question_stat`, `event_counter`, `daily_metric`. Una sola transacción por petición (commit al final).
- **Semántica detallada:** ver `03-business-flows.md` FL-03 (cuotas por vida, idempotencia por qid, coherencia de flujo).
- **Cuotas de por vida por visitante** (config): `PUBLIC_MAX_EVENTS`=2000, `PUBLIC_MAX_RUNS`=20, `PUBLIC_MAX_ACTIONS`=300. Al superarlas el exceso se **ignora sin error**.
- **Consumidor:** `analytics.js:157-186`: reintenta en cola si `!r.ok` (incluye 422/429 ⇒ reintento indefinido; **el contrato de códigos importa**), ante 401 renueva token.

## EP-005 · `POST /api/auth/login`
- **Declaración:** `routers/auth.py:83-134`. `LoginRequest`: `username`(1..64), `password`(1..256), `turnstile_token`(1..2048) — todos requeridos.
- **Orden:** 422 → Turnstile **managed** (403 `"Verificación anti-bot fallida."`) → lookup usuario → verificación Argon2id **siempre** (hash real o señuelo para igualar tiempos) →
  401 `"Usuario o contraseña incorrectos."` → (re-hash si `needs_rehash`) → `last_login_at=utcnow()` → INSERT `admin_login` (browser/os/device por UA, país, UA recortado a 255) →
  INSERT `admin_session` (refresh) → commit.
- **Respuesta 200:** `{"access_token":"<JWT>","token_type":"bearer","expires_in":900}` + `Set-Cookie: refleja_rt=<JWT refresh>; HttpOnly; Max-Age=604800; Path=/api/auth; SameSite=lax[; Secure][; Domain=…]`
  (`Secure` si `COOKIE_SECURE` o prod) `[EJECUTADO]`.
- **JWT access:** `{"typ":"access","sub":"<id>","username","iat","exp"}` (15 min). **JWT refresh:** `{"typ":"refresh","sub","jti":<uuid4>,"iat","exp"}` (7 días); en BD solo `sha256(refresh)` + `jti`.
- **Sin rate limit propio** (solo Turnstile). Cada intento consume ≈64 MiB transitorios (Argon2id m=65536,t=3,p=4) `[CONFIRMADO]`.
- **Consumidor:** `auth-common.js:77-90`, `acceso.js:75` (muestra `detail`).

## EP-006 · `POST /api/auth/refresh`
- **Declaración:** `auth.py:137-196`. Entrada: cookie `refleja_rt` (sin body).
- **Ramas (todas 401 salvo éxito):** sin cookie → `"Sin sesión."`; JWT inválido/expirado/typ≠refresh → `"Sesión inválida."`; sesión inexistente o `sha256(cookie)`≠`token_hash` → `"Sesión inválida."`;
  sesión ya revocada (**reuso**) → revoca **todas** las sesiones activas del usuario, `log.warning`, `"Sesión revocada por seguridad."`; `expires_at < now` → `"Sesión expirada."`; usuario inexistente/inactivo → `"Usuario no válido."`.
- **Éxito 200:** rota (marca `revoked_at=now` en la sesión vieja, inserta nueva) → mismo cuerpo/cookie que login.
- **`[CONTRADICTORIO]` intención ↔ comportamiento:** el código llama a `_clear_refresh_cookie(response)` antes de lanzar `HTTPException`, pero FastAPI **descarta** las cabeceras del `Response` inyectado al lanzar la excepción:
  en la práctica los 401 **no** incluyen `Set-Cookie` `[EJECUTADO]` (ver `probe-output`: "refresh reuse" sin `set-cookie`). → ADR-010.
- **Concurrencia:** la rotación no usa bloqueo de fila; dos refresh simultáneos con la misma cookie pueden provocar la rama de reuso. El front lo mitiga con un único refresh en vuelo (`auth-common.js:26-42`).
- Sin Turnstile, sin rate limit.

## EP-007 · `POST /api/auth/logout`
- **Declaración:** `auth.py:199-218`. Cookie opcional. Si el JWT es válido y la sesión no está revocada → `revoked_at=utcnow()` → commit; JWT inválido se ignora.
- **Respuesta 200 siempre:** `{"ok":true}` + `Set-Cookie: refleja_rt=""; Max-Age=0; expires=…; Path=/api/auth; SameSite=lax` (borrado) `[EJECUTADO]`.

## EP-008 · `GET /api/auth/me`
- **Declaración:** `auth.py:221-223`, `deps.require_admin` (`deps.py:53-78`).
- **Auth:** `Authorization: Bearer <access>`. 401 `"No autenticado."` (falta cabecera o esquema ≠ bearer, con `WWW-Authenticate: Bearer`), 401 `"Sesión inválida o expirada."` (firma/exp/typ), 401 `"Usuario no válido."` (no existe/inactivo).
- **200:** `{"id":int,"username":str,"last_login_at":<iso naive>|null}`. Un refresh token usado como Bearer ⇒ 401 `[EJECUTADO]`.
- El esquema `bearer ` se compara en minúsculas; el token se toma con `split(" ",1)[1].strip()`.

## EP-009…EP-015 · `GET /api/platform/*` (solo admin)
Todas heredan `dependencies=[Depends(require_admin)]` (`platform.py:25-27`): una consulta a `admin_user` por petición. Filtros de rango: `created_at >= date_from 00:00` y `< (date_to+1d) 00:00` (UTC naive) sobre `form_run`.
Los query params `date_*` aceptan lo que acepta Pydantic `date` (formato ISO; la cadena inválida da 422 `[EJECUTADO]`); `flow_type`/`municipio` son strings **libres** (sin enum): un valor desconocido da resultados vacíos, no error `[EJECUTADO]`.

| ID | Ruta | Query (default) | Respuesta 200 (claves) | Notas de equivalencia |
|---|---|---|---|---|
| EP-009 | `/overview` | `date_from,date_to,flow_type,municipio` | `total_visitors, active_now, total_runs, started, completed, minors, entered_not_started, repeat_visitors, urgent_clicks, hide_clicks, restarts, completion_rate, start_rate` | `total_visitors`, `active_now`, `entered_not_started`, `repeat_visitors` y contadores **no** se filtran. `*_rate` = `round(x,4)` de Python (ver ADR-012). `active_now` ventana 90 s |
| EP-010 | `/realtime` | `window_seconds`(90; 5..900), `limit`(20; 1..100) | `window_seconds, active_visitors, by_device{}, by_country{}, recent_runs[{flow_type,age_bucket,last_question_id,max_step,municipio,started,completed,risk_level,seconds_ago}]` | Un país/dispositivo `NULL` se serializa como clave **`"None"`** `[EJECUTADO]` en el arnés diferencial (FastAPI `jsonable_encoder` convierte la clave `None` en `"None"`; una prueba aislada con `json.dumps` daba `"null"`, pero la ruta real de FastAPI manda); `recent_runs` ordenado por `form_run.updated_at DESC` |
| EP-011 | `/funnel` | — | `intro[], flows{pareja[],fam[],trab[]}, completed_by_flow{}, top_reached[]` ; cada paso `{question_id,reached,answered,drop,drop_rate}` | Orden de preguntas = orden de claves de `formulario.json` (13/12/12). `top_reached` = top 10 por `reached` de **todas** las filas de `question_stat` salvo `MINOR/LOCATION/RESULT` (incluye `age`,`start`); empates: orden de la consulta sin `ORDER BY` `[INFERIDO]` |
| EP-012 | `/violence` | `date_from,date_to,flow_type,municipio` | `totals{6},present{6},dominant{6},completed_runs` | Solo runs `completed`. `dominant`: el **primero** en orden `psicologica,fisica,economica,patrimonial,sexual,intimidacion` con el máximo (>0) |
| EP-013 | `/municipios` | `date_from,date_to,flow_type,limit`(60; 1..100) | `items[{municipio,count}], directory[{municipio,count}]` | `items` por `count DESC` (empates sin orden definido); `directory` desde `event_counter` `name LIKE 'dir_muni:%'` |
| EP-014 | `/logins` | `limit`(100; 1..500) | `items[{username,browser,os,device,country,user_agent,created_at}]` | `ORDER BY created_at DESC` (resolución de 1 s ⇒ empates); `created_at` ISO naive |
| EP-015 | `/timeseries` | `date_from,date_to` | `items[{date,page_views,form_starts,form_completes,minors,new_visitors}]` | `metric_date ASC`, rango inclusivo |

Detalle de lecturas/escrituras: todas **solo lectura**. Tablas: ver `04`.

## EP-016 · Documentación interactiva (solo dev)
`/api/docs` (Swagger UI) y `/api/openapi.json`, solo `ENV` no prod (`main.py:30-32`). `[EJECUTADO]` 200 en dev. En prod 404 `{"detail":"Not Found"}`. No se migrará (ADR-011, propuesta).

## Comportamientos implícitos de FastAPI/Starlette que ya forman parte del contrato observable
| Caso | Comportamiento actual `[EJECUTADO]` |
|---|---|
| Ruta inexistente | 404 `{"detail":"Not Found"}` |
| Método no permitido | 405 `{"detail":"Method Not Allowed"}` + `allow: GET` |
| Barra final (`/api/health/`) | 307 → `Location: …/api/health` (sin barra) |
| JSON malformado | 422 `json_invalid` (no 400) |
| Preflight origen no permitido | 400 `text/plain` `Disallowed CORS origin` |

## 4. Comparación con especificación publicada
No existe OpenAPI público en producción ni archivo `openapi.json` versionado. El esquema OpenAPI generado en dev **no** se tomó como fuente (podría divergir). Estado: **no aplica**; la fuente de verdad es el código + sondas.

## 5. Cobertura de pruebas existente
Ninguna (`[CONFIRMADO]`). Todo contrato debe capturarse con la suite de TASK-0007/0008 antes de migrar.
