# TASK-0047 · Preparar empaquetado, unidad systemd, script de despliegue y rollback para el binario Rust

## Identificación
- **ID:** TASK-0047
- **Título:** Preparar empaquetado, unidad systemd, script de despliegue y rollback para el binario Rust
- **Estado:** en revisión
- **Prioridad:** P1
- **Dominio:** Operación
- **Responsable o agente asignado:** Agente de implementación Rust (por asignar)
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** alto
- **Tarea padre:** EPIC-G — Integración, seguridad, rendimiento y operación
- **Dependencias:** TASK-0003, TASK-0044
- **Bloquea a:** TASK-0048

## Objetivo
Tener un procedimiento de despliegue y rollback para el binario que mantenga las garantías de `deploy.sh` (healthcheck + rollback) sin compilar en el servidor si ADR-003 así lo decide.

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/deploy.sh`
- `back/deploy/refleja-api.service`
- `back/deploy/refleja-api.sudoers`
- `06` §3
- ADR-003, ADR-017

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- ADR-003 (aceptada con datos de TASK-0003)

**Supuestos explícitos:**
- Q-11 resuelta: se conoce distro/arquitectura/glibc del servidor.

## Alcance incluido
- `back-rs/deploy/refleja-api-rs.service` (mismo usuario, `WorkingDirectory`, `Restart`, `NoNewPrivileges`; **otro puerto** para convivencia, ADR-017), sudoers equivalente, `deploy-rs.sh` (descarga/copia del binario, *swap* atómico, healthcheck a `/api/health`, rollback al binario anterior).
- Documentar el build reproducible del binario (target y flags) y dónde se publica el artefacto.
- Ensayo en un entorno de prueba (VM/local) con el mismo layout de directorios.

## Fuera de alcance
- No desplegar a producción. No modificar `back/deploy*` (siguen vigentes hasta el cutover).
- No modificar `back/` (Python) ni `front/`, salvo que esta tarea lo indique expresamente.
- No editar archivos cuyo propietario sea otra tarea (ver `09-task-plan.md` §3).
- No añadir dependencias ni cambiar `Cargo.toml` (propiedad de TASK-0006); pedir la dependencia con justificación.
- No ejecutar nada contra producción ni desplegar.

## Instrucciones de implementación
1. El healthcheck debe soportar `ORIGIN_SECRET` (enviar cabecera si está definido) — corrige el riesgo S-12 sin tocar la app.
2. No parsear el puerto con `sed` de `ExecStart`: leer `APP_PORT` del `.env`.

## Contratos e invariantes
- Rollback restablece servicio en <1 min sin recompilar.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- back-rs/deploy/**

**Archivos de referencia (solo lectura):**
- back/deploy.sh
- back/deploy/*

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- Ensayo: despliegue feliz, despliegue con binario que no arranca (rollback automático), `ORIGIN_SECRET` activo.

## Criterios de aceptación
- [ ] Los 3 ensayos documentados con salida real.
- [ ] Procedimiento revisado por el propietario.

## Verificación
- Ejecución del ensayo con los comandos documentados en `back-rs/deploy/README.md` *(a crear)*

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo alto en producción; esta tarea solo prepara. Rollback: no aplicar.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:** implementado en `back-rs/` (ver archivos).
- **Archivos modificados:** `back-rs/deploy/{deploy.sh,refleja-api-rs.service,refleja-api-rs.sudoers,README.md}`
- **Pruebas ejecutadas y resultados reales:** Ensayo local con `systemctl` simulado: despliegue, segundo despliegue (queda `.prev`) y binario defectuoso ⇒ rollback correcto. **No ejecutado en el servidor real.**
- **Criterios satisfechos y pendientes:** ver estado de la ficha; los pendientes se detallan arriba cuando el estado no es `completada`.
- **Diferencias detectadas respecto al original:** ver `runbook-cutover.md` §5 y ADR-020/021/022 en `08`.
- **Decisiones que requieren revisión humana:** ver `08` §0.
- **Evidencia y commit:** rama `migration/rust-backend` (commit 37d8272 y anteriores).
