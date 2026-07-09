# Refleja

[![Software License](https://img.shields.io/badge/license-MIT-brightgreen.svg?style=social)](https://github.com/fernandodilland/refleja/blob/main/LICENSE)

**Una herramienta digital, colaborativa, clara y accesible para visibilizar, nombrar y comprender las distintas formas de violencia de género.**

Refleja es un **proyecto ciudadano de [LABNL – Lab Cultural Ciudadano](https://wiki.labnuevoleon.mx/index.php?title=Refleja:_Una_herramienta_para_la_concientizaci%C3%B3n_sobre_la_Violencia_de_G%C3%A9nero)**, libre y de código abierto. Ofrece un autoescaneo confidencial y gratuito para reconocer señales de violencia de género y un directorio de apoyo para los 51 municipios de Nuevo León.

🌐 **Sitio:** [refleja.org](https://refleja.org)

---

## ¿Por qué Refleja?

El proyecto surge al advertir la necesidad de concientizar sobre la violencia de género, debido a la permanencia de la **Alerta de Violencia de Género** en Nuevo León desde 2016. Actualmente nueve municipios tienen la alerta activa: **Apodaca, Cadereyta Jiménez, Guadalupe, Juárez, Monterrey, Escobedo, García, Ciénega de Flores y Salinas Victoria.**

Frente a los pocos recursos digitales —a menudo limitados— y a espacios en línea que pueden resultar hostiles, Refleja busca crear un **espacio seguro en internet**, con información suficiente, amplia y sencilla de comprender, que fortalezca la capacidad de identificar violencias cotidianas y acompañe procesos de reflexión y acción.

Es un proceso **participativo y colectivo**: personas colaboradoras de diversas áreas dialogan para construir una herramienta verdaderamente útil, replicable y basada en información confiable, que promueva el ejercicio de derechos y la construcción de entornos más seguros y libres de violencias.

---

## Características

- **Autoescaneo confidencial** por tipo de relación (pareja, familiar, trabajo/escuela) que ayuda a reconocer señales de violencia psicológica, física, económica, patrimonial, sexual e intimidación.
- **Directorio de apoyo** municipal, estatal y nacional para los 51 municipios de Nuevo León (teléfonos, WhatsApp, direcciones).
- **Privacidad primero**: botón de salida rápida, sin registro de usuarios y **estadística anónima** (no se guardan IPs ni datos personales).
- **Accesible y sin rastreo intrusivo**, optimizado para SEO y para funcionar en cualquier dispositivo.
- **Abierto y replicable**: cualquier persona puede proponer mejoras, recursos o adaptarlo a otros contextos.

---

## Estructura del proyecto

```
refleja/
├── front/          # Sitio estático (JAMstack) desplegado en Cloudflare (wrangler)
│   ├── src/
│   │   ├── formulario.json    # Preguntas del cuestionario y puntajes
│   │   ├── municipios.json    # Directorio de recursos por municipio
│   │   └── generate.js        # Genera las páginas por municipio + sitemap
│   └── wrangler.toml
└── back/           # API FastAPI (Python 3.10) de estadística anónima + panel admin
    └── README.md   # Guía de despliegue del backend
```

---

## Correr en local (VS Code)

Requiere **Python 3.10** y **Node.js**. Abre la carpeta raíz del proyecto en VS Code y pulsa **F5** → elige **“Refleja: front + back (local)”**. Eso levanta:

- **Front** en http://localhost:8788 (wrangler dev)
- **Back** en http://localhost:20832 (uvicorn)

El front detecta el entorno automáticamente: en local apunta al backend en `localhost:20832`; en producción (`*.refleja.org`) apunta a `https://api.refleja.org`.

> Detalle del backend (venv, `.env`, despliegue en producción) en [`back/README.md`](back/README.md).

---

## Cómo aportar

Refleja es abierto: se agradecen correcciones de datos, nuevos recursos, mejoras al cuestionario y al código.

### Aportes sin programar (datos)

- **Recursos de un municipio** → edita [`front/src/municipios.json`](front/src/municipios.json): agrega o corrige teléfonos, WhatsApp, direcciones y enlaces en el arreglo `resources` del municipio.
- **Preguntas del cuestionario** → edita [`front/src/formulario.json`](front/src/formulario.json).
- Tras editar los datos, regenera las páginas con `node front/generate.js`.

### Flujo con Git/GitHub

1. Haz **fork** del repositorio (botón *Fork* en GitHub) o clónalo si tienes acceso:
   ```bash
   git clone https://github.com/fernandodilland/refleja.git
   cd refleja
   ```
2. Crea una rama para tu aporte:
   ```bash
   git checkout -b aporte/nombre-descriptivo
   ```
3. Haz tus cambios y commitea:
   ```bash
   git add -A
   git commit -m "Agrega recursos de apoyo del municipio X"
   ```
4. Sube la rama y abre un **Pull Request** en GitHub:
   ```bash
   git push origin aporte/nombre-descriptivo
   ```
   Luego, en GitHub, pulsa **“Compare & pull request”**, describe tu cambio y envíalo.

### Reportar un problema o proponer algo

¿Encontraste un dato incorrecto, un error o tienes una idea? Abre un **Issue**:
GitHub → pestaña **Issues** → **New issue** → describe con detalle (municipio, pregunta o pantalla afectada, y qué esperabas).

---

## Créditos y licencia

Proyecto ciudadano creado en **[LABNL – Lab Cultural Ciudadano](https://wiki.labnuevoleon.mx/index.php?title=Refleja:_Una_herramienta_para_la_concientizaci%C3%B3n_sobre_la_Violencia_de_G%C3%A9nero)**.

## License

Refleja is released under the [MIT License](https://github.com/fernandodilland/refleja/blob/main/LICENSE).

---

### 🚨 ¿Necesitas ayuda ahora?

Si tú o alguien está en peligro, llama al **911**. Consulta también el directorio de apoyo por municipio en [refleja.org](https://refleja.org).
