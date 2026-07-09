# 📋 Extracto de Preguntas - Proyecto REFLEJA

## Descripción General
Este documento contiene todas las preguntas de los formularios presentes en el proyecto **REFLEJA**, que es un autoescaneo confidencial para reconocer señales de violencia psicológica.

El proyecto tiene **DOS versiones de cuestionarios**:
1. **Opción 1** (src/test.ts): Test simple de 15 preguntas
2. **Opción 2** (src/script.js): Sistema tipo Akinator con flujos dinámicos

---

## OPCIÓN 1: Test Simple (15 Preguntas)

### Descripción
Test breve y confidencial para mujeres desde los 15 años. Las respuestas son **Sí/No** y se basa en indicadores comunes de violencia psicológica: control, humillación, aislamiento, manipulación e intimidación.

### Niveles de Riesgo por Puntuación
- **Riesgo Bajo**: 0-3 respuestas afirmativas
- **Riesgo Medio**: 4-8 respuestas afirmativas  
- **Riesgo Alto**: 9-15 respuestas afirmativas

---

### PREGUNTAS Y RESPUESTAS

#### 1️⃣ Pregunta 1
**Texto:** ¿Tu pareja, familiar o alguien cercano te insulta, ridiculiza o te dice cosas que te hacen sentir poco valiosa?

**Tipo de Violencia:** Violencia Psicológica
**Respuestas posibles:** Sí / No

---

#### 2️⃣ Pregunta 2
**Texto:** ¿Sientes que debes pedir permiso o dar explicaciones constantes sobre lo que haces, vistes o con quién hablas?

**Tipo de Violencia:** Violencia Psicológica (Control)
**Respuestas posibles:** Sí / No

---

#### 3️⃣ Pregunta 3
**Texto:** ¿Esa persona controla tus salidas, tu celular, tus redes sociales o tu dinero?

**Tipo de Violencia:** Violencia Psicológica, Económica
**Respuestas posibles:** Sí / No

---

#### 4️⃣ Pregunta 4
**Texto:** ¿Te ha amenazado con hacerte daño, hacer daño a alguien que amas, o quitarte a tus hijos/mascotas?

**Tipo de Violencia:** Violencia Psicológica, Intimidación
**Respuestas posibles:** Sí / No

---

#### 5️⃣ Pregunta 5
**Texto:** ¿Te culpa a ti de su enojo, de sus problemas, o de cosas que no dependen de ti?

**Tipo de Violencia:** Violencia Psicológica (Manipulación)
**Respuestas posibles:** Sí / No

---

#### 6️⃣ Pregunta 6
**Texto:** ¿Has dejado de ver a tu familia o amistades por miedo a su reacción o para evitar conflictos?

**Tipo de Violencia:** Violencia Psicológica (Aislamiento)
**Respuestas posibles:** Sí / No

---

#### 7️⃣ Pregunta 7
**Texto:** ¿Te grita, te humilla en público o frente a otras personas?

**Tipo de Violencia:** Violencia Psicológica
**Respuestas posibles:** Sí / No

---

#### 8️⃣ Pregunta 8
**Texto:** ¿Sientes miedo cuando llega a casa o cuando vas a verle?

**Tipo de Violencia:** Violencia Psicológica (Intimidación)
**Respuestas posibles:** Sí / No

---

#### 9️⃣ Pregunta 9
**Texto:** ¿Te dice que estás 'loca', exagerada o que inventas cosas cuando expresas lo que sientes?

**Tipo de Violencia:** Violencia Psicológica (Gaslighting)
**Respuestas posibles:** Sí / No

---

#### 1️⃣0️⃣ Pregunta 10
**Texto:** ¿Has cambiado tu forma de ser, vestir o hablar para evitar que se moleste?

**Tipo de Violencia:** Violencia Psicológica (Control)
**Respuestas posibles:** Sí / No

---

#### 1️⃣1️⃣ Pregunta 11
**Texto:** ¿Te ha hecho sentir que nadie más te querría o que sin esa persona no podrías estar bien?

**Tipo de Violencia:** Violencia Psicológica (Aislamiento Emocional)
**Respuestas posibles:** Sí / No

---

#### 1️⃣2️⃣ Pregunta 12
**Texto:** ¿Revisa tus mensajes, llamadas o ubicación sin tu consentimiento?

