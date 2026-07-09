// --- SCRIPT COMPARTIDO PARA PÁGINAS ESTÁTICAS DE MUNICIPIO E ÍNDICE ---
// La lista de municipios se inyecta en cada página como window.__MUNI_LIST__
(function () {
  "use strict";

  var MUNI_LIST = (window.__MUNI_LIST__ || []).slice().sort(function (a, b) {
    return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
  });

  function norm(s) {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  // --- MENÚ DESPLEGABLE BUSCABLE DE MUNICIPIOS ---
  function buildMuniMenu() {
    var menu = document.getElementById("muni-menu");
    var trigger = document.getElementById("muni-menu-trigger");
    var panel = document.getElementById("muni-menu-panel");
    var search = document.getElementById("muni-menu-search");
    var listEl = document.getElementById("muni-menu-list");
    if (!menu || !trigger || !panel || !search || !listEl) return;

    function renderList(filter) {
      var q = norm((filter || "").trim());
      listEl.innerHTML = "";
      var matches = MUNI_LIST.filter(function (m) {
        return !q || norm(m.name).indexOf(q) !== -1;
      });
      if (matches.length === 0) {
        var empty = document.createElement("li");
        empty.className = "muni-menu__empty";
        empty.textContent = "No se encontró ese municipio.";
        listEl.appendChild(empty);
        return;
      }
      matches.forEach(function (m) {
        var li = document.createElement("li");
        li.setAttribute("role", "none");
        var a = document.createElement("a");
        a.className = "muni-menu__item";
        a.href = "/" + m.slug;
        a.setAttribute("role", "menuitem");
        var tagClass = m.hasMunicipal ? "muni-menu__item-tag--muni" : "muni-menu__item-tag--state";
        var tagText = m.hasMunicipal ? "Municipal" : "Estatal";
        a.innerHTML = "<span>" + m.name + "</span><span class=\"muni-menu__item-tag " + tagClass + "\">" + tagText + "</span>";
        li.appendChild(a);
        listEl.appendChild(li);
      });
    }

    function openMenu() {
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      search.value = "";
      renderList();
      setTimeout(function () { search.focus(); }, 30);
    }
    function closeMenu() {
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }
    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      if (panel.hidden) openMenu(); else closeMenu();
    });
    search.addEventListener("input", function () { renderList(search.value); });
    search.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        var first = listEl.querySelector(".muni-menu__item");
        if (first) window.location.href = first.getAttribute("href");
      } else if (e.key === "Escape") {
        closeMenu();
        trigger.focus();
      }
    });
    document.addEventListener("click", function (e) {
      if (!panel.hidden && !menu.contains(e.target)) closeMenu();
    });
    renderList();
  }

  // --- BUSCADOR DE LA PÁGINA ÍNDICE /municipios ---
  function buildIndexSearch() {
    var input = document.getElementById("muni-index-search");
    var grid = document.getElementById("muni-index-grid");
    if (!input || !grid) return;
    var cards = Array.prototype.slice.call(grid.querySelectorAll("[data-name]"));
    var empty = document.getElementById("muni-index-empty");
    input.addEventListener("input", function () {
      var q = norm(input.value.trim());
      var visible = 0;
      cards.forEach(function (card) {
        var match = !q || norm(card.getAttribute("data-name")).indexOf(q) !== -1;
        card.style.display = match ? "" : "none";
        if (match) visible++;
      });
      if (empty) empty.style.display = visible === 0 ? "block" : "none";
    });

    // Enfocar el buscador al entrar (sin desplazar la página).
    try {
      input.focus({ preventScroll: true });
    } catch (e) {
      input.focus();
    }
  }

  // --- SALIDA RÁPIDA (OCULTAR) ---
  function wireQuickExit() {
    var btn = document.getElementById("hide-site-btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      // Reemplaza la entrada del historial y abre un sitio neutral
      try { window.location.replace("https://www.google.com/"); }
      catch (e) { window.location.href = "https://www.google.com/"; }
    });
    // Tecla Escape también oculta rápidamente
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        var panel = document.getElementById("muni-menu-panel");
        if (panel && !panel.hidden) return; // Escape cierra el menú primero
        var qrModal = document.getElementById("qr-call-modal");
        if (qrModal && !qrModal.classList.contains("is-hidden")) {
          e.preventDefault();
          closeCallQRModal();
        }
      }
    });
  }

  // --- SISTEMA DE QR PARA LLAMADAS EN ESCRITORIO ---
  function ensureCallQRModal() {
    var modal = document.getElementById("qr-call-modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "qr-call-modal";
    modal.className = "modal-overlay is-hidden";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "qr-modal-title");
    modal.innerHTML = 
      '<div class="modal-card modal-card--qr">' +
        '<button id="close-qr-modal-btn" class="modal-close-btn" aria-label="Cerrar modal">✕</button>' +
        '<div class="modal-body text-center" style="text-align: center; display: flex; flex-direction: column; align-items: center;">' +
          '<div class="modal-header" style="margin-bottom: 1rem; width: 100%;">' +
            '<span class="modal-badge" style="background: var(--peach); color: var(--text-dark); margin: 0 auto 0.5rem auto; display: inline-block; font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.12rem 0.42rem; border-radius: 99px;">Llamar desde tu celular</span>' +
            '<h3 id="qr-modal-title" class="modal-title" style="font-size: 1.5rem; font-weight: 800; color: var(--text-dark); margin: 0;">Escanear para llamar</h3>' +
          '</div>' +
          '<p class="modal-desc" style="font-size: 0.9rem; margin-bottom: 1.5rem; color: var(--text-dark); opacity: 0.85; max-width: 380px; margin-left: auto; margin-right: auto; line-height: 1.5;">' +
            '<span id="qr-modal-desc-text">Abre la cámara de tu celular o tu lector de códigos QR para escanear la imagen y marcar directamente al número:</span>' +
            '<strong id="qr-phone-number" style="display: block; font-size: 1.35rem; margin-top: 0.6rem; color: var(--wine);"></strong>' +
          '</p>' +
          '<div id="qr-code-container" style="background: white; padding: 1.25rem; border-radius: 20px; display: inline-flex; justify-content: center; align-items: center; box-shadow: 0 10px 30px rgba(0,0,0,0.08); margin-bottom: 1.5rem;">' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);

    var closeBtn = modal.querySelector("#close-qr-modal-btn");
    if (closeBtn) closeBtn.addEventListener("click", closeCallQRModal);
    modal.addEventListener("click", function (e) {
      if (e.target.id === "qr-call-modal") {
        closeCallQRModal();
      }
    });

    return modal;
  }

  function openCallQRModal(phoneNumber, formattedNumber) {
    var modal = ensureCallQRModal();
    var phoneEl = document.getElementById("qr-phone-number");
    var qrContainer = document.getElementById("qr-code-container");
    var titleEl = document.getElementById("qr-modal-title");
    var descTextEl = document.getElementById("qr-modal-desc-text");
    var closeBtn = document.getElementById("close-qr-modal-btn");

    if (!phoneEl || !qrContainer) return;

    phoneEl.textContent = formattedNumber || phoneNumber;
    qrContainer.innerHTML = "";

    // Si es un número corto (longitud <= 4, ej. 911, 070, 089)
    if (phoneNumber.length <= 4) {
      if (titleEl) titleEl.textContent = "Marcación directa";
      if (descTextEl) descTextEl.textContent = "Este es un número corto de marcación rápida. Abre la aplicación de teléfono en tu celular y marca directamente:";
      qrContainer.style.display = "none";
    } else {
      if (titleEl) titleEl.textContent = "Escanear para llamar";
      if (descTextEl) descTextEl.textContent = "Abre la cámara de tu celular o tu lector de códigos QR para escanear la imagen y marcar directamente al número:";
      qrContainer.style.display = "inline-flex";

      var generateQR = function () {
        var canvas = document.createElement("canvas");
        qrContainer.appendChild(canvas);
        new QRious({
          element: canvas,
          value: "tel:" + phoneNumber,
          size: 200,
          level: "H",
          foreground: "#301034",
          background: "#ffffff"
        });
      };

      if (typeof QRious === "undefined") {
        var script = document.createElement("script");
        script.src = "/libs/qrious.min.js";
        script.onload = generateQR;
        document.head.appendChild(script);
      } else {
        generateQR();
      }
    }

    modal.classList.remove("is-hidden");
    document.body.classList.add("no-scroll");
    if (closeBtn) closeBtn.focus({ preventScroll: true });
    window.previouslyFocusedElement = document.activeElement;
  }

  function closeCallQRModal() {
    var modal = document.getElementById("qr-call-modal");
    if (modal) {
      modal.classList.add("is-hidden");
      document.body.classList.remove("no-scroll");
      if (window.previouslyFocusedElement) {
        window.previouslyFocusedElement.focus({ preventScroll: true });
      }
    }
  }

  // Escuchador global de clics para enlaces de teléfono
  function wirePhoneLinks() {
    document.addEventListener("click", function (e) {
      var telLink = e.target.closest("a");
      if (!telLink) return;

      var href = telLink.getAttribute("href") || "";
      if (href.indexOf("tel:") === 0 || telLink.href.indexOf("tel:") === 0) {
        var isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (window.innerWidth < 768);
        if (!isMobile) {
          e.preventDefault();
          var phoneNumber = href.replace("tel:", "").split("?")[0].trim();
          var formattedNumber = telLink.textContent.replace("📞 Llamar:", "").replace("📞", "").trim();
          openCallQRModal(phoneNumber, formattedNumber);
        }
      }
    });
  }

  // --- GEOLOCALIZACIÓN Y REVERSE GEOCODING CON IP FALLBACK ---
  // Recuerda la ubicación detectada durante la sesión (hasta cerrar el navegador).
  var GEO_CACHE_KEY = "refleja_geo_muni";

  function readCachedGeo() {
    try {
      var raw = window.sessionStorage.getItem(GEO_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveCachedGeo(muni, state) {
    try {
      window.sessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify({ muni: muni, state: state }));
    } catch (e) {
      // Almacenamiento no disponible (modo privado/bloqueado): se ignora sin romper.
    }
  }

  // Destaca y mueve al inicio la tarjeta del municipio del usuario.
  // Devuelve true si hubo coincidencia dentro de Nuevo León.
  function highlightMunicipality(muniName, stateName) {
    var grid = document.getElementById("muni-index-grid");
    if (!grid || !muniName) return false;

    var normState = norm(stateName || "");
    var isNL = (normState.indexOf("nuevo leon") !== -1) ||
               (normState === "nl") ||
               (normState === "n.l.") ||
               (normState === "n. l.") ||
               (normState === "nuevo-leon") ||
               (normState === "nle");

    if (!isNL) {
      console.log("Ubicación fuera de Nuevo León:", muniName, stateName);
      return false;
    }

    var normMuni = norm(muniName);
    var cards = Array.prototype.slice.call(grid.querySelectorAll(".muni-index-card"));
    var matchedCard = null;

    for (var i = 0; i < cards.length; i++) {
      var cardName = norm(cards[i].getAttribute("data-name") || "");
      if (cardName === normMuni ||
          (normMuni.indexOf(cardName) !== -1) ||
          (cardName.indexOf(normMuni) !== -1)) {
        matchedCard = cards[i];
        break;
      }
    }

    if (!matchedCard) return false;

    // Destacar la tarjeta
    matchedCard.classList.add("muni-index-card--highlighted");

    // Crear e insertar la etiqueta si no existe ya
    if (!matchedCard.querySelector(".muni-index-card__location-badge")) {
      var badge = document.createElement("span");
      badge.className = "muni-index-card__location-badge";
      badge.innerHTML = "📍 Tu ubicación";

      var tag = matchedCard.querySelector(".muni-menu__item-tag");
      if (tag) {
        matchedCard.insertBefore(badge, tag);
      } else {
        matchedCard.appendChild(badge);
      }
    }

    // Que la tarjeta destacada anime primero, acorde a su nueva posición al inicio.
    matchedCard.style.setProperty("--i", "0");
    grid.insertBefore(matchedCard, grid.firstChild);

    // Guardar en la sesión para no volver a consultar la API en próximas entradas.
    saveCachedGeo(muniName, stateName);
    console.log("Municipio detectado y destacado: " + muniName);
    return true;
  }

  function tryGeolocation() {
    var grid = document.getElementById("muni-index-grid");
    if (!grid) return; // Solo ejecutar en la página índice de municipios

    // Si ya se conoce la ubicación (caché de sesión), reutilizarla y NO volver a
    // consultar ninguna API de localización: evita el parpadeo por reordenamiento.
    if (window.__reflejaGeoApplied) return;
    var cached = readCachedGeo();
    if (cached && cached.muni) {
      window.__reflejaGeoApplied = true;
      highlightMunicipality(cached.muni, cached.state);
      return;
    }

    // Fallback de geolocalización por IP
    var ipFallbackCalled = false;
    function fallbackIPGeolocation() {
      if (ipFallbackCalled) return;
      ipFallbackCalled = true;
      console.log("Iniciando geolocalización silenciosa por IP...");
      fetch("https://freeipapi.com/api/json")
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP error " + res.status);
          return res.json();
        })
        .then(function (data) {
          if (data && data.cityName && data.regionName) {
            highlightMunicipality(data.cityName, data.regionName);
          } else {
            return fetch("https://ipapi.co/json/").then(function(r) { return r.json(); });
          }
        })
        .then(function (data) {
          if (data && data.city && data.region) {
            highlightMunicipality(data.city, data.region);
          }
        })
        .catch(function (err) {
          console.warn("Todos los métodos de geolocalización de respaldo fallaron:", err);
        });
    }

    // Función principal para correr geolocalización HTML5
    var html5Success = false;
    function runHTML5Geolocation(timeoutMs) {
      if (html5Success) return;

      navigator.geolocation.getCurrentPosition(function (position) {
        html5Success = true;
        var lat = position.coords.latitude;
        var lon = position.coords.longitude;

        fetch("https://nominatim.openstreetmap.org/reverse?lat=" + lat + "&lon=" + lon + "&format=json&addressdetails=1")
          .then(function (res) { 
            if (!res.ok) throw new Error("Nominatim HTTP " + res.status);
            return res.json(); 
          })
          .then(function (data) {
            if (data && data.address) {
              var muniName = data.address.municipality || data.address.city || data.address.town || data.address.village || data.address.county || "";
              var state = data.address.state || "";
              highlightMunicipality(muniName, state);
            } else {
              fallbackIPGeolocation();
            }
          })
          .catch(function (err) {
            console.warn("Nominatim reverse geocoding falló o fue bloqueado, usando IP fallback...", err);
            fallbackIPGeolocation();
          });
      }, function (err) {
        console.warn("Geolocalización del navegador denegada o fallida, usando IP fallback...", err.message);
        fallbackIPGeolocation();
      }, {
        timeout: timeoutMs,
        maximumAge: 300000
      });
    }

    // Orquestación inteligente de permisos
    if ("geolocation" in navigator) {
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' }).then(function (status) {
          console.log("Permiso de localización actual:", status.state);
          if (status.state === 'prompt') {
            // Primera vez: damos 25 segundos para interactuar con la alerta del navegador
            runHTML5Geolocation(25000);
            
            // Escuchar cambios de permiso dinámicos
            status.onchange = function () {
              if (this.state === 'granted') {
                runHTML5Geolocation(5000);
              } else if (this.state === 'denied') {
                fallbackIPGeolocation();
              }
            };
          } else if (status.state === 'granted') {
            runHTML5Geolocation(5000);
          } else {
            fallbackIPGeolocation();
          }
        }).catch(function () {
          runHTML5Geolocation(10000);
        });
      } else {
        runHTML5Geolocation(12000);
      }
    } else {
      fallbackIPGeolocation();
    }
  }

  // Aplicar de inmediato la ubicación ya conocida (antes de DOMContentLoaded y del
  // primer render) para reordenar/destacar sin parpadeo. Este script va al final del
  // <body>, así que la grilla ya está en el DOM cuando se ejecuta.
  (function applyCachedGeoEarly() {
    if (!document.getElementById("muni-index-grid")) return;
    var cached = readCachedGeo();
    if (cached && cached.muni) {
      window.__reflejaGeoApplied = highlightMunicipality(cached.muni, cached.state);
    }
  })();

  document.addEventListener("DOMContentLoaded", function () {
    buildMuniMenu();
    buildIndexSearch();
    wireQuickExit();
    wirePhoneLinks();
    tryGeolocation();
  });
})();
