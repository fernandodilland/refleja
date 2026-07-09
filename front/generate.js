#!/usr/bin/env node
/**
 * Generador de páginas estáticas por municipio para Refleja.
 * Lee src/municipios.json y produce:
 *   - src/<slug>/index.html   (una página por municipio, SEO optimizado)
 *   - src/municipios/index.html (índice buscable de los 51 municipios)
 *   - src/sitemap.xml         (con todas las URLs)
 *
 * Uso: node generate.js
 */
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "src");
const DATA = JSON.parse(fs.readFileSync(path.join(SRC, "municipios.json"), "utf8"));
const SITE = "https://refleja.org";
const TODAY = new Date().toISOString().slice(0, 10);

const municipioResources = DATA.municipioResources;
const estatalNLResources = DATA.estatalNLResources || [];
const nationalResources = DATA.nationalResources || [];

// Lista ordenada alfabéticamente (ignorando acentos)
const muniList = Object.keys(municipioResources)
  .map((slug) => ({
    slug,
    name: municipioResources[slug].name,
    hasMunicipal:
      Array.isArray(municipioResources[slug].resources) &&
      municipioResources[slug].resources.length > 0,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));

// Directorio público de municipios: excluye "otro" (no es un municipio de Nuevo León).
// Se usa en la página /municipios, el menú desplegable y los datos estructurados.
// La lista completa (muniList) se mantiene para el sitemap y la generación de páginas.
const directoryList = muniList.filter((m) => m.slug !== "otro");

const LABNL_URL =
  "https://wiki.labnuevoleon.mx/index.php?title=Refleja:_Una_herramienta_para_la_concientizaci%C3%B3n_sobre_la_Violencia_de_G%C3%A9nero";

// --- Utilidades ---
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function attr(s) {
  return esc(s);
}
function digits(s) {
  return String(s || "").replace(/\D/g, "");
}

// --- Render de una tarjeta de recurso (estático, espejo de populateResourceCard) ---
function resourceCard(res) {
  let details = "";
  if (res.address) {
    details += `<div class="resource-detail-item"><strong>Dirección:</strong> ${esc(res.address)}</div>`;
  }
  if (res.email) {
    details += `<div class="resource-detail-item"><strong>Correo:</strong> <a href="mailto:${attr(res.email)}" style="color:var(--warm);text-decoration:none;">${esc(res.email)}</a></div>`;
  }
  const detailsHtml = details
    ? `<div class="resource-card__details">${details}</div>`
    : "";

  let links = "";
  if (res.contact) {
    links += `<a class="resource-btn resource-btn--phone" href="tel:${attr(digits(res.contact))}">📞 Llamar: ${esc(res.contact)}</a>`;
  }
  if (res.altContact) {
    links += `<span class="resource-btn resource-btn--disabled">Alt: ${esc(res.altContact)}</span>`;
  }
  if (res.whatsapp) {
    links += `<a class="resource-btn resource-btn--whatsapp" href="https://wa.me/${attr(digits(res.whatsapp))}" target="_blank" rel="noopener noreferrer">💬 WhatsApp: ${esc(res.whatsapp)}</a>`;
  }
  if (res.link) {
    links += `<a class="resource-btn resource-btn--link" href="${attr(res.link)}" target="_blank" rel="noopener noreferrer">🔗 ${esc(res.linkLabel || "Sitio Oficial")}</a>`;
  }
  const linksHtml = links
    ? `<div class="resource-card__links">${links}</div>`
    : "";

  const descHtml = res.desc
    ? `<p class="resource-card__desc">${esc(res.desc)}</p>`
    : "";

  return `<article class="resource-card"><h3>${esc(res.name)}</h3>${descHtml}${detailsHtml}${linksHtml}</article>`;
}

function resourceGroup(title, items) {
  const cards = items.map(resourceCard).join("\n");
  return `<div class="resources-group"><h3 class="resources-group-title">${title}</h3><div class="resources-grid">${cards}</div></div>`;
}

// --- Encabezado (isla superior) compartido ---
function header() {
  return `<div id="top-control-island" class="top-island">
  <div class="top-island__container">
    <div class="top-island__brand">
      <a href="/" class="muni-menu__trigger" style="text-decoration: none;">
        <span>Inicio</span>
      </a>
      <div class="muni-menu" id="muni-menu">
        <button id="muni-menu-trigger" class="muni-menu__trigger" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="muni-menu-panel" title="Ver directorios por municipio de Nuevo León">
          <span class="muni-menu__trigger-icon">📍</span>
          <span class="muni-menu__trigger-text">
            <span class="text-long">Municipios de Nuevo León</span>
            <span class="text-short">Municipios</span>
          </span>
          <span class="muni-menu__trigger-caret" aria-hidden="true">▾</span>
        </button>
        <div id="muni-menu-panel" class="muni-menu__panel" role="menu" aria-label="Municipios de Nuevo León" hidden>
          <div class="muni-menu__header">
            <p class="muni-menu__title">Municipios de Nuevo León</p>
            <p class="muni-menu__subtitle">Medios de apoyo a la violencia de género</p>
          </div>
          <div class="muni-menu__search-wrap">
            <span class="muni-menu__search-icon" aria-hidden="true">🔎</span>
            <input id="muni-menu-search" class="muni-menu__search" type="text" placeholder="Buscar municipio…" autocomplete="off" aria-label="Buscar municipio" />
          </div>
          <ul id="muni-menu-list" class="muni-menu__list" role="none"></ul>
          <a href="/municipios" class="muni-menu__all">Ver los 51 municipios →</a>
        </div>
      </div>
    </div>
    <div class="top-island__actions">
      <a href="#emergencia" class="button-urgent" title="Líneas de ayuda inmediata">
        <span class="btn-icon">🚨</span>
        <span class="btn-text btn-text--desktop">Ayuda Urgente</span>
        <span class="btn-text btn-text--mobile">Urgente</span>
      </a>
      <button id="hide-site-btn" class="button-hide" type="button" title="Salir rápidamente a un sitio neutral">
        <span class="btn-icon">👁️‍🗨️</span>
        <span>Ocultar</span>
      </button>
    </div>
  </div>
</div>`;
}

function footer() {
  return `<footer class="footer">
  <a class="footer-emergency" href="tel:911">
    <span class="footer-emergency__icon" aria-hidden="true">🚨</span>
    <span class="footer-emergency__text">Emergencias <strong>911</strong></span>
  </a>
  <div class="footer-credit">
    <a href="${LABNL_URL}" target="_blank" rel="noopener noreferrer">Proyecto Ciudadano creado en LABNL</a>
  </div>
  <nav class="footer-nav" aria-label="Directorio de municipios">
    <a href="/municipios">Medios de apoyo por municipio de Nuevo León</a>
  </nav>
</footer>`;
}

function meshBg() {
  return `<div class="mesh-background" aria-hidden="true"><div class="blob blob-1"></div><div class="blob blob-2"></div><div class="blob blob-3"></div><div class="blob blob-4"></div></div>`;
}

function muniListScript() {
  const compact = directoryList.map((m) => ({
    slug: m.slug,
    name: m.name,
    hasMunicipal: m.hasMunicipal,
  }));
  return `<script>window.__MUNI_LIST__=${JSON.stringify(compact)};</script>`;
}

function headCommon(title, description, canonical, extraLd) {
  return `<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="description" content="${attr(description)}" />
<link rel="canonical" href="${attr(canonical)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Refleja" />
<meta property="og:title" content="${attr(title)}" />
<meta property="og:description" content="${attr(description)}" />
<meta property="og:url" content="${attr(canonical)}" />
<meta property="og:locale" content="es_MX" />
<meta name="twitter:card" content="summary_large_image" />
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/styles.css" />
${extraLd || ""}`;
}

// --- Página de un municipio ---
function municipioPage(slug) {
  const m = municipioResources[slug];
  const name = m.name;
  const hasMunicipal = m.resources && m.resources.length > 0;
  const h1 = `Medios de Apoyo a la Violencia de Género en ${name}`;
  const h1Html = `Medios de Apoyo a la Violencia de Género en <span class="muni-hero__name">${esc(name)}</span>`;
  const title = `${h1} | Refleja`;
  const description = hasMunicipal
    ? `Directorio de apoyo a la violencia de género en ${name}, Nuevo León: teléfonos, WhatsApp, correos y direcciones de instancias municipales y estatales gratuitas y confidenciales.`
    : `Apoyo a la violencia de género para ${name}, Nuevo León: líneas estatales y nacionales gratuitas y confidenciales disponibles las 24 horas.`;
  const canonical = `${SITE}/${slug}`;

  const lead = hasMunicipal
    ? `Si vives violencia de género en <strong>${esc(name)}</strong>, no estás sola. Aquí reunimos los medios de apoyo municipales, estatales y nacionales —gratuitos y confidenciales— para orientarte, acompañarte y protegerte.`
    : `Reunimos los medios de apoyo disponibles para <strong>${esc(name)}</strong>, Nuevo León. Aunque no identificamos una oficina municipal dedicada, los recursos estatales y nacionales que aparecen aquí son gratuitos, confidenciales y cubren todo el estado.`;

  const municipalSection = hasMunicipal
    ? resourceGroup(`📍 Apoyo municipal en ${esc(name)}`, m.resources)
    : `<div class="resources-group"><h3 class="resources-group-title">📍 Apoyo municipal en ${esc(name)}</h3><div class="note"><strong>Nota · </strong>No identificamos una instancia municipal específica de atención a la violencia de género en ${esc(name)}. Utiliza los recursos estatales (válidos en todo Nuevo León) y las líneas nacionales que aparecen abajo; están disponibles para ti las 24 horas.</div></div>`;

  const ld = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: h1,
    description: description,
    url: canonical,
    inLanguage: "es-MX",
    isPartOf: { "@type": "WebSite", name: "Refleja", url: SITE },
    about: {
      "@type": "Place",
      name: `${name}, Nuevo León, México`,
    },
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: "Municipios", item: SITE + "/municipios" },
      { "@type": "ListItem", position: 3, name: name, item: canonical },
    ],
  };
  const ldScript = `<script type="application/ld+json">${JSON.stringify(ld)}</script>\n<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>`;

  return `<!doctype html>
<html lang="es">
<head>
${headCommon(title, description, canonical, ldScript)}
</head>
<body class="stage-municipio">
${meshBg()}
${header()}
<main class="page-shell">
  <article class="card muni-hero">
    <div class="pill">Nuevo León</div>
    <h1>${h1Html}</h1>
    <p class="muni-hero__lead">${lead}</p>

    <div class="muni-emergency" id="emergencia">
      <div class="muni-emergency__text">
        <strong>¿Estás en peligro ahora?</strong>
        <span>Llama sin costo, disponible 24/7 en todo México.</span>
      </div>
      <a class="muni-emergency__call" href="tel:911">911 <span>Emergencias</span></a>
    </div>

    <div class="muni-section">
      ${municipalSection}
      ${resourceGroup("🏛️ Apoyo estatal (todo Nuevo León)", estatalNLResources)}
      ${resourceGroup("📞 Líneas nacionales de apoyo (24/7)", nationalResources)}
    </div>

    <a href="/municipios" class="muni-back-link">← Ver todos los municipios de Nuevo León</a>
  </article>

  <section class="card muni-cta">
    <div class="pill">Test confidencial</div>
    <h2>¿Quieres saber si lo que vives es violencia?</h2>
    <p>Haz el autoescaneo de Refleja: breve, confidencial y gratuito. Reconocer es el primer paso.</p>
    <a href="/" class="button button--start">Hacer el test</a>
  </section>

  ${footer()}
</main>
${muniListScript()}
<script src="/analytics.js"></script>
<script src="/municipio.js"></script>
</body>
</html>`;
}