**Tipo de Violencia:** Violencia Psicológica (Control)
**Respuestas posibles:** Sí / No

---

#### 1️⃣3️⃣ Pregunta 13
**Texto:** ¿Te compara con otras personas para hacerte sentir menos?

**Tipo de Violencia:** Violencia Psicológica (Humillación)
**Respuestas posibles:** Sí / No

---

#### 1️⃣4️⃣ Pregunta 14
**Texto:** ¿Has llorado a solas con frecuencia, sintiéndote atrapada, ansiosa o sin esperanza por esta relación?

**Tipo de Violencia:** Violencia Psicológica (Impacto Emocional)
**Respuestas posibles:** Sí / No

---

#### 1️⃣5️⃣ Pregunta 15
**Texto:** ¿Has pensado que algo está mal, aunque desde fuera te digan que 'no es para tanto'?

**Tipo de Violencia:** Violencia Psicológica (Validación de Intuición)
**Respuestas posibles:** Sí / No

---

## OPCIÓN 2: Sistema Dinámico Tipo Akinator (Flujo Adaptativo)

### Descripción
Sistema más sofisticado con **rutas de preguntas diferentes según el tipo de relación** con la persona agresora. Las respuestas generan puntuaciones acumulativas para cada tipo de violencia.

### Flujos Disponibles
- **Pareja/Ex pareja**: 7 preguntas (basadas en el Ciclo de la Violencia de Leonore Walker)
- **Familiar**: 5 preguntas
- **Trabajo/Escuela**: 4 preguntas

### Tipos de Violencia en Este Sistema
- **Psicológica**
- **Física**
- **Económica**
- **Patrimonial**
- **Sexual**

---

## PANTALLA INICIAL - CLASIFICACIÓN DE EDAD

### Pregunta: "¿Qué edad tienes?"
**Propósito:** Determinar si la persona es menor de edad para enrutarla a recursos apropiados.

**Respuestas posibles:**
- Menos de 18 años → Pantalla especial (MINOR)
- 18 a 25 años → Continuar al siguiente paso
- 26 a 40 años → Continuar al siguiente paso
- 41 años o más → Continuar al siguiente paso

**Explicación:** Tu edad nos ayuda a orientarte de la mejor manera posible. Si eres menor de edad, te recomendaremos cómo actuar con el apoyo de tus padres o tutores.

**Fuente:** Ley General de los Derechos de Niñas, Niños y Adolescentes (México)

---

## PANTALLA 2 - SELECCIÓN DE RELACIÓN

### Pregunta: "Para comenzar, piensa en esa persona con la que no te sientes del todo segura o cómoda. ¿Qué relación tienes con ella?"

**Propósito:** Identificar el tipo de vínculo para personalizar las preguntas.

**Respuestas posibles:**
1. Mi pareja o ex pareja → Flujo PAREJA (7 preguntas)
2. Un familiar (madre, padre, etc.) → Flujo FAMILIA (5 preguntas)
3. Alguien de mi trabajo o escuela → Flujo TRABAJO/ESCUELA (4 preguntas)
4. Otra persona → Flujo PAREJA (7 preguntas, por defecto)

**Explicación:** Identificar el vínculo nos ayuda a hacerte preguntas más específicas. La violencia se presenta de formas distintas dependiendo de si viene de una pareja, un familiar o en el entorno laboral/escolar.

**Fuente:** Instituto Nacional de las Mujeres (INMUJERES)

---

## FLUJO PAREJA (7 Preguntas)
### Basado en el Ciclo de la Violencia de Leonore Walker (1979)

---

### PAREJA - Pregunta 1: "Luna de Miel"
**Texto:** Después de una discusión fuerte o un episodio difícil, ¿esa persona se vuelve especialmente cariñosa, te da regalos, te promete que todo cambiará y actúa como la pareja perfecta?

**Fase del Ciclo:** Luna de Miel

**Respuestas posibles:**
| Respuesta | Puntos Psicológica |
|-----------|-------------------|
| Sí, siempre después de una pelea es muy cariñoso/a | 2 |
| A veces intenta compensar con detalles | 1 |
| No, no hay cambios después de las discusiones | 0 |

