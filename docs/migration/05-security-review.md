# 05 · Revisión de seguridad y requisitos de preservación

Alcance: lectura de código y pruebas locales no intrusivas contra una instancia propia en SQLite. No se explotó nada ni se probó contra producción.
Severidad: Alta / Media / Baja / Informativa. "Preservar" = comportamiento de seguridad que la versión Rust **debe** mantener.

## 1. Controles existentes (requisitos de preservación)

| ID | Control | Evidencia | Requisito para Rust |
|---|---|---|---|
| P-01 | **Fail-closed en producción**: arranque abortado si `JWT_SECRET`/`PUBLIC_TOKEN_SECRET`/`VID_HMAC_KEY` son los valores por defecto o miden <32 caracteres | `config.py:87-97` | Mantener (`ENV` que empiece por `prod`, sin distinguir mayúsculas) |
| P-02 | Turnstile **nunca** se omite en producción; `dev-bypass` solo con `ENV≠prod` y `DEV_BYPASS_TURNSTILE=true` | `config.py:104-107`, `turnstile.py:17` | Mantener; probar que el bypass es imposible con `ENV=production` |
| P-03 | Turnstile fail-closed (error/timeout ⇒ rechazar) y sin secreto ⇒ rechazar | `turnstile.py:20-34` | Mantener |
| P-04 | Contraseñas Argon2id (m=64 MiB, t=3, p=4, salt 16 B, hash 32 B) + re-hash transparente | `security.py:17-43` | Verificar hashes existentes (PHC) y emitir nuevos con los mismos parámetros |
| P-05 | Respuesta sin oráculo de enumeración: mismo mensaje y verificación Argon2 con hash señuelo si el usuario no existe/inactivo | `auth.py:100-112` | Mantener mensaje idéntico y trabajo equivalente |
| P-06 | JWT HS256 con `typ` obligatorio (`access`/`refresh`/`public`) y secretos separados (`JWT_SECRET` para access+refresh; `PUBLIC_TOKEN_SECRET` para público) | `security.py:76-123` | Mantener; **rechazar `alg` distinto de HS256**; un token de otro `typ` no debe validar `[EJECUTADO]` |
| P-07 | Refresh en cookie `HttpOnly`, `Path=/api/auth`, `SameSite` configurable (`lax`), `Secure` forzado en prod, host-only salvo `COOKIE_DOMAIN` | `auth.py:41-52` | Mantener atributos exactos |
| P-08 | Rotación de refresh + **detección de reuso** que revoca toda la familia; solo se guarda `sha256` del refresh | `auth.py:137-196` | Mantener; añadir prueba de concurrencia |
| P-09 | Privacidad: nunca se guarda IP; visitante = HMAC de id aleatorio de 128 bit; solo país (`CF-IPCountry`) | `models.py:1-11`, `deps.py:19-23` | **Requisito de producto**; ningún log/tabla debe persistir IP (ver S-09) |
| P-10 | Cuotas de por vida por token (2000 eventos / 20 runs / 300 acciones) + rate limits | `config.py:73-81`, `public.py` | Mantener valores y semántica (descarte silencioso) |
| P-11 | Validación estricta: allowlist de qids (`formulario.json`), municipios (52 slugs), enums cerrados, rangos de `scores` y `step`, tamaños máximos de campos y 50 eventos por lote | `schemas.py`, `form_meta.py`, `analytics.py` | Mantener; añadir límite de tamaño de body (hoy no explícito, ver S-03) |
| P-12 | CORS restringido a `CORS_ORIGINS` con credenciales; métodos y cabeceras explícitos | `main.py:55-62` | Mantener (incluida la respuesta del preflight) |
| P-13 | Guard de origen opcional por cabecera secreta (`ORIGIN_SECRET`/`ORIGIN_SECRET_HEADER`), no aplica a `OPTIONS` y solo a rutas `/api*` | `main.py:38-52` | Mantener (comparar en tiempo constante es una mejora permitida, S-07) |
| P-14 | Docs/OpenAPI deshabilitados en producción | `main.py:30-32` | Mantener (no exponer) |
| P-15 | `require_admin` consulta BD en cada petición (usuario debe existir y estar activo) | `deps.py:73-77` | Mantener: desactivar un admin debe cortar el acceso antes de 15 min |

## 2. Hallazgos

