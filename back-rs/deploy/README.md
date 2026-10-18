# Despliegue del backend Rust

> **Estado:** preparado y ensayado en local con un `systemctl` simulado (ver `../../docs/migration/evidence/`). **No se ha ejecutado en el servidor real.** Sigue `../../docs/migration/runbook-cutover.md`.

Archivos: `refleja-api-rs.service` (unidad systemd), `refleja-api-rs.sudoers`, `deploy.sh` (swap atómico del binario + healthcheck + rollback).

## Layout esperado (igual que el backend Python)
```
/home/refleja-api/htdocs/api.refleja.org/        # checkout del repo (incluye front/src/formulario.json)
├── back/                                        # backend Python (sigue ahí hasta retirarlo)
└── back-rs/
    ├── .env                                     # secretos de producción (no versionado) — puede reutilizar el de back/ tal cual
    └── bin/refleja-api                          # binario (lo coloca deploy.sh)
```

## Pasos (resumen)
1. Obtener el binario `x86_64-unknown-linux-gnu` (o el de la arquitectura del servidor): compilarlo fuera del servidor con `cargo build --release --locked` en una máquina Linux compatible con la glibc del servidor, o `BUILD=1` en el servidor (consume bastante RAM: `CARGO_BUILD_JOBS=1`).
2. Copiar `.env` de `back/.env` a `back-rs/.env`; `DATABASE_URL=mysql+pymysql://…` funciona sin cambios. Durante la fase *shadow* usa otro puerto: `APP_PORT=20833`.
3. `sudo cp back-rs/deploy/refleja-api-rs.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable refleja-api-rs`.
4. `BINARY=/ruta/refleja-api back-rs/deploy/deploy.sh` (restart + healthcheck + rollback automático al binario anterior).
5. Conmutar el reverse proxy de CloudPanel al puerto del Rust (y detener `refleja-api.service`). Rollback: volver el proxy y arrancar Python.

## Notas
- El healthcheck de `deploy.sh` envía `ORIGIN_SECRET` si está definido (el de `back/deploy.sh` no lo hace y fallaría).
- El servicio **no** modifica el esquema: aplica `back-rs/migrations/0001_baseline.sql` solo en BD nuevas; en producción debe ser *no-op* (verifícalo antes: ver TASK-0002).
- Variables nuevas opcionales: `DB_MAX_CONNECTIONS` (10), `ARGON2_CONCURRENCY` (1).
