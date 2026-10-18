# TASK-0001 · Medir la línea base real de recursos del backend Python en producción

## Identificación
- **ID:** TASK-0001
- **Título:** Medir la línea base real de recursos del backend Python en producción
- **Estado:** fuera del alcance local (checklist de despliegue del propietario)
- **Prioridad:** P0
- **Dominio:** Descubrimiento
- **Responsable o agente asignado:** Propietario del proyecto (acceso al servidor) — un agente solo puede procesar la evidencia entregada
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** bajo
- **Tarea padre:** EPIC-A — Descubrimiento y decisiones (sin código)
- **Dependencias:** ninguna
- **Bloquea a:** TASK-0046

## Objetivo
Convertir la cifra declarada (~130 MB) en una medición reproducible: RSS/PSS por worker y total, en reposo y en hora pico, más el perfil de tráfico. Sin esto no se puede definir ni demostrar el objetivo de reducción de RAM (Q-01, Q-12, Q-13).

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `back/deploy/refleja-api.service:14` (`--workers 2`)
- `00-scope-and-baseline.md` §4 (126–141 MB en dev, 1 worker, SQLite)

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- Medir con acceso **solo lectura**: `systemctl status refleja-api`, `ps -o pid,rss,vsz,etime,cmd -u refleja-api`, `/proc/<pid>/smaps_rollup` (Pss) de master y cada worker de uvicorn.
- Tomar ≥3 muestras en 24 h (reposo y pico) y registrar uptime, nº de peticiones por minuto del proxy y memoria de MariaDB **por separado**.
- Registrar qué incluye la cifra de 130 MB (¿suma de workers? ¿RSS o PSS?).

## Fuera de alcance
- No reiniciar servicios, no cambiar configuración, no instalar herramientas en producción.
- No modificar `back/`, `front/` ni crear `back-rs/`.
- No ejecutar comandos de escritura ni cambiar configuración o datos en el servidor.
- No copiar secretos, contraseñas, IPs de clientes ni datos de filas a la evidencia.

## Instrucciones de implementación
1. Ejecutar los comandos de solo lectura anteriores por SSH (o entregar su salida al agente).
2. Escribir `docs/migration/evidence/baseline-prod-<fecha>.md` con tabla de muestras (fecha/hora, proceso, RSS KB, PSS KB, req/min) y conclusiones.
3. Actualizar Q-01 y Q-13 en `08` con el resultado.

## Contratos e invariantes
- No incluir secretos, IPs de clientes ni rutas con credenciales en la evidencia.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- docs/migration/evidence/baseline-prod-<fecha>.md

**Archivos de referencia (solo lectura):**
- docs/migration/08-decisions-and-open-questions.md

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- No aplica (medición).

## Criterios de aceptación
- [ ] El archivo de evidencia existe y contiene ≥3 muestras con RSS y PSS por proceso.
- [ ] Declara explícitamente si 130 MB es total o por worker.
- [ ] Q-01 y Q-13 marcadas como resueltas en `08` (o con la razón por la que no se pudo).

## Verificación
- Revisión humana del archivo de evidencia. No hay comandos automáticos.

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo operativo nulo si solo se leen datos. Rollback: no aplica.

## Resultado de la ejecución
*(Tarea de despliegue: requiere acceso al servidor de producción o autorización del propietario; la migración local no depende de ella. El migrador no puede ejecutarla sin inventar datos. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:**
- **Archivos modificados:**
- **Pruebas ejecutadas y resultados reales:**
- **Criterios satisfechos y pendientes:**
- **Diferencias detectadas respecto al original:**
- **Decisiones que requieren revisión humana:**
- **Evidencia y commit:**
