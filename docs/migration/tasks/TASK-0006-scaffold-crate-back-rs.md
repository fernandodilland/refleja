# TASK-0006 · Crear el crate `back-rs` con el esqueleto completo de módulos y herramientas

## Identificación
- **ID:** TASK-0006
- **Título:** Crear el crate `back-rs` con el esqueleto completo de módulos y herramientas
- **Estado:** propuesta
- **Prioridad:** P0
- **Dominio:** Cimientos
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** medio
- **Tarea padre:** EPIC-B — Cimientos del crate y pruebas de contrato
- **Dependencias:** TASK-0004
- **Bloquea a:** TASK-0007, TASK-0009, TASK-0010, TASK-0012, TASK-0013, TASK-0014, TASK-0015, TASK-0017, TASK-0018, TASK-0019, TASK-0021, TASK-0032

## Objetivo
Dejar un proyecto Rust compilable donde **cada archivo futuro ya existe** (con cabecera `// Owner: TASK-00NN`) y todas las dependencias aprobadas están declaradas, de modo que los demás agentes solo rellenan sus propios archivos y nunca editan `Cargo.toml`, `lib.rs` ni los `mod.rs`.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `01-context.md` §5 (estructura y propietarios)
- ADR-001/004 aceptados
- `back/requirements.txt`

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- ADR-001 (ubicación `back-rs/`)
- ADR-004 (stack)
- ADR-016 (MariaDB local)

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- `back-rs/Cargo.toml` con **todas** las dependencias de ADR-004 (versión verificada con `cargo search`/`cargo add` y registrada en ADR-004), `rust-toolchain.toml`, `rustfmt.toml`, `deny.toml`, `.gitignore` (`target/`, `.env`), `.env.example` (copia de `back/.env.example` + variables que faltan listadas en `06` §2).
- `src/main.rs`, `src/lib.rs` y **todos** los archivos de §5 de `01-context.md` como módulos vacíos que compilan; los `routes/{auth,public,platform}/mod.rs` completos (declaran submódulos y mezclan sus `router()`, cada uno devolviendo `Router::new()` por ahora).
- `scripts/check.sh` (fmt + clippy + test + `cargo audit`/`deny` si están instalados) y `back-rs/README.md` con comandos.
- Añadir `back-rs/target/` y `back-rs/.env` al `.gitignore` de la raíz.

## Fuera de alcance
- No implementar lógica de negocio. No modificar `back/` ni `front/`.
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No implementar lógica de negocio (solo esqueleto).

## Instrucciones de implementación
1. `cargo new --lib` + bin; crear árbol de archivos; declarar módulos en `lib.rs`.
2. Fijar versiones y habilitar *features* mínimas (ej. `serde_json` con `preserve_order`, `sqlx` solo `mysql`, `reqwest` con `rustls`).
3. Documentar en `back-rs/README.md` cómo correr verificaciones y la regla de propietarios de archivos.

## Contratos e invariantes
- Un archivo pertenece a una sola tarea; esta tarea es la única que puede editar `Cargo.toml`, `lib.rs`, `main.rs` (esqueleto) y los tres `mod.rs` de rutas. Cambios posteriores = solicitud a esta tarea (o a TASK-0044 para cableado final).

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/** (esqueleto)
- .gitignore (raíz, solo añadir 2 líneas)

**Archivos de referencia (solo lectura):**
- docs/migration/01-context.md
- docs/migration/08-decisions-and-open-questions.md (ADR-004)

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Una prueba trivial (`it_compiles`) para que `cargo test` ejecute algo.

## Criterios de aceptación
- [ ] `cargo build` y `cargo test` terminan sin errores desde cero.
- [ ] `cargo clippy --all-targets -- -D warnings` y `cargo fmt --check` limpios.
- [ ] Existen todos los archivos de `01` §5 con su cabecera de propietario.
- [ ] Versiones reales registradas en ADR-004.
- [ ] `git status` muestra solo archivos nuevos en `back-rs/` y la edición mínima de `.gitignore`.

## Verificación
- `cd back-rs && cargo fmt --check` → sin diferencias *(comando propuesto; se confirma en TASK-0006)*
- `cd back-rs && cargo clippy --all-targets -- -D warnings` → 0 advertencias *(propuesto)*
- `cd back-rs && cargo test` → todas las pruebas del alcance en verde *(propuesto)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo: elegir versiones que no compilen juntas → registrar las que sí. Rollback: borrar `back-rs/` y revertir `.gitignore`.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:**
- **Archivos modificados:**
- **Pruebas ejecutadas y resultados reales:**
- **Criterios satisfechos y pendientes:**
- **Diferencias detectadas respecto al original:**
- **Decisiones que requieren revisión humana:**
- **Evidencia y commit:**