| ID | Sev. | Hallazgo | Evidencia | Impacto / Probabilidad | Mitigación propuesta (no aprobada) |
|---|---|---|---|---|---|
| S-01 | Media | **Login sin rate limit** propio; cada intento cuesta 64 MiB y ~cientos de ms CPU. Solo Turnstile lo frena | `auth.py:83` | DoS de memoria/CPU si se obtienen tokens Turnstile válidos; en Rust, un pico de N logins simultáneos = N×64 MiB | Semáforo de concurrencia para Argon2 + límite por IP (ADR-014) — **no cambia contrato** salvo 429 nuevos |
| S-02 | Media | **Rate limits por proceso** (×2 con 2 workers) y con claves derivadas de `CF-Connecting-IP` sin verificar | `public.py:34-60`, `deps.py:19-23` | Con un solo proceso Rust el límite pasa a ser exacto (más estricto que hoy); si el origen fuese accesible sin Cloudflare la cabecera es falsificable | Mantener límites configurables; documentar la diferencia (ADR-014) |
| S-03 | Baja | Sin límite de tamaño de body explícito (Uvicorn/FastAPI no lo imponen); validación ocurre tras leer el body | `schemas.py` | Cuerpos grandes consumen memoria | En Rust: `DefaultBodyLimit` (p. ej. pocos KB; ≥ lote de 50 eventos). Valor por definir en ADR-015 |
| S-04 | Baja | Cookie de refresh **no se borra** en los 401 de `/auth/refresh` (código lo intenta; FastAPI descarta cabeceras al lanzar excepción) | `auth.py:149-190`; `[EJECUTADO]` | Cookie inválida persiste hasta expirar; sin impacto de seguridad directo | Preservar comportamiento actual por defecto; mejora opcional (ADR-010) |
| S-05 | Baja | `run_uid` sin comprobación de propietario: otro token puede mutar un run ajeno si conoce su `run_uid` (UUID aleatorio de ≤36 chars) | `analytics.get_run`, `public._run_for` | Integridad de estadística, sin PII | Preservar (compat.) y registrar; mejora opcional exigir `visitor_id` igual |
| S-06 | Baja | Condición de carrera en `form_run.counted` (lectura-modificación-escritura) y en cuotas leídas al inicio del lote | `public.py:170-184` | Doble conteo o exceso leve de cuota bajo concurrencia | Mejora opcional con bloqueo/`UPDATE` atómico; tolerancia a documentar en tests |
| S-07 | Informativa | Comparación del secreto de origen y de Turnstile con `!=` (no tiempo constante) | `main.py:47` | Canal lateral teórico | Usar comparación en tiempo constante en Rust |
| S-08 | Informativa | Access token JWT sin `jti` ni revocación individual (vida 15 min); token público de 30 días no revocable (documentado) | `security.py`, `README` | Aceptado por diseño | Preservar |
| S-09 | Informativa | Logs: `logging.basicConfig(INFO)`; uvicorn registra la línea de petición (método, ruta, **IP del cliente = IP de socket/proxy**). Cabeceras y cuerpos no se registran. En `auth.py:175` se registra `admin_user_id` en reuso | `main.py:13`, `auth.py:175` | Posible persistencia de IP en journald (IP de Cloudflare/loopback tras proxy) | En Rust no registrar IPs de cliente; `tracing` sin cabeceras sensibles (P-09) |
| S-10 | Informativa | `user_agent` completo (255 chars) se guarda en `admin_login` | `auth.py:128` | Dato casi-personal del admin, acotado | Preservar (el panel lo muestra) |
| S-11 | Informativa | `deploy.sh` hace `git reset --hard origin/main` en el servidor y ejecuta `pip install` en cada despliegue | `deploy.sh:100-102,114` | Cadena de suministro en despliegue | Se sustituye por proceso de build Rust (TASK-0047) |
| S-12 | Informativa | `healthcheck` de `deploy.sh` no envía `X-Origin-Secret`: activar el guard rompería el despliegue (rollback) | `main.py:43`, `deploy.sh` | Fallo operativo latente | Documentar; en Rust exceptuar `/api/health` **no** es un cambio aprobado (Q-08) |
| S-13 | Informativa | Sin cabeceras de seguridad HTTP propias (CSP/HSTS/etc.): es una API JSON tras Cloudflare | `main.py` | n/a | No añadir sin aprobación |
| S-14 | Informativa | Sin verificación de dependencias vulnerables / `pip audit` en el repo | `requirements.txt` | n/a | Rust: `cargo audit`/`cargo deny` en CI (TASK-0006) |
| S-15 | Informativa | Credenciales por defecto de dev: `admin/admin` en `app/seed.py` y secretos por defecto en `config.py` | `seed.py:18-19`, `config.py:7-11` | Solo dev; P-01 bloquea secretos débiles en prod, pero **no** se bloquea `admin/admin` en BD | Rust: el CLI de bootstrap debe exigir contraseña explícita |

