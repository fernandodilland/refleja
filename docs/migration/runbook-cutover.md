# Runbook de despliegue y conmutación (cutover) a Rust

> **Estado:** todo preparado; **nada se ha desplegado**. El propietario avisará cuándo ejecutar. Patrón copiado de
> `sistema.fernandodilland` (`rust/deploy/`) y `correo.fractory.mx` (`back-rs/scripts/desplegar.sh`).
> Detalles técnicos y comandos: [`back-rs/despliegue/README.md`](../../back-rs/despliegue/README.md).

## Punto de partida (importante)
- **CloudPanel ya apunta a `127.0.0.1:20834`** (cambiado por el propietario). El Python escucha en `20832`, así que **hasta que se despliegue Rust, `api.refleja.org` no tiene backend** (el front fallará al enviar estadística y el panel no cargará). Conviene desplegar pronto o revertir el App Port.
- Rust escucha en `20834`, el Python en `20832`: **no chocan**, por eso el despliegue puede hacerse con el Python aún vivo; el día D lo apaga y bloquea.
- Usuario del sitio `refleja-api`, repo en `/home/refleja-api/htdocs/api.refleja.org` (`back/.env`, `front/src/formulario.json`). La API Rust usa **la misma `.env`**: no se copia ni se edita nada.

## 0. Antes de desplegar (una vez)
1. **Esquema** (TASK-0002): `refleja-api --check` lo verifica automáticamente en el servidor y **aborta sin cambiar nada** si falta algo (p. ej. `event_counter`). Si aborta, aplicar `back-rs/migrations/0001_baseline.sql` (idempotente) a mano y repetir.
2. Backup de MariaDB (el propietario).
3. Requisitos en la Mac: ver README de despliegue (`cargo-zigbuild`, `zig`, target Linux, MariaDB local para el gate de paridad).
4. Opcional: anotar RAM del Python (`ps -o rss,cmd -u refleja-api`) para comparar (TASK-0001).

## 1. Ensayo sin cambios
```bash
./desplegar.sh simulacro      # gates + compila + sube + valida refleja-api --check en el servidor; no cambia nada
```

## 2. Día D
```bash
./desplegar.sh dia-d          # gates + compila + para/bloquea Python + instala Rust + salud local y pública
```
Si algo falla después de apagar el Python, `dia-d.sh` se deshace solo (vuelve el Python). Comprobaciones posteriores: abrir `refleja.org` (cuestionario), `/acceso` → `/plataforma`, `journalctl -u refleja-api-rs -f` sin 5xx, `ps -o rss,cmd -C refleja-api`.

## 3. Versiones siguientes
`./desplegar.sh back` · `./desplegar.sh revertir` (release Rust anterior) · `./desplegar.sh deshacer` (volver al Python).

## 4. Mapa de Sistemas — actualización MANUAL tras el despliegue
Se hace **después** del día D (por el asistente, a petición del propietario) en el repo `~/git/Personal/sistema.fernandodilland`, siguiendo lo hecho con «Sistema» y «Archivo de correos» (filas Rust vivas, filas Python en gris «obsoleto» con su sustituto). Ese repo tiene cambios sin commitear del propietario: **tocar solo estos archivos y commitear solo ellos**.

| Archivo | Cambio |
|---|---|
| `static/js/sistemas-datos.js` (≈ línea 193) | Añadir fila viva `hv-refleja-rs` «Refleja · API (Rust)» (`svc("refleja-api-rs", "refleja-api", ["Escucha en 127.0.0.1:20834 (el 20832 queda libre para el Python)."])`, `expo: [["pub","api.refleja.org"]]`) y dejar `hv-refleja` como «Refleja · API (Python)» en gris (`color: "neutro"`, sin `expo`) |
| `static/js/sistemas-servidor.js` (≈ línea 40) | `"hv-refleja-rs": { u: "refleja-api-rs.service", salud: "refleja" }` y `"hv-refleja": { u: "refleja-api.service", obsoleto: OBSOLETO_REFLEJA, sustituto: "refleja-api-rs.service" }` (definir `OBSOLETO_REFLEJA` como `OBSOLETO_CORREOS`); la arista `cf-proxy → hv-refleja` y `hv-refleja → db-refleja` en `sistemas-datos.js` (líneas ≈ 295 y 346) pasan a `hv-refleja-rs` |
| `agentes/hivelocity/supervisar.json` | Añadir `refleja-api-rs.service` a `unidades` y cambiar la salud `refleja` a `http://127.0.0.1:20834/api/health`; copiar al servidor `/etc/sistemas-agente/supervisar.json` y reiniciar el agente (como en el día D de Sistema) |
| `SISTEMAS.md` | Anotar el cambio (convención del repo) |

## 5. Diferencias de comportamiento conocidas
| Tema | Python | Rust | Motivo |
|---|---|---|---|
| Concurrencia en MariaDB ≥11.8 con `innodb_snapshot_isolation` | puede devolver 500 (error 1020) | `READ COMMITTED` + reintento: sin 500 | ADR-020 |
| Límites de tasa | por worker (×2 con `--workers 2`) | por proceso (exactos) | un solo proceso |
| Texto de `msg`/`ctx` en algunos 422 | Pydantic | `type`/`loc`/estado idénticos | ADR-008 |
| Límite de cuerpo | ninguno | 256 KiB → 413 | ADR-015 |
| DDL al arrancar (`create_all`) | sí | no: solo verifica el esquema | ADR-006 |
| Base de datos en desarrollo | SQLite automática | MariaDB local; `back-rs/scripts/dev.sh` | ADR-016 |
