# 07 · Estrategia de pruebas y criterios de equivalencia

Estado actual: **0 pruebas automáticas** en el repo (`[CONFIRMADO]`). La equivalencia solo puede demostrarse construyendo una suite de caracterización a partir del comportamiento real del backend Python.
Herramientas disponibles verificadas en la máquina de desarrollo: Python 3.10.20 (`back/.venv`), `cargo`/`rustc` 1.99.1, `mariadb`/`mysql`/`mysqld` (Homebrew, `/opt/homebrew/bin`). **Docker no está instalado** → las pruebas con BD usarán una instancia MariaDB local (ADR-016, propuesta).
Comandos de verificación del crate Rust (`cargo build/test/clippy/fmt`) son **propuestos** y se verifican en TASK-0006; no se han ejecutado todavía porque aún no existe el crate.

## 1. Capas

| Capa | Qué prueba | Dónde vive | Quién la crea |
|---|---|---|---|
| **L0 Golden de contrato (caja negra)** | Mismas peticiones contra el backend Python y el Rust; compara estado, cabeceras relevantes y cuerpo normalizado | `back-rs/tests/contract/` (casos en `cases/*.json`, runner en Rust) + script de captura Python en `back-rs/tests/contract/tools/` | TASK-0007 (framework), TASK-0008 y casos por dominio dentro de cada tarea de endpoint |
| **L1 Vectores criptográficos / utilitarios** | JWT (Python→Rust y Rust→Python), Argon2 (hash de argon2-cffi verifica en Rust), HMAC del `vid`, `round(x,4)`, parsers de UA, normalización de municipio, `qid_ok_for_flow` | `back-rs/tests/vectors/` generados con `back/.venv` | TASK-0013, 0014, 0017, 0019, 0012 |
| **L2 Unitarias** | Reglas de dominio puras (cuotas, `_process_event`, filtros de fecha, dominancia de violencia) | `#[cfg(test)]` en cada módulo | cada tarea |
| **L3 Integración con MariaDB** | Repositorios y endpoints contra MariaDB real con el esquema de `seed.example.sql` + `event_counter` | `back-rs/tests/` con BD de prueba efímera | TASK-0021 y siguientes |
| **L4 Seguridad** | P-01…P-15 de `05`; fuzzing de entradas; reuso de refresh; token de otro `typ` | `back-rs/tests/security/` | TASK-0045 |
| **L5 Carga y memoria** | RSS en reposo/bajo carga, p50/p95, picos de login | script reproducible en `back-rs/bench/` | TASK-0046 |

## 2. Metodología diferencial (L0)
1. Levantar **Python** (venv existente) y **Rust** apuntando a **dos BD MariaDB vacías** con el mismo esquema y el mismo `formulario.json`; secretos de prueba idénticos (`JWT_SECRET`, `PUBLIC_TOKEN_SECRET`, `VID_HMAC_KEY`), `DEV_BYPASS_TURNSTILE=true`, `ENV=development`.
2. Ejecutar un guion determinista de escenarios (`cases/*.json`: método, ruta, cabeceras, cuerpo, expectativas, variables capturadas).
3. Normalizar campos volátiles antes de comparar: JWT (decodificar y comparar claims sin `iat/exp/jti`), `vid`, `jti`, `Set-Cookie` (comparar atributos, no valor), timestamps (formato, no valor), `seconds_ago` (±2 s), orden de empates sin `ORDER BY` (comparar como conjunto cuando el contrato no define orden).
4. Comparar el **estado final de las tablas** (volcado normalizado) tras cada escenario de escritura.
5. Todo desacuerdo se clasifica: *bug de Rust*, *quirk de Python a preservar*, o *quirk a corregir con ADR aprobado*.
Un caso "golden" se captura **del Python real** y se almacena en el repo (sin secretos ni datos reales).

## 3. Catálogo mínimo de casos de contrato (CT-xxx)
Cada tarea de endpoint implementa los casos de su dominio; TASK-0044 verifica que **todos** corran verdes.

**Meta / framework (TASK-0008)**
CT-001 `GET /api/health` 200 `{"status":"ok","env":…}` · CT-002 404 `{"detail":"Not Found"}` · CT-003 405 + `allow` · CT-004 barra final → 307 sin barra · CT-005 preflight válido (cabeceras exactas) · CT-006 preflight origen no permitido 400 `text/plain` · CT-007 respuesta real con `Origin` permitido incluye `access-control-allow-origin`+`vary`+`allow-credentials` · CT-008 guard de origen: con `ORIGIN_SECRET` definido, 403 `{"detail":"Origen no autorizado."}` con CORS aplicado; `OPTIONS` exento; ruta fuera de `/api` exenta · CT-009 `/api/docs` 404 con `ENV=production`.