**Explicación:** Esta es la fase de 'Luna de miel' del Ciclo de la Violencia. La persona agresora se muestra encantadora, romántica y llena de atenciones para que bajes la guardia. Esta fase crea una falsa esperanza de que la relación mejorará, pero es parte del patrón de control.

**Fuente:** Ciclo de la Violencia - Leonore Walker (1979)

---

### PAREJA - Pregunta 2: "Acumulación de Tensión"
**Texto:** ¿Sientes que 'caminas sobre cáscaras de huevo'? Es decir, ¿hay temporadas en las que tienes miedo constante de que algo que digas o hagas provoque una discusión explosiva?

**Fase del Ciclo:** Acumulación de Tensión

**Respuestas posibles:**
| Respuesta | Puntos Psicológica |
|-----------|-------------------|
| Sí, evito ciertos temas y situaciones por miedo a su reacción | 3 |
| A veces noto que hay tensión acumulándose | 1 |
| No, me siento libre de expresarme | 0 |

**Explicación:** La fase de 'Acumulación de tensión' se caracteriza por una ansiedad creciente y un ambiente de miedo. La víctima modifica su comportamiento intentando evitar el conflicto, pero la tensión sigue escalando hasta volverse insostenible.

**Fuente:** Ciclo de la Violencia - Leonore Walker (1979)

---

### PAREJA - Pregunta 3: "Explosión Violenta"
**Texto:** Cuando la tensión acumulada estalla, ¿te insulta, te humilla, te empuja, te golpea, rompe tus cosas o te fuerza sexualmente?

**Fase del Ciclo:** Explosión Violenta

**Respuestas posibles:**
| Respuesta | Puntos Psicológica | Puntos Física | Puntos Sexual |
|-----------|-------------------|---------------|---------------|
| Sí, ha habido violencia física, insultos graves o agresiones | 2 | 3 | 1 |
| Grita o insulta, pero no ha llegado a lo físico | 2 | 0 | 0 |
| No, discutimos pero sin llegar a violencia | 0 | 0 | 0 |

**Explicación:** La fase de 'Explosión violenta' es cuando la violencia se manifiesta de forma visible. Puede ser psicológica (insultos, humillaciones), física (golpes, empujones), sexual, económica o patrimonial. Es el punto más peligroso y donde la integridad corre mayor riesgo.

**Fuente:** Ciclo de la Violencia - Leonore Walker (1979)

---

### PAREJA - Pregunta 4: "Reconciliación"
**Texto:** Después del episodio de explosión, ¿te promete que nunca volverá a pasar, te llena de regalos, te busca intensamente para tener relaciones y te dice que no puede vivir sin ti?

**Fase del Ciclo:** Reconciliación / Promesa de Cambio

**Respuestas posibles:**
| Respuesta | Puntos Psicológica | Puntos Sexual |
|-----------|-------------------|---------------|
| Sí, promete cambiar, da regalos y me busca sexualmente | 2 | 2 |
| Se disculpa pero no hay grandes promesas ni regalos | 1 | 0 |
| No, no hay fase de reconciliación | 0 | 0 |

**Explicación:** La fase de 'Reconciliación' o 'Promesa de cambio' es una táctica de manipulación para mantener el control. Los regalos, la intimidad forzada y las promesas buscan que olvides la agresión. Sin intervención profesional, el ciclo inevitablemente se repetirá con más intensidad.

**Fuente:** Ciclo de la Violencia - Leonore Walker (1979)

---

### PAREJA - Pregunta 5: "Repetición del Ciclo"
**Texto:** ¿Has notado que este patrón —tensión, explosión, reconciliación, calma— se repite una y otra vez, y cada vez la situación es peor o más intensa?

**Importancia:** Reconocimiento del patrón cíclico

**Respuestas posibles:**
| Respuesta | Puntos Psicológica | Puntos Física | Puntos Sexual |
|-----------|-------------------|---------------|---------------|
| Sí, es un ciclo que se repite y cada vez es peor | 3 | 2 | 2 |
| Ha pasado más de una vez, pero no sabía que era un ciclo | 2 | 0 | 0 |
| No, esto solo ha pasado una vez | 0 | 0 | 0 |

**Explicación:** Reconocer que existe un ciclo es el primer paso para romperlo. La violencia tiende a escalar: los periodos de calma se acortan y los episodios violentos se vuelven más frecuentes y graves. Sin ayuda profesional, el ciclo no se detiene por sí solo.

