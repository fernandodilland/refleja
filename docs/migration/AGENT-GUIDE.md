# Guía para agentes de implementación

Aplica a **todo** agente que ejecute una tarea de `docs/migration/tasks/`. Léela completa antes de tocar nada.

## 1. Orden de lectura obligatorio
1. [`README.md`](README.md) (índice y estado) → 2. [`01-context.md`](01-context.md) (fuente de verdad) → 3. **tu ficha** `tasks/TASK-XXXX-*.md` → 4. los documentos que tu ficha cite (`02`…`08`) → 5. el código Python que tu ficha cite (verifica que las líneas siguen siendo correctas: el código manda sobre la documentación).

No necesitas releer todo el repositorio: inspecciona solo lo que tu tarea toca.

## 2. Reglas para todos los agentes
1. Trabaja **únicamente** dentro del alcance de tu ficha; una tarea no autoriza cambios en otras áreas.
2. **No alteres endpoints ni funcionalidades existentes** (Python ni front) sin aprobación explícita del propietario (ADR aceptado).
3. No cambies interfaces compartidas unilateralmente (ver §4). Si falta una, **registra una propuesta** en tu ficha (sección *Resultado*) y detente en lo que dependa de ella.
4. No edites archivos propiedad de otra tarea (`09-task-plan.md` §3). Si necesitas un cambio ahí, solicítalo.
5. No modifiques el esquema de producción ni ejecutes despliegues. Nada contra producción, nunca.
6. No añadas dependencias (`Cargo.toml` es de TASK-0006) sin justificar necesidad, mantenimiento (última versión, actividad), licencia y compatibilidad; la propuesta la aprueba el propietario.
7. **No ocultes fallos** de compilación, pruebas o lint; no uses `#[allow(...)]`, `#[ignore]` ni `unwrap()` en rutas de petición para "hacer pasar" algo.
8. **No afirmes que una prueba pasó si no la ejecutaste.** Pega la salida real (o un resumen fiel) en *Resultado de la ejecución*.
9. Si encuentras un comportamiento nuevo, una contradicción o una dependencia desconocida: regístralo en [`08`](08-decisions-and-open-questions.md) (nueva `Q-xx` o `C-xx`) y **detén el cambio afectado** si puede comprometer compatibilidad.
10. Actualiza solo la documentación y el estado de **tu** tarea (y las filas de `08` que tu hallazgo cree/cierre).
11. **No cierres una tarea** con algún criterio de aceptación incumplido. Si no puedes cumplirlo: estado `bloqueada` + motivo.
12. El trabajo no está completo hasta que la integración (TASK-0044) y la revisión humana correspondiente terminen.
13. **Sin secretos**: no leas `back/.env`, `back/seed.sql` ni `back/migration.sql`; no escribas secretos, contraseñas, IPs de clientes ni datos reales en código, pruebas, logs ni documentos. Usa valores sintéticos de prueba.
14. **Privacidad**: el sistema nunca persiste IP; tampoco la registres en logs.
15. El **comportamiento observable de Python es la especificación** (ADR-009): replica también sus quirks. Si crees que algo es un bug, documéntalo y pregunta; no lo corrijas por tu cuenta.

## 3. Ciclo de vida de una tarea
`propuesta` → (plan aprobado + dependencias `completada` + ADR aceptados) → `lista` → `en progreso` → `en revisión` → `completada` → (integración) `verificada`. Cualquier estado puede pasar a `bloqueada` con motivo.
- Una tarea **no** pasa a `lista` si depende de una decisión `propuesta` o de un componente inexistente.
- Cambia el estado en tu ficha **y** en la tabla de [`09-task-plan.md`](09-task-plan.md) en el mismo commit.

## 4. Contrato entre agentes
Cada ficha declara: entradas (*Contexto obligatorio*), qué puede modificar (*Archivos y componentes esperados*), qué debe producir (*Alcance incluido* + *Criterios de aceptación*), pruebas (*Pruebas requeridas*), dependencias a esperar (*Dependencias*) y qué no puede cambiar (*Fuera de alcance*).

**Interfaces compartidas** (su dueño las define; los demás las consumen sin modificarlas):

| Interfaz | Dueño | Consumidores |
|---|---|---|
| `Settings` (campos y métodos) | 0009 | todos |
| `AppError`, `ApiJson`, `ApiQuery` | 0010 | todos los handlers |
| `AppState`, `build_router` | 0016 | handlers, extractores |
| `PublicVid`, `AdminUser` (extractores) | 0020 | auth, public, platform |
| Firmas de `repo::*` | 0022–0025 | handlers |
| `Quota`, `process_action`, `process_run_event` | 0033, 0034 | 0035 |
| `issue_session`, cookie helpers | 0026 | 0027, 0028 |
| `py_round4`, `isoformat_naive` | 0012 | platform, auth |
| `form_meta::*`, `municipios::*` | 0019 | public, platform |

Si una interfaz necesaria **no está definida**, no inventes una convención: escribe la propuesta (firma + justificación) en tu ficha y solicita aprobación.

## 5. Convenciones de código Rust (propuestas; las fija TASK-0006)
- `cargo fmt`, `clippy -D warnings`, sin `unsafe`, sin `unwrap`/`expect` en rutas de petición, errores tipados con `thiserror`.
- Cada archivo empieza con `// Owner: TASK-XXXX` y comentarios que referencian la línea de Python que replica (`// replica back/app/routers/public.py:187`).
- Pruebas junto al código (`#[cfg(test)]`) y de integración/contrato en `back-rs/tests/`.
- Consultas SQL parametrizadas; nunca concatenar entrada de usuario.
- Mensajes `detail` **literales** del original (copiar del código Python; no re-redactar).

## 6. Git
- Rama por tarea: `migration/task-XXXX-slug` desde la rama base acordada. Commits pequeños y atómicos, en español, mensaje que cita `TASK-XXXX`.
- No hagas `push`, PR, merge ni cambios en `main` sin que el propietario lo pida.
- No reescribas historia ni descartes cambios ajenos. No commitees `.env`, binarios ni `target/`.

## 7. Qué entregar
Completa **Resultado de la ejecución** en tu ficha: resumen de cambios, archivos modificados, pruebas ejecutadas con resultados reales, criterios satisfechos/pendientes, diferencias detectadas, decisiones para revisión humana, evidencia y commit.

## 8. Tarea de integración (TASK-0044)
Revisa lo entregado, comprueba coherencia con `01`, resuelve conflictos con decisiones explícitas, ejecuta compilación + lint + pruebas + contrato + regresión, verifica que no se omitió ningún endpoint, registra desviaciones y actualiza la matriz de trazabilidad. Ningún agente de dominio marca su trabajo como `verificada`.

## 9. Cuándo detenerte y preguntar
- El código Python contradice la documentación o tu ficha.
- Un golden/contrato exige algo que ningún ADR cubre.
- Necesitas editar un archivo ajeno o añadir una dependencia.
- Descubres datos o secretos en un archivo que no debías leer.
- Un criterio de aceptación es imposible o ambiguo.