**Public (session/ping/collect)**
CT-010 session 422 sin `turnstile_token` · CT-011 session 403 con token falso · CT-012 session 200 (claims `typ,vid,iat,exp`; `expires_in_days:30`; fila `visitor` + `daily_metric.new_visitors`) · CT-013 session 429 al superar 30/min por IP (`CF-Connecting-IP`) · CT-014 país `XX`/`T1`/inválido ⇒ `NULL`; UA móvil/tablet/desktop ⇒ `device` · CT-015 ping 401×3 (falta/expirado/inválido) · CT-016 ping token de otro `typ` ⇒ 401 · CT-017 ping 200 y `last_seen_at` actualizado · CT-018 ping 429 al superar 30/min.
CT-020 collect 401 antes que 422 (sin token y body inválido) · CT-021 evento suelto equivale a lote de 1 · CT-022 `events:[]` ⇒ 200 `accepted:0` · CT-023 51 eventos ⇒ 422 · CT-024 `type` desconocido ⇒ 422 · CT-025 JSON malformado ⇒ 422 · CT-026 body ausente ⇒ 422 · CT-027 campos extra ignorados · CT-028 `scores` fuera de 0..60 ⇒ 422 · CT-029 `step` fuera de 0..20 ⇒ 422 · CT-030 `run_uid` de 37 caracteres ⇒ 422.
CT-031 `page_view` suma `daily_metric.page_views` y `visitor.page_views` · CT-032 `urgent_click/hide_click/restart` suman `event_counter` · CT-033 `directory_municipio` válido/ inválido/normalización (`"Monterrey"`→`monterrey`, espacios→guion) · CT-034 `run_start` crea run y cuenta `age` *reached* · CT-035 `answer` en flujo propio cuenta *answered* y siguiente *reached*; qid de otro flujo no se cuenta · CT-036 idempotencia: repetir el mismo `answer` no vuelve a sumar `question_stat` · CT-037 `flow_type` primera vez ⇒ `form_starts+1`, segunda no; el flujo se sobrescribe · CT-038 `minor` completa una vez (`minors+1`, `form_completes+1`) · CT-039 `municipio` válido/inválido · CT-040 `result` reemplaza scores, completa una vez, segundo `result` no suma completes pero sí actualiza `risk_level` · CT-041 evento de run sin `run_uid` ⇒ descartado pero cuenta en `accepted` · CT-042 cuota `PUBLIC_MAX_RUNS` (run 21 se ignora) · CT-043 cuota `PUBLIC_MAX_ACTIONS` · CT-044 cuota `PUBLIC_MAX_EVENTS` (corta el lote; `accepted` = eventos procesados) · CT-045 `device` del primer evento con device sobrescribe UA solo al crear visitante · CT-046 collect 429 a 120/min · CT-047 run ajeno (mismo `run_uid`, otro token) se muta (quirk S-05).

**Auth**
CT-050 login 422 · CT-051 login 403 Turnstile · CT-052 login 401 usuario inexistente / inactivo / contraseña errónea con **mismo** cuerpo · CT-053 login 200 (cuerpo, claims, `Set-Cookie` con atributos exactos en dev y prod) · CT-054 fila `admin_login` (browser/os/device por UA; país; UA ≤255) · CT-055 `needs_rehash` re-hashea · CT-056 hash Argon2 generado por argon2-cffi verifica en Rust · CT-057 refresh 200 rota y revoca la anterior · CT-058 refresh sin cookie 401 `"Sin sesión."` · CT-059 refresh JWT inválido/expirado/typ erróneo · CT-060 refresh hash no coincide · CT-061 reuso ⇒ 401 "Sesión revocada por seguridad." y revoca toda la familia · CT-062 refresh expirado · CT-063 usuario inactivo · CT-064 los 401 de refresh **no** incluyen `Set-Cookie` (quirk) · CT-065 logout con/ sin cookie, borrado de cookie, idempotente · CT-066 me 401×3 + 200 · CT-067 refresh token como Bearer ⇒ 401 · CT-068 token de Python válido en Rust y viceversa (access, refresh, público).

**Platform** (todas con y sin filtros)
CT-070 401 sin auth antes que 422 · CT-071 overview con datos conocidos (valores y redondeo de rates) · CT-072 overview filtros `date_from/date_to/flow_type/municipio` (límites de día UTC, valores desconocidos ⇒ ceros) · CT-073 realtime ventana/limit (límites 5/900 y 1/100 ⇒ 422 fuera) · CT-074 realtime clave `"None"` para país/dispositivo nulos · CT-075 funnel con formulario real (13/12/12; intro; `top_reached` excluye MINOR/LOCATION/RESULT; incluye age/start) · CT-076 violence totals/present/dominant (empates: gana el primero en orden) · CT-077 municipios items+directory con `limit` · CT-078 logins orden y `limit` (1..500) · CT-079 timeseries rango inclusivo y orden ASC · CT-080 `date_from` inválido ⇒ 422 · CT-081 admin desactivado ⇒ 401 `"Usuario no válido."` inmediatamente.

**Arranque / config**
CT-090 con `ENV=production` y secreto por defecto o <32 ⇒ el proceso **no arranca** (código de salida ≠ 0, mensaje que nombra la variable) · CT-091 `.env` + variables de proceso (precedencia) · CT-092 booleanos (`true/1/yes/on`…) · CT-093 `FORMULARIO_PATH` inexistente ⇒ fallback 12/12/12 · CT-094 `CORS_ORIGINS` con espacios/vacíos.

## 4. Criterios de equivalencia
- **Bloqueante:** estado HTTP, `detail` string, claves y tipos JSON, atributos de cookie, claims de JWT, efectos en tablas (valores finales), semántica de cuotas.
- **Tolerado con ADR aprobado:** texto de mensajes 422, orden de empates sin `ORDER BY`, microsegundos de timestamps, formato exacto de logs.
- **No se acepta** ningún cambio de contrato sin ADR *aceptado* por el propietario.

## 5. Brechas y riesgos de prueba
1. Sin acceso a MariaDB de producción: el comportamiento de tipos/fechas se verifica en una MariaDB local de la misma versión mayor (Q-05).
2. Turnstile real no es reproducible: la suite usa `TURNSTILE_VERIFY_URL` apuntando a un *mock* local (Python lo soporta) y `dev-bypass`. El camino de producción (sin bypass) se prueba con el *mock*.
3. Concurrencia (reuso de refresh, doble conteo): pruebas de estrés específicas en TASK-0027/0035.
4. Rendimiento: medir con carga **representativa** (Q-13, perfil de tráfico desconocido).