## 3. Límites de confianza
1. Internet → Cloudflare → CloudPanel(Nginx) → `127.0.0.1:20832` (la app escucha solo en loopback, `deploy/refleja-api.service:14`). Se confía en `CF-Connecting-IP` y `CF-IPCountry`.
2. Token público = **capacidad sin identidad**: demuestra haber pasado Turnstile en los últimos 30 días; no autoriza nada más que ingesta y ping.
3. Panel: access token (Bearer, memoria del front) + refresh (cookie). CSRF mitigado por `SameSite=lax` + mismo *site* (`refleja.org`/`api.refleja.org`) + CORS con lista cerrada.
4. Base de datos: usuario `refleja` con privilegios sobre la BD (incluye `ALTER` si las *light migrations* funcionan: se ignora el fallo si falta privilegio, `database.py:73`). Privilegios reales `[DESCONOCIDO]` (Q-06).
5. Disco: el proceso lee `.env` y `front/src/formulario.json` del checkout; usuario de sistema `refleja-api`, `NoNewPrivileges=true`.

## 4. Requisitos de seguridad para la migración
1. Ningún secreto en el repositorio ni en logs; `.env` sigue ignorado (`back-rs/.env` debe estar en `.gitignore`).
2. Paridad de P-01…P-15 demostrada por pruebas (TASK-0045).
3. Tokens emitidos por Python deben validar en Rust y viceversa (cambio de runtime sin cerrar sesiones: **requisito de despliegue**, TASK-0013).
4. Hashes Argon2 existentes deben verificar sin intervención (TASK-0014).
5. Sin `unsafe` salvo justificación; `cargo clippy -D warnings`, `cargo audit` en verificación.
6. Cualquier "mejora" de la lista anterior (S-01…S-07) se implementa **solo** con ADR aceptado.

## 5. Resultado de la implementación Rust (2026-10-18)
- **Paridad demostrada** por `back-rs/tests/contract/diff.py` y `back-rs/tests/vectors.rs`: P-01 (fail-closed, 4 casos), P-02 (bypass imposible con `ENV=production`), P-03 (Turnstile fail-closed, mock), P-04/P-05 (Argon2id + señuelo; hash de argon2-cffi verifica y viceversa), P-06 (typ/alg/secretos; tokens Python↔Rust), P-07 (cookie `Domain/HttpOnly/Max-Age/Path/SameSite/Secure`, dev y prod), P-08 (rotación y reuso, sin `Set-Cookie` en 401), P-10 (cuotas y rate limits), P-11 (validación), P-12 (CORS exacto), P-13 (guard de origen, comparación en tiempo constante), P-14 (sin docs), P-15 (usuario desactivado ⇒ 401 inmediato).
- **P-09 (privacidad):** el log de acceso de Rust no registra IP, cabeceras ni cuerpos. No se persiste IP.
- **S-01/S-02:** el semáforo de Argon2 (`ARGON2_CONCURRENCY=1`) acota el pico de memoria de logins simultáneos (75 MB vs 560–634 MB en Python, benchmark local). No se añadió rate limit de login (cambiaría el contrato).
- **S-03:** límite de cuerpo 256 KiB (413). **S-07:** comparación en tiempo constante del secreto de origen. **S-12:** el healthcheck de `back-rs/despliegue/instalar-en-servidor.sh` envía `ORIGIN_SECRET` si está definido.
- **Nuevo (S-16, informativo):** bajo MariaDB con `innodb_snapshot_isolation`, el backend Python produce 500 por conflictos de concurrencia (ver ADR-020); Rust no.
- **`cargo audit` ejecutado (2026-10-18, 1 338 avisos, 263 crates):** 0 vulnerabilidades abiertas. `lru` actualizado a 0.18 (corrige 2 avisos de *unsoundness*). Excepción justificada en `back-rs/.cargo/audit.toml`: RUSTSEC-2023-0071 (`rsa`, vía `sqlx-mysql`; solo cifra con clave pública, sin clave privada ni versión corregida).
- **Revisión de código:** 0 usos de `unsafe`; `expect()` solo en invariantes de arranque/constantes; ninguna ruta de petición hace `unwrap`.
- **Pendiente (humano):** segunda lectura por el propietario.
