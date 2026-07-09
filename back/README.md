# Refleja · API (FastAPI)

Backend minimalista para **estadística anónima** de la experiencia de usuario de
Refleja. Sin datos personales, sin IPs. Se despliega en `api.refleja.org` detrás
de **Cloudflare + CloudPanel**. La app escucha en `127.0.0.1:20832`.

## Qué hace

- **1 endpoint público sin sesión**: `POST /api/public/session` valida el
  Turnstile **invisible** y emite un **token estadístico JWT de 30 días**.
- **Ingesta protegida**: `POST /api/public/collect` recibe eventos con el token
  en el header `X-Refleja-Token`.
- **Login admin** (`/acceso`): usuario + contraseña (**Argon2id**) + Turnstile
  **managed** → **access token (15 min)** + **refresh token (cookie httpOnly,
  rotable)**.
- **Panel** (`/plataforma`): `GET /api/platform/{overview,realtime,funnel,
  violence,municipios,timeseries}` (solo admin).

## Privacidad ("pocos datos, mucha señal")

- Nunca se guarda la IP. La identidad de visitante es un id aleatorio de 128 bits
  generado al emitir el token; en la BD solo vive su **HMAC-SHA256**.
- Geografía = solo país (`CF-IPCountry`).
- 6 tablas: `admin_user`, `admin_session`, `visitor`, `form_run` (1 fila por
  intento), `question_stat` y `daily_metric` (contadores agregados).

---

## Desarrollo local (macOS, VS Code)

Requiere **Python 3.10**. Desde la raíz del repo:

```bash
cd back
python3.10 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
./.venv/bin/python -m app.seed            # crea SQLite + admin de dev (admin/admin)
./.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 20832 --reload
```

O en **VS Code**: F5 → *"Refleja API (uvicorn :20832)"* (instala dependencias y
siembra automáticamente). En dev se usa **SQLite** y `DEV_BYPASS_TURNSTILE=true`
(acepta el token mágico `dev-bypass`, nunca en producción).

- Docs interactivas: http://127.0.0.1:20832/api/docs

---

## Despliegue en producción (CloudPanel)

### 1. Base de datos (MariaDB)
En CloudPanel crea una base `refleja` y un usuario. Luego carga el esquema y los
usuarios del panel con los archivos **confidenciales** (no versionados):

```bash
mysql -u refleja -p refleja < seed.sql        # esquema + primer admin
mysql -u refleja -p refleja < migration.sql   # tabla admin_login + usuarios del panel
```

Los hashes de contraseña se guardan como **Argon2id**. `seed.sql` y `migration.sql`
están en `.gitignore` (contienen credenciales); usa `seed.example.sql` como
plantilla pública del esquema. La app también crea las tablas faltantes al
arrancar (`create_all`), así que basta con reiniciar el servicio tras desplegar.

### 2. Configuración
Copia `.env.example` a `.env` y ajusta (valores de producción):

```
ENV=production
DATABASE_URL=mysql+pymysql://refleja:TU_PASS@127.0.0.1:3306/refleja?charset=utf8mb4
CORS_ORIGINS=https://refleja.org,https://www.refleja.org
JWT_SECRET=...            # openssl rand -hex 48
PUBLIC_TOKEN_SECRET=...   # openssl rand -hex 48
VID_HMAC_KEY=...          # openssl rand -hex 32
TURNSTILE_SECRET_LOGIN=<secret managed>
TURNSTILE_SECRET_INVISIBLE=<secret invisible>
DEV_BYPASS_TURNSTILE=false
COOKIE_DOMAIN=
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
```

> El backend **no arranca en producción** si `JWT_SECRET` / `PUBLIC_TOKEN_SECRET`
> / `VID_HMAC_KEY` quedan con el valor por defecto o miden menos de 32 caracteres
> (fail-closed). La cookie de refresh se fuerza a `Secure` cuando `ENV=production`.

### 3. Proceso (systemd)
```ini
# /etc/systemd/system/refleja-api.service
[Unit]
Description=Refleja API
After=network.target

[Service]
WorkingDirectory=/home/refleja/api/back
ExecStart=/home/refleja/api/back/.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 20832 --workers 2
Restart=always
User=refleja

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable --now refleja-api
```

### 4. Reverse proxy en CloudPanel
Crea un sitio **Reverse Proxy** para `api.refleja.org` apuntando a
`http://127.0.0.1:20832`. CloudPanel ya limita el origen a Cloudflare, así que el
blindaje de origen de la app queda desactivado (`ORIGIN_SECRET=` vacío). Si
quieres activarlo, define `ORIGIN_SECRET` y añade una *Transform Rule* en
Cloudflare que inyecte el header `X-Origin-Secret`.

### 5. Cloudflare / DNS
- `api.refleja.org` → tu servidor, **proxied (naranja)**.
- En cada widget de Turnstile, agrega `refleja.org` (y `www`) a los hostnames.

### 6. Front
El front detecta el entorno solo: en `*.refleja.org` llama a
`https://api.refleja.org/api`. Despliega con `npx wrangler deploy` como siempre.

---

## Notas de seguridad

- Las **secret keys de Turnstile** solo viven en `.env` (server). `.env` está en
  `.gitignore`. **Rota las secret keys** que se hayan compartido en texto plano.
- Access token en memoria; refresh token en cookie httpOnly rotable con
  **detección de reuso** (si se replica un refresh ya rotado, se revoca toda la
  familia de sesiones del admin).
- Rate-limit por IP en `/session` y por token en `/collect` (best-effort en
  memoria, por worker; para exactitud global usar Redis).
- El token estadístico es una *capacidad* sin PII; se guarda en `localStorage`.
  Es un JWT autocontenido de 30 días **no revocable** de forma individual (elección
  de privacidad: no hay registro server-side por vid). Ante un incidente, rota
  `PUBLIC_TOKEN_SECRET` para invalidar todos los tokens estadísticos a la vez.
