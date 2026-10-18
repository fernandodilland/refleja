# Runbook de despliegue gradual y conmutación (cutover) a Rust

> **Estado:** borrador para aprobación del propietario (TASK-0048). **Nada de esto se ha ejecutado en producción.** Los pasos de servidor están ensayados solo con un `systemctl` simulado (ver `back-rs/deploy/`).
> Principio: Python sigue instalado y listo hasta que Rust demuestre estabilidad; el rollback es cambiar el proxy y arrancar Python (segundos).

## 0. Preflight (no modifica nada)
1. **Esquema:** ejecutar TASK-0002 (`SHOW CREATE TABLE` de solo lectura) y comparar con `back-rs/migrations/0001_baseline.sql`. Debe coincidir (en especial `event_counter`, columnas `visitor.*_count` y `form_run.counted`). Si faltara algo, aplicar *solo migraciones aditivas* aprobadas.
2. **Backup** de MariaDB (el propietario) y comprobar que se puede restaurar.
3. **Secretos idénticos:** `back-rs/.env` = copia de `back/.env` (`JWT_SECRET`, `PUBLIC_TOKEN_SECRET`, `VID_HMAC_KEY` **iguales** ⇒ las sesiones admin y los tokens públicos de 30 días siguen válidos; verificado en `tests/contract/diff.py` fase 2c). `DATABASE_URL=mysql+pymysql://…` se acepta tal cual.
4. Servidor: arquitectura/glibc (Q-11) y binario compatible; `back-rs/deploy/README.md`.
5. Medir línea base de producción (TASK-0001) para comparar después.

## 1. Fase *shadow* (Rust en puerto alterno, sin tráfico público)
1. `APP_PORT=20833` en `back-rs/.env`; instalar unidad y sudoers (`back-rs/deploy/`); `BINARY=… back-rs/deploy/deploy.sh`.
2. Verificar: `curl -s http://127.0.0.1:20833/api/health` → `{"status":"ok","env":"production"}`. Si `ORIGIN_SECRET` está definido, enviar la cabecera.
3. Verificar lecturas del panel con un admin de prueba (mismo `login` → `GET /api/platform/overview` en ambos puertos y comparar números: deben coincidir porque comparten BD).
4. Medir RSS: `ps -o rss,cmd -C refleja-api` (debe ser mucho menor que Python).
**Abortar si:** el servicio no arranca (revisar `journalctl -u refleja-api-rs`), `verify_schema` reporta columnas faltantes, o las cifras del panel difieren.

## 2. Conmutación
1. Cambiar `APP_PORT` de Rust a `20832` **solo después** de detener Python: `sudo systemctl stop refleja-api` → `sudo systemctl restart refleja-api-rs` (ventana de unos segundos). *Alternativa sin ventana:* dejar Rust en 20833 y apuntar el reverse proxy de CloudPanel a `127.0.0.1:20833`.
2. `curl https://api.refleja.org/api/health` → 200. Probar desde el sitio real: abrir el cuestionario (se emite token y llegan eventos), entrar a `/acceso` y `/plataforma`.
3. Vigilar 30–60 min: `journalctl -u refleja-api-rs -f` (sin 5xx; avisos de reuso de refresh son normales solo si hay robo/ráfaga), RSS estable, y que `/plataforma` → "Activos ahora" y contadores crezcan.
**Rollback inmediato** (cualquier fallo): proxy → 20832/Python; `sudo systemctl stop refleja-api-rs && sudo systemctl start refleja-api`. Los datos escritos por Rust son compatibles con Python (misma BD, mismo formato).

## 3. Criterios go/no-go (medibles)
| Criterio | Go |
|---|---|
| Errores 5xx en la primera hora | 0 (o iguales a la línea base de Python) |
| Panel (`overview`, `funnel`, `realtime`) | Responde y cuadra con los datos previos |
| Login admin + refresh + logout desde navegador real | OK |
| Estadística: el front reintenta lotes ≠ 2xx; no debe haber crecimiento anómalo de cola (no 422/429/5xx en `collect`) | OK |
| RSS del proceso Rust vs línea base de Python (TASK-0001) | Menor (objetivo a fijar por el propietario, Q-12) |

## 4. Después de la conmutación
- Mantener `refleja-api.service` (Python) **detenido, no borrado** durante el periodo que decida el propietario (sugerido: 1–2 semanas).
- Retirar Python (`back/`, TASK-0050) **solo con autorización explícita**: etiqueta git `python-backend-final`, quitar `back/` y `back/deploy*`.
- Actualizar `deploy.sh` del CI/proceso del propietario para usar `back-rs/deploy/deploy.sh`.

## 5. Diferencias de comportamiento conocidas (aprobadas en este plan)
| Tema | Python | Rust | Motivo |
|---|---|---|---|
| `/api/docs`, `/api/openapi.json` en desarrollo | existen | no existen (404) | ADR-011; en producción ya eran 404 |
| Concurrencia en MariaDB ≥11.8 con `innodb_snapshot_isolation` | puede devolver 500 (error 1020) bajo carga concurrente | `READ COMMITTED` + reintento de transacción: sin 500 | corrección; ver benchmark |
| Límites de tasa | por worker (×2 con `--workers 2`) | por proceso (exactos) | un solo proceso |
| Texto de `msg`/`ctx` en algunos 422 (JSON malformado, fechas inválidas) | mensajes de Pydantic | `type`/`loc`/estado idénticos; texto puede variar | ADR-008 |
| Límite de cuerpo | ninguno | 256 KiB → 413 | ADR-015 |
| SQLite en desarrollo | soportado | no (MariaDB local) | ADR-016 |
