# 🔄 RESUMEN DE CAMBIOS - CUESTIONARIO ADAPTATIVO EXPANDIDO

## Cambios Realizados en `/src/script.js`

### 1. Ampliación de Flujos de Preguntas

#### Antes
```javascript
const flowLengths = {
    pareja: 7,   // age + start + pareja_1-5
    fam: 5,      // age + start + fam_1-3
    trab: 4      // age + start + trab_1-2
};
```

#### Después
```javascript
const flowLengths = {
    pareja: 12,  // age + start + pareja_1-12
    fam: 12,     // age + start + fam_1-12
    trab: 12     // age + start + trab_1-12
};
```

---

### 2. Nuevas Preguntas Agregadas

#### FLUJO PAREJA (+ 7 preguntas nuevas)
- **pareja_6:** Control Económico
- **pareja_7:** Aislamiento  
- **pareja_8:** Amenazas a Seres Queridos
- **pareja_9:** Destrucción de Propiedad
- **pareja_10:** Control de Ubicación
- **pareja_11:** Presión Sexual
- **pareja_12:** Atrapamiento

#### FLUJO FAMILIA (+ 9 preguntas nuevas)
- **fam_4:** Control de Autonomía
- **fam_5:** Rechazo Emocional
- **fam_6:** Negación de Necesidades
- **fam_7:** Abuso Sexual
- **fam_8:** Obediencia Ciega
- **fam_9:** Culpabilización
- **fam_10:** Acoso Digital
- **fam_11:** Exposición Pública
- **fam_12:** Silencio Obligado

#### FLUJO TRABAJO/ESCUELA (+ 10 preguntas nuevas)
- **trab_3:** Aislamiento Laboral
- **trab_4:** Sabotaje de Recursos
- **trab_5:** Supervisión Excesiva
- **trab_6:** Discriminación
- **trab_7:** Quid Pro Quo Sexual
- **trab_8:** Acercamiento No Deseado
- **trab_9:** Represalias
- **trab_10:** Falta de Respuesta Institucional
- **trab_11:** Impacto en Seguridad Laboral
- **trab_12:** Impacto en Salud

---

### 3. Nuevo Tipo de Violencia

#### Antes
```javascript
const violenceTypeInfo = {
    psicologica: { ... },
    fisica: { ... },
    economica: { ... },
    patrimonial: { ... },
    sexual: { ... }
};
```

#### Después
```javascript
const violenceTypeInfo = {
    psicologica: { ... },
    fisica: { ... },
    economica: { ... },
    patrimonial: { ... },
    sexual: { ... },
    intimidacion: {  // ✨ NUEVO
        name: "Intimidación y amenazas",
        desc: "Amenazas de daño, represalias, chantaje emocional que generan miedo constante."
    }
};
```

---

### 4. Sistema de Puntuación Ampliado

#### Antes
```javascript
let scores = { psicologica: 0, fisica: 0, economica: 0, patrimonial: 0, sexual: 0 };
```

#### Después
```javascript
let scores = { psicologica: 0, fisica: 0, economica: 0, patrimonial: 0, sexual: 0, intimidacion: 0 };
```

---

### 5. Corrección de Lógica de Progreso

#### Antes (Problema)
```javascript
// La barra de progreso mostraba: 3/12, 4/12, ..., 14/12 ❌
if (currentQuestionId !== "age" && currentQuestionId !== "start") {
    currentStep++;
} else if (currentQuestionId === "start") {
    currentStep = 2;
} else {
    currentStep = 1;
}
```

#### Después (Corregido)
```javascript
// La barra de progreso ahora muestra: 1/12, 2/12, ..., 12/12 ✅
if (currentQuestionId === "start") {
    let flow = "pareja";
    if (nextId.startsWith("fam")) flow = "fam";
    if (nextId.startsWith("trab")) flow = "trab";
    totalSteps = flowLengths[flow];
    currentStep = 1; // Reiniciar contador para el flujo
} else if (currentQuestionId !== "age") {
    currentStep++; // Incrementar para preguntas del flujo
} else {
    currentStep = 1; // Configuración inicial
}
```

---

## 📊 Estadísticas de Cambios

| Métrica | Antes | Después | Cambio |
|---------|-------|---------|--------|
| Preguntas por flujo | 5, 3, 2 | 12, 12, 12 | +7, +9, +10 |
| Total de preguntas (flujos) | 10 | 36 | +26 |
| Tipos de violencia | 5 | 6 | +1 |
| Variables de estado | 5 | 6 | +1 |

---

## 🔍 Nuevos Indicadores de VIOLENCIA

### Violencia Psicológica (Expandida)
- Control emocional mejorado
- 12 indicadores diferentes por flujo
- Scoring 0-3 puntos por pregunta

### Violencia Física
- Golpes, empujones, contacto agresivo
- 1-3 puntos según severidad

### Violencia Económica
- Control de dinero
- Prohibición de trabajar
- Sabotaje de recursos
- 1-3 puntos según severidad

### Violencia Patrimonial
- Destrucción de pertenencias
- 1-3 puntos según severidad

### Violencia Sexual
- Presión sexual
- Acoso sexual
- Tocamientos no consentidos
- 1-3 puntos según severidad

### **Intimidación y Amenazas** ⭐ NUEVA
- Amenazas de daño
- Represalias
- Chantaje emocional
- 1-3 puntos según severidad

---

## ✨ Beneficios de la Expansión

### Para Usuarios
✅ **Más precisión:** 36 preguntas vs 10 preguntas  
✅ **Mejor adaptabilidad:** Flujos personalizados por relación  
✅ **Más completitud:** Cubre más facetas de violencia  
✅ **Mejor progreso visual:** Barra de 1/12 a 12/12  
✅ **Respuestas históricas:** Pueden volver atrás  

### Para el Sistema
✅ **6 tipos de violencia identificados** (antes 5)  
✅ **Scoring dinámico más granular** (0-3 puntos por pregunta)  
✅ **Lógica de progreso corregida**  
✅ **Nuevas variables de estado** para intimidación  

### Ejemplos de Nuevas Preguntas (Pareja)
1. ¿Te amenaza con hacer daño a tu familia? → Intimidación
2. ¿Controla dónde estás todo el tiempo? → Psicológica
3. ¿Fuerza relaciones sexuales? → Sexual
4. ¿Ha destruido tus cosas? → Patrimonial
5. ¿Has pensado dejar pero sientes que no puedes? → Atrapamiento

---

## 🚀 Próximas Mejoras Sugeridas

- [ ] Agregar más detalles en explicaciones de cada pregunta
- [ ] Implementar "triggers de riesgo alto" que muestren recursos inmediatos
- [ ] Agregar tracking de respuestas por tipo de violencia
- [ ] Crear gráfico de "perfil de violencia" en resultados
- [ ] Agregar sección de "planes de seguridad" al final
- [ ] Integrar test de "disposición al cambio"

---

**Documentación Completada:** 11 de junio de 2026  
**Archivos Modificados:** `/src/script.js`  
**Archivos Creados:** `CUESTIONARIO_EXPANDIDO.md`, `CAMBIOS_REALIZADOS.md`  
**Estado:** ✅ Completado