**Fuente:** Ciclo de la Violencia - Leonore Walker (1979)

---

## FLUJO FAMILIA (5 Preguntas)

---

### FAMILIA - Pregunta 1: "Crítica Destructiva"
**Texto:** ¿Constantemente critica tu cuerpo, tus decisiones de vida, te humilla frente a otras personas o te compara negativamente?

**Tipo de Violencia:** Violencia Psicológica

**Respuestas posibles:**
| Respuesta | Puntos Psicológica |
|-----------|-------------------|
| Sí, me hace sentir que no valgo nada | 3 |
| A veces hace comentarios hirientes | 1 |
| No, mi familia me respeta | 0 |

**Explicación:** Las críticas destructivas y humillaciones continuas por parte de familiares destruyen la autoestima. La violencia psicológica en el núcleo familiar crea un ambiente hostil que a menudo normaliza el maltrato.

**Fuente:** Sistema Nacional para el Desarrollo Integral de la Familia (SNDIF)

---

### FAMILIA - Pregunta 2: "Chantaje Emocional"
**Texto:** ¿Te amenaza con correrte de la casa, dejar de apoyarte económicamente o quitarte a tus hijos si no haces lo que dice?

**Tipo de Violencia:** Violencia Psicológica y Económica

**Respuestas posibles:**
| Respuesta | Puntos Psicológica | Puntos Económica |
|-----------|-------------------|------------------|
| Sí, el chantaje es constante | 2 | 2 |
| Lo ha dicho pero en momentos de mucho enojo | 1 | 0 |
| No, nunca me ha amenazado así | 0 | 0 |

**Explicación:** Amenazar con privarte de vivienda, sustento económico o separarte de tus seres queridos como método de control es chantaje emocional severo, clasificado como violencia psicológica y económica.

**Fuente:** Comisión Nacional de los Derechos Humanos (CNDH)

---

### FAMILIA - Pregunta 3: "Violencia Física"
**Texto:** ¿Ha usado la fuerza física (golpes, cachetadas, pellizcos) para castigarte o 'corregirte', justificando que es por tu bien?

**Tipo de Violencia:** Violencia Física

**Respuestas posibles:**
| Respuesta | Puntos Física | Puntos Patrimonial |
|-----------|---------------|-------------------|
| Sí, me ha lastimado físicamente | 3 | 0 |
| No me ha golpeado a mí, pero rompe cosas | 0 | 2 |
| No, jamás ha usado violencia física | 0 | 0 |

**Explicación:** El uso de la fuerza física para 'educar' o 'corregir' nunca está justificado. Es una violación directa a la dignidad y se clasifica como Violencia Familiar y Física, siendo un delito perseguido por la ley.

**Fuente:** Ley General de los Derechos de Niñas, Niños y Adolescentes (México)

---

## FLUJO TRABAJO/ESCUELA (4 Preguntas)

---

### TRABAJO - Pregunta 1: "Hostigamiento Laboral"
**Texto:** ¿Se burla de tu trabajo, te asigna tareas imposibles a propósito o te amenaza constantemente con despedirte o reprobarte sin razón?

**Tipo de Violencia:** Violencia Psicológica (Mobbing/Bullying)

**Respuestas posibles:**
| Respuesta | Puntos Psicológica |
|-----------|-------------------|
| Sí, siento hostigamiento constante | 3 |
| A veces es muy injusto/a | 1 |
| No, el trato es estrictamente profesional | 0 |

**Explicación:** El hostigamiento laboral o escolar ('Mobbing' o 'Bullying') incluye aislamiento, sobrecarga injustificada y burlas. Genera estrés crónico y afecta severamente la salud física y mental.

**Fuente:** Ley Federal del Trabajo de México (Artículos sobre acoso laboral)

---

### TRABAJO - Pregunta 2: "Acoso Sexual"
**Texto:** ¿Te ha hecho comentarios con doble sentido, insinuaciones sexuales, o te ha tocado de forma inapropiada sin tu consentimiento?

**Tipo de Violencia:** Violencia Sexual

**Respuestas posibles:**
| Respuesta | Puntos Sexual | Puntos Psicológica |
|-----------|---------------|-------------------|
| Sí, he sufrido acoso o tocamientos | 3 | 0 |
| Hace chistes incómodos que no me gustan | 1 | 1 |
| No, nunca ha pasado de esa línea | 0 | 0 |

