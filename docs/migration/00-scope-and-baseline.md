# 00 · Alcance y línea base

> Fase 0 del protocolo. Estado: **completo** (descubrimiento). Fecha de análisis: **2026-10-18**.
> Leyenda de confianza usada en todos los documentos: `[CONFIRMADO]` (leído en código o ejecutado),
> `[EJECUTADO]` (observado ejecutando el backend Python localmente), `[INFERIDO]`, `[DESCONOCIDO]`,
> `[CONTRADICTORIO]`, `[NO VERIFICADO]`.

## 1. Sistema

| Campo | Valor |
|---|---|
| Nombre | **Refleja API** (`api.refleja.org`) |
| Propósito | Estadística **anónima** de experiencia de usuario del sitio Refleja (cuestionario sobre violencia contra mujeres, Nuevo León) + login/panel de administración (`/acceso`, `/plataforma`). Sin datos personales, sin IP almacenada. `[CONFIRMADO]` `back/README.md:3-25`, `back/app/models.py:1-11` |
| Repositorio | `git@github-fdilland:fernandodilland/refleja.git` (monorepo: `front/` Cloudflare Workers estático + `back/` FastAPI) |
| Rama / commit analizado | `main` @ `f4d996c` ("Agrega el botón "Mapa"…") |
| Estado inicial | Árbol de trabajo **limpio** (`git status` sin cambios al iniciar). Archivos ignorados presentes: `back/.env`, `back/seed.sql`, `back/migration.sql` (0 bytes), `back/refleja_dev.db`, `back/.venv/`, `.wrangler/`, `tmp/` |
| Lenguaje / framework | Python 3.10, FastAPI 0.115.6, Uvicorn 0.32.1, Pydantic 2.10.4, SQLAlchemy 2.0.36 (síncrono), PyMySQL 1.1.1, argon2-cffi 23.1.0, PyJWT 2.10.1, httpx 0.28.1 (`back/requirements.txt`) |
| Tamaño | 15 rutas de aplicación, 8 tablas, ~1 300 líneas de Python en `back/app/` |
| Alcance de la migración | Reescribir `back/app/**` en Rust (Axum/Tokio/Tower + SQLx/MariaDB) **preservando contratos externos**. Motivación: reducir RAM (≈130 MB reportados por el propietario) |

## 2. Alcance del análisis

**Incluido:** `back/app/**` (todos los módulos), `back/seed.example.sql`, `back/migrations/002_visitor_quota.sql`,
`back/deploy.sh`, `back/deploy/*`, `back/README.md`, `back/.env.example`, `back/requirements.txt`; y los
**consumidores** en `front/src/`: `analytics.js`, `auth-common.js`, `acceso.js`, `platform.js`, `formulario.json`
(el backend lo lee en tiempo de ejecución).

**Excluido (deliberadamente):**
- `back/.env`, `back/seed.sql`: contienen credenciales → **no se leyeron**. Solo se documentan nombres de variables.
- `back/.venv/`, `__pycache__/`, `.wrangler/`, `node_modules/`, `tmp/` (documentos de transparencia, no son backend).
- Generación del sitio estático (`front/generate.js`) y páginas de municipios.
- Producción: **ningún acceso**. No se ejecutó nada contra producción, no se ejecutó `deploy.sh`, no se tocó MariaDB.

**Submódulos / repos relacionados:** ninguno detectado (`git submodule` vacío). Servicios externos: ver `04-data-and-integrations.md`.

## 3. Comandos conocidos y resultado de ejecutarlos

