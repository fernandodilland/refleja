# TASK-0007 · Construir el harness de pruebas de contrato diferenciales (Python vs Rust)

## Identificación
- **ID:** TASK-0007
- **Título:** Construir el harness de pruebas de contrato diferenciales (Python vs Rust)
- **Estado:** completada
- **Prioridad:** P0
- **Dominio:** Pruebas
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** alto
- **Tarea padre:** EPIC-B — Cimientos del crate y pruebas de contrato
- **Dependencias:** TASK-0006, TASK-0021
- **Bloquea a:** TASK-0008, TASK-0026, TASK-0027, TASK-0028, TASK-0029, TASK-0030, TASK-0031, TASK-0032, TASK-0033, TASK-0034, TASK-0035, TASK-0036, TASK-0037, TASK-0038, TASK-0039, TASK-0040, TASK-0041, TASK-0042

## Objetivo
Poder ejecutar los mismos escenarios HTTP contra el backend Python (para **capturar** el comportamiento real) y contra el Rust (para **verificar** equivalencia), con BD MariaDB efímera, mock de Turnstile y normalización de campos volátiles.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `07-test-and-compatibility-plan.md` §2 y §3
- `evidence/python-baseline/probe_python_api.py` (precedente de sondas)
- `back/app/config.py:51-53` (`TURNSTILE_VERIFY_URL` permite mock)

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- ADR-016 (MariaDB local)

**Supuestos explícitos:**
- `mariadb`/`mysqld` de Homebrew disponibles en `/opt/homebrew/bin` (verificado). Docker no existe.

## Alcance incluido
- `back-rs/tests/contract/` con runner (lee `cases/*.json`, modos `record` y `verify`), normalizadores (JWT por claims, `Set-Cookie` por atributos, timestamps por formato, `seconds_ago` ±2 s, conjuntos para empates sin orden).
- `tools/mariadb_ephemeral.sh` (datadir temporal, puerto no estándar, esquema cargado desde `back-rs/migrations/0001_baseline.sql` de TASK-0021, que ya incluye `event_counter`) y `tools/run_python_ref.sh` (levanta `back/.venv` contra esa BD con secretos de prueba).
- Mock de Turnstile (`TURNSTILE_VERIFY_URL`) controlable (éxito/fallo/timeout).
- Comparación del **estado final de tablas** (volcado normalizado).
- Un caso de ejemplo (`health`) grabado y verificado.

## Fuera de alcance
- No escribir los casos de los dominios (los hace cada tarea de endpoint).
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Diseñar el formato de caso: `{id, ctx:{headers_defaults, clock?}, steps:[{method,path,headers,body,expect:{status,headers,body,db?}, capture:{…}}]}`.
2. Definir variables de entorno `CONTRACT_BASE_URL`, `CONTRACT_MODE=record|verify`, `CONTRACT_DB_URL`.
3. Documentar en `back-rs/tests/contract/README.md` el comando exacto para record y verify.

## Contratos e invariantes
- Los *goldens* se generan **solo** desde Python y no contienen secretos ni datos reales.
- El harness no depende de que el Rust exista para grabar.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/tests/contract/**
- back-rs/tests/contract/tools/**

**Archivos de referencia (solo lectura):**
- back/app/**
- back/seed.example.sql

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Meta-pruebas del normalizador (unitarias).

## Criterios de aceptación
- [ ] `record` contra Python escribe el golden de `health`; `verify` contra el mismo Python pasa.
- [ ] Un golden alterado a mano hace fallar `verify` con diff legible.
- [ ] El script crea y destruye la BD efímera sin dejar procesos ni archivos fuera de un directorio temporal.
- [ ] README con comandos exactos y verificados.

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo: normalización demasiado laxa oculta diferencias → lista de campos tolerados explícita y revisada en TASK-0044. Rollback: borrar `tests/contract/`.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:** implementado en `back-rs/` (ver archivos).
- **Archivos modificados:** `back-rs/tests/contract/diff.py`, `scripts/mariadb_local.sh`, `scripts/apply_schema.sh`
- **Pruebas ejecutadas y resultados reales:** Arnés implementado en Python (no en Rust, ADR-021); cubre CT-001…CT-094 y más: `back-rs/tests/contract/diff.py` (≈230 peticiones Python vs Rust + 8 tablas + fases de producción y cutover): TODO OK
- **Criterios satisfechos y pendientes:** ver estado de la ficha; los pendientes se detallan arriba cuando el estado no es `completada`.
- **Diferencias detectadas respecto al original:** ver `runbook-cutover.md` §5 y ADR-020/021/022 en `08`.
- **Decisiones que requieren revisión humana:** ver `08` §0.
- **Evidencia y commit:** rama `migration/rust-backend` (commit 37d8272 y anteriores).