**Explicación:** Cualquier insinuación sexual, exhibición o tocamiento no consentido en ámbitos laborales o académicos constituye Acoso y Hostigamiento Sexual, delitos tipificados y castigados por la legislación civil y penal.

**Fuente:** Código Penal Federal de México (Delitos contra la libertad y el normal desarrollo psicosexual)

---

## CLASIFICACIÓN DE TIPOS DE VIOLENCIA

### 1. Violencia Psicológica
**Definición:** Control, manipulación, gaslighting, humillaciones, indiferencia o aislamiento que afectan tu autoestima y autonomía.

**Indicadores:**
- Insultos y ridiculización
- Control de actividades y relaciones
- Amenazas
- Culpabilización
- Aislamiento de familia y amigos
- Gritos y humillaciones públicas
- Miedo constante
- Gaslighting ("estás loca")
- Cambio de comportamiento para evitar conflictos
- Sentimientos de ser poco valiosa
- Monitoreo de comunicaciones
- Comparaciones degradantes
- Impacto emocional grave (ansiedad, depresión)

---

### 2. Violencia Física
**Definición:** Empujones, jalones, golpes, cachetadas o cualquier contacto físico agresivo.

**Indicadores:**
- Golpes
- Empujones
- Cachetadas
- Jalones
- Daño a la integridad física
- Lesiones

---

### 3. Violencia Económica
**Definición:** Control de tu dinero, prohibición de trabajar, chantaje económico o exigencia de cuentas de gastos.

**Indicadores:**
- Control del dinero
- Prohibición de trabajar
- Chantaje económico
- Exigencia de reportes de gastos
- Amenaza de quitarte apoyo económico

---

### 4. Violencia Patrimonial
**Definición:** Destrucción o daño a tus pertenencias u objetos personales.

**Indicadores:**
- Destrucción de objetos personales
- Daño a pertenencias
- Robo de bienes personales

---

### 5. Violencia Sexual
**Definición:** Presión, manipulación o contacto sexual sin tu consentimiento libre y claro.

**Indicadores:**
- Presión para tener relaciones
- Insinuaciones sexuales
- Tocamientos sin consentimiento
- Acoso sexual
- Coerción sexual

---

## MENSAJES DE RESULTADO

### Riesgo BAJO (0 puntos totales)
**Título:** Tu autoescaneo sugiere señales bajas

**Mensaje:** Tus respuestas no indican señales claras de violencia según el Violentómetro. Sin embargo, si sientes incomodidad, dudas o no te sientes segura, siempre es recomendable hablar con un profesional.

---

### Riesgo MEDIO (1-4 puntos totales)
**Título:** Tu autoescaneo identifica señales que merecen atención

**Mensaje:** Hemos detectado señales de violencia en tus respuestas. Te recomendamos ampliamente contactar a un profesional para recibir orientación y acompañamiento personalizado.

---

### Riesgo ALTO (5+ puntos O presencia de violencia física/sexual)
**Título:** Tu autoescaneo refleja una situación de riesgo

**Mensaje:** Tus respuestas indican señales de violencia de alto riesgo. Tu seguridad e integridad física son lo más importante. Es sumamente importante que busques apoyo profesional inmediato en los números que te proporcionamos.

---

## NOTAS IMPORTANTES

✅ **Ambos cuestionarios son:**
- Confidenciales (100% anónimo)
- No invasivos
- No almacenan datos personales
- Pueden completarse en menos de 5 minutos

⚠️ **Este test NO es un diagnóstico médico o psicológico formal.** Es una herramienta de autoescaneo para:
- Reconocer patrones de comportamiento
- Validar intuiciones propias
- Facilitar la búsqueda de ayuda profesional

📞 **Recursos de Emergencia disponibles:**
- **911:** Emergencias inmediatas
- **070:** Línea de asesoría 24/7 en Nuevo León
- **800-822-4460:** Red Nacional de Refugios para Mujeres
- **800-290-0024:** Línea de la Vida (Apoyo Emocional)

---

**Última actualización:** 11 de junio de 2026
**Proyecto:** REFLEJA - Espacio Seguro para el Autoescaneo Emocional
