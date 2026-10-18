# TASK-0043 · Crear la CLI `refleja-admin` (generar hash Argon2 y alta de administrador)

## Identificación
- **ID:** TASK-0043
- **Título:** Crear la CLI `refleja-admin` (generar hash Argon2 y alta de administrador)
- **Estado:** propuesta
- **Prioridad:** P2
- **Dominio:** Operación
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** medio
- **Tarea padre:** EPIC-G — Integración, seguridad, rendimiento y operación
- **Dependencias:** TASK-0009, TASK-0011, TASK-0014, TASK-0025
- **Bloquea a:** TASK-0044

## Objetivo
Reemplazar `app.seed` y el comando `python -c hash_password` para operar sin Python.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/app/seed.py`
- `back/seed.example.sql:157-169`
- `05` S-15
- `03` FL-08

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- `refleja-admin hash-password` (lee la contraseña de la entrada estándar/prompt sin eco; imprime el PHC).
- `refleja-admin create-admin --username <u>` (contraseña por prompt o `REFLEJA_ADMIN_PASSWORD`; idempotente: no duplica; ≥12 caracteres y rechaza `admin`).
- Usa `DATABASE_URL`/`.env` como el servicio.

## Fuera de alcance
- No es un endpoint HTTP.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. Seguir el alcance incluido; ante dudas de contrato, detenerse y registrar la incógnita en `08`.

## Contratos e invariantes
- La contraseña nunca aparece en argumentos de línea de comandos ni en logs.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/src/bin/refleja-admin.rs

**Archivos de referencia (solo lectura):**
- back/app/seed.py

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Hash generado verifica con `argon2-cffi` y con el login de Rust; `create-admin` dos veces ⇒ una fila.

## Criterios de aceptación
- [ ] Pruebas en verde; login real (contra harness) con el admin creado por la CLI.

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*
- Comando exacto del harness: ver `back-rs/tests/contract/README.md` (TASK-0007); casos en modo `verify` contra el binario Rust *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Sin riesgo de datos: no se toca producción. Rollback: revertir los commits de la tarea (los archivos son nuevos y propios).

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:**
- **Archivos modificados:**
- **Pruebas ejecutadas y resultados reales:**
- **Criterios satisfechos y pendientes:**
- **Diferencias detectadas respecto al original:**
- **Decisiones que requieren revisión humana:**
- **Evidencia y commit:**
