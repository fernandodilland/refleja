# TASK-0005 · Analizar tráfico real y consumidores de la API a partir de los logs del proxy

## Identificación
- **ID:** TASK-0005
- **Título:** Analizar tráfico real y consumidores de la API a partir de los logs del proxy
- **Estado:** lista
- **Prioridad:** P1
- **Dominio:** Descubrimiento
- **Responsable o agente asignado:** Propietario del proyecto (acceso al servidor) — un agente solo puede procesar la evidencia entregada
- **Estimación:** No estimada (no se inventa precisión)
- **Riesgo:** bajo
- **Tarea padre:** EPIC-A — Descubrimiento y decisiones (sin código)
- **Dependencias:** ninguna
- **Bloquea a:** ninguna

## Objetivo
Resolver Q-04, Q-13 y Q-14: confirmar que solo el front usa la API, medir picos de peticiones por ruta/código y detectar usos no documentados (monitores de `/api/health`, escáneres, clientes antiguos).

## Contexto obligatorio
Leer antes de empezar:
- `docs/migration/README.md`
- `docs/migration/AGENT-GUIDE.md`
- `docs/migration/01-context.md`

**Comportamiento original que debe conservarse / evidencia del código original:**
- `front/src/analytics.js`, `auth-common.js`, `platform.js`
- `docs/migration/02-endpoint-inventory.md`

**Decisiones que condicionan la tarea** (deben estar `aceptadas` en `08` antes de pasar a `lista`):
- Ninguna específica. Aplican siempre ADR-002 (estrategia) y ADR-009 (preservar quirks salvo ADR aceptado).

**Supuestos explícitos:**
- Ninguna adicional a las de `01-context.md`.

## Alcance incluido
- Agregar (sin conservar IPs) ≥7 días de logs de Nginx/Cloudflare: peticiones por método+ruta+estado, picos por minuto, `User-Agent` no navegador, orígenes (`Origin`) distintos de refleja.org, rutas 404, llamadas a `/api/health` y su origen.

## Fuera de alcance
- No conservar IPs ni cuerpos de petición.
- No modificar `back/`, `front/` ni crear `back-rs/`.
- No ejecutar comandos de escritura ni cambiar configuración o datos en el servidor.
- No copiar secretos, contraseñas, IPs de clientes ni datos de filas a la evidencia.

## Instrucciones de implementación
1. Producir `docs/migration/evidence/traffic-<fecha>.md` con tablas agregadas.
2. Actualizar Q-04, Q-13, Q-14.

## Contratos e invariantes
- Privacidad: solo agregados.

## Archivos y componentes esperados
**Se espera crear o modificar (únicos permitidos):**
- docs/migration/evidence/traffic-<fecha>.md

**Archivos de referencia (solo lectura):**
- docs/migration/02-endpoint-inventory.md

No modificar archivos adicionales sin justificarlo en *Resultado de la ejecución*.

## Pruebas requeridas
- No aplica.

## Criterios de aceptación
- [ ] Tabla de rutas/estados/pico; lista de consumidores no previstos (o «ninguno»); Q-04/13/14 actualizadas.

## Verificación
- Revisión humana.

Adjuntar en el resultado la salida real (o un resumen fiel) de cada comando. Los comandos marcados *(propuesto)* se confirman o corrigen en TASK-0006/0007; si no funcionan tal cual, registrar el comando real.

## Riesgos y rollback
- Riesgo bajo. Rollback: borrar el archivo.

## Resultado de la ejecución
*(El agente completa esta sección al terminar. No marcar la tarea como completada si algún criterio de aceptación sigue sin cumplirse.)*

- **Resumen de cambios:**
- **Archivos modificados:**
- **Pruebas ejecutadas y resultados reales:**
- **Criterios satisfechos y pendientes:**
- **Diferencias detectadas respecto al original:**
- **Decisiones que requieren revisión humana:**
- **Evidencia y commit:**
