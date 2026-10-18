# Despliegue de la API Rust de Refleja (producción: Hivelocity)

Mismo patrón que `sistema.fernandodilland` (`rust/deploy/`) y `correo.fractory.mx` (`back-rs/scripts/desplegar.sh` +
`despliegue/instalar-en-servidor.sh`): **se compila en la Mac y al servidor solo se sube el paquete compilado**. El
servidor no tiene Rust.

> **Estado:** preparado y con el paquete Linux compilado/verificado en la Mac. **Aún no se ha desplegado** (se hará cuando
> el propietario lo indique). CloudPanel ya apunta al puerto **20834**.

## Dónde queda en el servidor

Todo dentro de `htdocs` (entra en los respaldos del sitio). El Python sigue ahí, sin tocar.

| Qué | Dónde |
|---|---|
| Repo (Python + front + `.env` + `formulario.json`) | `/home/refleja-api/htdocs/api.refleja.org` (`back/.env`, `front/src/formulario.json`) |
| Releases Rust | `…/api.refleja.org/back-rs/prod/releases/<versión>-<fecha>-<commit>/bin/{refleja-api,refleja-admin}` |
| Release activa | enlace `…/back-rs/prod/actual` (cambio atómico); el instalador queda en `…/back-rs/prod/instalar-en-servidor.sh` |
| Unidad | `refleja-api-rs.service` (usuario `refleja-api`, `WorkingDirectory=…/back`, `MemoryMax=256M`) |
| Puerto | `127.0.0.1:20834` (CloudPanel → App Port). El **20832** queda libre para el Python |
| Configuración | **la misma `back/.env`** del Python (no se copia ni se modifica); el puerto lo fija la unidad (`APP_PORT=20834`) |

`back-rs/prod/` y `back-rs/dist/` están en `.gitignore`: el `git reset --hard` del `back/deploy.sh` del Python no los toca.

## Desplegar

```bash
./desplegar.sh simulacro      # compila + sube + valida, sin cambiar nada
./desplegar.sh dia-d          # corte Python → Rust (primera vez)
./desplegar.sh back           # versiones nuevas (el Python ya está apagado)
./desplegar.sh revertir       # vuelve a la release Rust anterior
./desplegar.sh deshacer       # vuelve al Python (en el 20834; CloudPanel no se toca)
./desplegar.sh verificar
```

Equivalentes por separado: `back-rs/scripts/{compilar,desplegar,dia-d,limpiar}.sh`. Config opcional:
`back-rs/despliegue/despliegue.conf` (copia de `despliegue.conf.ejemplo`).

### Requisitos en la Mac (una vez)
`rustup target add x86_64-unknown-linux-gnu`, `brew install zig`, `cargo install cargo-zigbuild --locked`, `brew install cargo-audit`
(opcional), MariaDB local (`brew install mariadb`; el gate de paridad la levanta con `scripts/mariadb_local.sh`) y `../back/.venv`.
Alias `hivelocity` en `~/.ssh/config` (root). El servidor debe ser x86_64 con glibc ≥ 2.35 (el script lo comprueba).

### Qué hace `compilar.sh`
Gates (`--rapido` los omite): `cargo fmt --check`, `clippy -D warnings`, pruebas, `cargo audit`, y **paridad**: levanta el
backend Python y el Rust contra dos MariaDB locales y compara ~230 peticiones + las 8 tablas + modo producción + arranque
fail-closed + compatibilidad de sesiones/tokens. Luego `cargo zigbuild` (glibc 2.35) y empaqueta
`back-rs/dist/refleja-api-rs-<id>.tar.gz` con SHA-256. Compila fuera del repo (`~/.cache/refleja-rs-target`) con 3 hilos;
`--limpiar` / `scripts/limpiar.sh` lo borra después.

### Qué hace el instalador (root, en el servidor)
1. Comprueba SHA-256, usuario, `back/.env`, `front/src/formulario.json` y que el puerto no sea el 20832.
2. Copia el binario a `releases/<id>` (`root:refleja-api`, 0750).
3. **Valida como `refleja-api`**: `refleja-api --check` (configuración + conexión + esquema). Si falla, no cambia nada.
4. Instala/actualiza solo `refleja-api-rs.service`.
5. Cambia el enlace `actual` y reinicia.
6. Healthcheck `GET http://127.0.0.1:20834/api/health` (envía `ORIGIN_SECRET` si está en el `.env`); si falla, vuelve a la
   release anterior (o para la unidad Rust y deja el Python como estaba).

Nunca toca la unidad del Python, CloudPanel/nginx, el `.env` ni el esquema de la base (la API Rust **no ejecuta DDL**).

## Día D (corte)

`dia-d.sh`: (1) para y deshabilita `refleja-api.service` con un *drop-in* `90-apagado-por-rust.conf`
(`ConditionPathExists` de un archivo inexistente) → no arranca ni por reinicio, ni por `back/deploy.sh`, ni por
`systemctl start`; no se borra nada; (2) despliega Rust; (3) comprueba `https://api.refleja.org/api/health`; si algo
falla, se deshace solo.

### Volver al Python
`./desplegar.sh deshacer`: para la unidad Rust, quita el bloqueo, arranca el Python **en el puerto 20834** (otro
*drop-in* `91-puerto-del-rust.conf`) y así CloudPanel no se toca.

## Esquema de la base
La API Rust solo **verifica** el esquema (`migrations/expected_schema.txt`). Si el de producción difiere
(p. ej. falta `event_counter`, que antes creaba `create_all` al arrancar el Python), `--check` falla y no se despliega nada;
`migrations/0001_baseline.sql` (idempotente) lo crea: aplícalo a mano con `mariadb` solo si hace falta.

## Mapa de Sistemas (`sistema.fernandodilland.com/sistemas#mapa`)
Se actualiza **a mano después del despliegue** (no lo hace ningún script): ver `docs/migration/runbook-cutover.md` §«Mapa de Sistemas».