// --- Página índice /municipios ---
function indexPage() {
  const title = "Municipios de Nuevo León · Medios de Apoyo a la Violencia de Género | Refleja";
  const description =
    "Directorio por municipio de los medios de apoyo a la violencia de género en los 51 municipios de Nuevo León: teléfonos, WhatsApp y oficinas municipales, estatales y nacionales.";
  const canonical = `${SITE}/municipios`;

  const cards = directoryList
    .map((m, i) => {
      const tagClass = m.hasMunicipal
        ? "muni-menu__item-tag--muni"
        : "muni-menu__item-tag--state";
      const tagText = m.hasMunicipal ? "Municipal" : "Estatal";
      return `<a class="muni-index-card" style="--i:${i}" href="/${m.slug}" data-name="${attr(m.name)}"><span>${esc(m.name)}</span><span class="muni-menu__item-tag ${tagClass}">${tagText}</span></a>`;
    })
    .join("\n");

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Municipios de Nuevo León",
    itemListElement: directoryList.map((m, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: m.name,
      url: `${SITE}/${m.slug}`,
    })),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: "Municipios", item: canonical },
    ],
  };
  const ldScript = `<script type="application/ld+json">${JSON.stringify(itemListLd)}</script>\n<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>`;

  return `<!doctype html>
<html lang="es">
<head>
${headCommon(title, description, canonical, ldScript)}
</head>
<body class="stage-municipios">
${meshBg()}
${header()}
<main class="page-shell">
  <article class="card muni-hero">
    <div class="pill">Directorio estatal</div>
    <h1>Municipios de Nuevo León</h1>
    <p class="muni-hero__lead">Encuentra los <strong>medios de apoyo a la violencia de género</strong> en cada uno de los 51 municipios de Nuevo León. Selecciona tu municipio para ver teléfonos, WhatsApp, correos y oficinas de apoyo gratuitas y confidenciales.</p>

    <div class="muni-index-search-wrap">
      <span class="muni-menu__search-icon" aria-hidden="true">🔎</span>
      <input id="muni-index-search" class="muni-index-search" type="text" placeholder="Buscar tu municipio…" autocomplete="off" aria-label="Buscar municipio" />
    </div>

    <div id="muni-index-grid" class="muni-index-grid">
      ${cards}
    </div>
    <p id="muni-index-empty" class="muni-menu__empty" style="display:none;">No se encontró ese municipio.</p>
  </article>

  <section class="card muni-cta">
    <div class="pill">Test confidencial</div>
    <h2>¿Quieres saber si lo que vives es violencia?</h2>
    <p>Haz el autoescaneo de Refleja: breve, confidencial y gratuito. Reconocer es el primer paso.</p>
    <a href="/" class="button button--start">Hacer el test</a>
  </section>

  ${footer()}
</main>
${muniListScript()}
<script src="/analytics.js"></script>
<script src="/municipio.js"></script>
</body>
</html>`;
}

// --- Sitemap ---
function sitemap() {
  const urls = [];
  urls.push({ loc: `${SITE}/`, priority: "1.0", changefreq: "monthly" });
  urls.push({ loc: `${SITE}/municipios`, priority: "0.9", changefreq: "monthly" });
  muniList.forEach((m) => {
    urls.push({ loc: `${SITE}/${m.slug}`, priority: "0.7", changefreq: "monthly" });
  });
  const body = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// --- Escritura ---
let count = 0;
Object.keys(municipioResources).forEach((slug) => {
  const dir = path.join(SRC, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), municipioPage(slug), "utf8");
  count++;
});

fs.mkdirSync(path.join(SRC, "municipios"), { recursive: true });
fs.writeFileSync(path.join(SRC, "municipios", "index.html"), indexPage(), "utf8");

fs.writeFileSync(path.join(SRC, "sitemap.xml"), sitemap(), "utf8");

console.log(`✓ Generadas ${count} páginas de municipio + /municipios + sitemap.xml`);
console.log(`  Con instancia municipal: ${muniList.filter((m) => m.hasMunicipal).length}`);
console.log(`  Solo estatal/nacional:   ${muniList.filter((m) => !m.hasMunicipal).length}`);