| Comando | Fuente | Ejecutado | Resultado |
|---|---|---|---|
| `python3.10 -m venv .venv && pip install -r requirements.txt` | `back/README.md:34-36` | No (ya existe `back/.venv`, Python 3.10.20) | n/a |
| `python -m app.seed` (crea tablas + admin dev) | `back/README.md:37` | **Sí**, con `DATABASE_URL=sqlite:///<scratchpad>/t.db` | OK: "Usuario administrador 'admin' creado (Argon2id)" |
| `python -m uvicorn app.main:app --host 127.0.0.1 --port <p>` | `back/README.md:38` | **Sí**, puerto 29832, `ENV=development`, `DEV_BYPASS_TURNSTILE=true`, BD SQLite aislada | Arranca ("Application startup complete") |
| Sondas HTTP (login, session, collect, ping, platform/*, refresh, logout) | creado en este análisis | **Sí** | Ver `evidence/python-baseline/probe-output-2026-10-18.txt` |
| `deploy.sh` | `back/deploy.sh` | **No** (solo leído; opera sobre servidor/systemd) | n/a |
| Pruebas automáticas | — | **No existen** `[CONFIRMADO]`: no hay `tests/`, ni pytest, ni CI en el repo | Brecha crítica de cobertura |
| `cargo --version` / `rustc --version` | — | Sí | cargo 1.99.1 / rustc 1.99.1 disponibles en la máquina de desarrollo |

Las sondas usaron una base SQLite temporal en el *scratchpad* de la sesión; **no** se modificó `back/refleja_dev.db`
ni se leyó `.env`. El comportamiento con **MariaDB** (producción) no pudo ejecutarse → ver incógnitas en `08`.

## 4. Línea base de recursos (parcial)

| Medición | Valor | Condiciones | Confianza |
|---|---|---|---|
| RSS del proceso uvicorn tras arrancar + sondas | ≈126–141 MB | macOS, Python 3.10.20, **1 worker**, SQLite, incluye hash señuelo Argon2 (64 MiB transitorios) | `[EJECUTADO]` (solo orientativo) |
| RAM en producción reportada | ≈130 MB "aprox." | Servicio `--workers 2` (`deploy/refleja-api.service:14`) | `[NO VERIFICADO]`: declarado por el propietario, no medido. No se sabe si es suma de 2 workers ni qué incluye. → **TASK-0001** |

Implicación: con 2 workers, la cifra de ~130 MB podría ser **la suma** (≈65 MB/worker). La línea base real debe medirse antes de fijar objetivos.

## 5. Dependencias de otros sistemas

Cloudflare (proxy naranja, Turnstile `siteverify`, cabeceras `CF-IPCountry` / `CF-Connecting-IP`), CloudPanel (reverse proxy a `127.0.0.1:20832`), MariaDB 11.x (según cabecera de `seed.example.sql`), systemd (`refleja-api.service`), y el **front** (`front/src/*.js` + `formulario.json` leído por el backend desde el mismo checkout). Detalle en `04`/`06`.

## 6. Riesgos iniciales

1. **Sin pruebas** del backend actual → la equivalencia debe construirse con una suite de caracterización (TASK-0007/0008).
2. **Esquema real de producción desconocido**: `seed.example.sql` **no incluye `event_counter`** (la crea `create_all` al arrancar) y `back/README.md` habla de "6 tablas" mientras el código tiene 8. `[CONFIRMADO]` → TASK-0002.
3. Comportamientos **accidentales** que el front ya tolera (p. ej. clave JSON `"None"`, cookie no limpiada en 401) → decidir preservar o corregir (ADR-009/010).
4. Hash Argon2id (64 MiB) por login: en Rust sigue costando 64 MiB transitorios por intento → riesgo de picos de RAM si no se acota concurrencia.
5. `formulario.json` es **dependencia de ejecución** del backend (ruta relativa al repo) → afecta empaquetado/despliegue.
6. Despliegue actual hace `git reset --hard` + venv; con Rust cambia por completo (compilación/artefacto) → TASK-0047.

## 7. Información no disponible

- Acceso a producción (esquema real, variables efectivas, logs, métricas, volumen de tráfico).
- Versión exacta de MariaDB, tamaños de tablas, `max_connections`.
- Valor real de `ORIGIN_SECRET`, `COOKIE_*`, `CORS_ORIGINS` en producción.
- Estado real de `back/migration.sql` en el servidor (local: vacío; el README dice que crea "tabla admin_login + usuarios del panel").
- Quiénes consumen la API además del front propio (¿otros clientes?).

Todo lo anterior está registrado como incógnita con responsable en `08-decisions-and-open-questions.md`.
