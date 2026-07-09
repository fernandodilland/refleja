/* =====================================================================
 * Refleja · Analítica anónima del sitio público
 * ---------------------------------------------------------------------
 * - Token estadístico (JWT 30 días): se obtiene UNA sola vez resolviendo el
 *   Cloudflare Turnstile INVISIBLE y se guarda en localStorage. Mientras siga
 *   válido NO se vuelve a ejecutar el Turnstile (su token es de un solo uso).
 * - Los eventos se ACUMULAN en una cola persistida en localStorage y se envían
 *   en LOTE a /api/public/collect (menos peticiones, sin perder datos aunque se
 *   recargue o cierre la pestaña).
 * - No se ejecuta en /acceso ni /plataforma.
 * ===================================================================== */
(function () {
  "use strict";

  var path = location.pathname;
  if (path.indexOf("/acceso") === 0 || path.indexOf("/plataforma") === 0) return;

  var DEV = !/(^|\.)refleja\.org$/i.test(location.hostname);
  var API = DEV ? "http://" + (location.hostname || "127.0.0.1") + ":20832/api" : "https://api.refleja.org/api";
  var INVISIBLE_SITEKEY = "0x4AAAAAADuyPIMxSEuEO-vs";
  var TOKEN_KEY = "refleja_stats_token";
  var RUN_KEY = "refleja_run_uid";
  var QUEUE_KEY = "refleja_stats_queue";
  var MAX_QUEUE = 200;         // pendientes máximos que se conservan
  var BATCH_SIZE = 40;         // eventos por request
  var FLUSH_DEBOUNCE = 1500;   // ms tras la última interacción
  var FLUSH_INTERVAL = 10000;  // ms: reintento periódico

  // ---- utilidades ----------------------------------------------------
  function deviceType() {
    var ua = navigator.userAgent;
    if (/iPad|Tablet/i.test(ua)) return "tablet";
    if (/Mobi|Android|iPhone|iPod/i.test(ua)) return "mobile";
    return "desktop";
  }
  function parseJwtExp(t) {
    try {
      var p = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(p)).exp || null;
    } catch (e) { return null; }
  }
  function newRunUid() {
    var id = window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : ("r-" + Date.now() + "-" + Math.random().toString(16).slice(2)).slice(0, 36);
    try { localStorage.setItem(RUN_KEY, id); } catch (e) {}
    return id;
  }
  function getRunUid() {
    var id = null;
    try { id = localStorage.getItem(RUN_KEY); } catch (e) {}
    return id || newRunUid();
  }
  function clearRunUid() { try { localStorage.removeItem(RUN_KEY); } catch (e) {} }

  // ---- cola persistente ----------------------------------------------
  var queue = [];
  try { queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]") || []; } catch (e) { queue = []; }
  function persistQueue() {
    if (queue.length > MAX_QUEUE) queue = queue.slice(queue.length - MAX_QUEUE);
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch (e) {}
  }
  function enqueue(ev) { queue.push(ev); persistQueue(); scheduleFlush(); }

  // ---- Cloudflare Turnstile invisible --------------------------------
  var tsLoading = null;
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve();
    if (tsLoading) return tsLoading;
    tsLoading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true; s.defer = true; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
    return tsLoading;
  }
  function getCloudflareToken() {
    if (DEV) return Promise.resolve("dev-bypass");
    return loadTurnstile().then(function () {
      return new Promise(function (resolve, reject) {
        var box = document.createElement("div");
        box.style.cssText = "position:fixed;left:-9999px;top:-9999px;";
        document.body.appendChild(box);
        var settled = false;
        function done(fn, arg) { if (!settled) { settled = true; try { window.turnstile.remove(wid); } catch (e) {} try { box.remove(); } catch (e) {} fn(arg); } }
        var wid = window.turnstile.render(box, {
          sitekey: INVISIBLE_SITEKEY,
          appearance: "interaction-only",
          callback: function (tok) { done(resolve, tok); },
          "error-callback": function () { done(reject, new Error("turnstile")); },
          "timeout-callback": function () { done(reject, new Error("timeout")); },
        });
        setTimeout(function () { done(reject, new Error("cf-timeout")); }, 20000);
      });
    });
  }

  // ---- token estadístico (cacheado 30 días) --------------------------
  var inflight = null;
  function storedToken() {
    try {
      var o = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null");
      if (o && o.token && o.exp * 1000 > Date.now() + 60000) return o.token;
    } catch (e) {}
    return null;
  }
  function ensureToken(force) {
    if (!force) { var t = storedToken(); if (t) return Promise.resolve(t); }
    if (inflight) return inflight;
    inflight = getCloudflareToken()
      .then(function (cf) {
        return fetch(API + "/public/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turnstile_token: cf }),
        });
      })
      .then(function (r) { if (!r.ok) throw new Error("session " + r.status); return r.json(); })
      .then(function (d) {
        var exp = parseJwtExp(d.token) || Date.now() / 1000 + d.expires_in_days * 86400;
        try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: d.token, exp: exp })); } catch (e) {}
        inflight = null;
        return d.token;
      })
      .catch(function (e) { inflight = null; throw e; });
    return inflight;
  }

  // ---- envío por lotes -----------------------------------------------
  var flushTimer = null;
  var flushing = false;
  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(function () { flushTimer = null; flush(false); }, FLUSH_DEBOUNCE);
  }
  function sendBatch(token, events, keepalive) {
    return fetch(API + "/public/collect", {
      method: "POST",
      keepalive: !!keepalive,
      headers: { "Content-Type": "application/json", "X-Refleja-Token": token },
      body: JSON.stringify({ events: events }),
    });
  }
  function flush(sync) {
    if (flushing || !queue.length) return Promise.resolve();
    flushing = true;
    var batch = queue.slice(0, BATCH_SIZE);
    return ensureToken()
      .then(function (token) {
        return sendBatch(token, batch, sync).then(function (r) {
          if (r && r.status === 401) {
            return ensureToken(true).then(function (t2) { return sendBatch(t2, batch, sync); });
          }
          return r;
        });
      })
      .then(function (r) {
        if (r && r.ok) { queue.splice(0, batch.length); persistQueue(); }
      })
      .catch(function () { /* los eventos siguen en cola; se reintenta luego */ })
      .then(function () {
        flushing = false;
        if (queue.length) scheduleFlush();
      });
  }

  // ---- API pública ----------------------------------------------------
  window.ReflejaStats = {
    pageView: function () { enqueue({ type: "page_view", device: deviceType() }); },
    runStart: function () { enqueue({ type: "run_start", run_uid: newRunUid() }); },
    answer: function (o) {
      enqueue({
        type: "answer", run_uid: getRunUid(),
        question_id: o.questionId, next_id: o.nextId || null,
        step: typeof o.step === "number" ? o.step : null,
        flow_type: o.flowType || null, age_bucket: o.ageBucket || null,
      });
    },
    minor: function () { enqueue({ type: "minor", run_uid: getRunUid() }); },
    municipio: function (slug) { enqueue({ type: "municipio", run_uid: getRunUid(), municipio: slug }); },
    result: function (o) {
      enqueue({ type: "result", run_uid: getRunUid(), risk_level: o.riskLevel || null, municipio: o.municipio || null, scores: o.scores || null });
      flush(false);
    },
    urgentClick: function () { enqueue({ type: "urgent_click" }); },
    hideClick: function () { enqueue({ type: "hide_click" }); flush(true); },
    restart: function () { enqueue({ type: "restart" }); },
    directoryMunicipio: function (slug) { enqueue({ type: "directory_municipio", municipio: slug }); },
    reset: function () { clearRunUid(); },
    flush: function () { return flush(true); },
  };

  // ---- disparadores automáticos --------------------------------------
  function onReady() {
    window.ReflejaStats.pageView();
    if (window.__REFLEJA_MUNI__) window.ReflejaStats.directoryMunicipio(window.__REFLEJA_MUNI__);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onReady);
  else onReady();

  // Clics de "Ayuda urgente / Emergencias", "Ocultar" y "Volver a empezar"
  // (delegado en captura para funcionar en todas las páginas públicas).
  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target : null;
    if (!el || !el.closest) return;
    if (el.closest("#hide-site-btn, .button-hide")) { window.ReflejaStats.hideClick(); return; }
    if (el.closest("#urgent-help-btn, .button-urgent, .footer-emergency, .muni-emergency__call")) { window.ReflejaStats.urgentClick(); return; }
    if (el.closest("#restart-test, #restart-test-inline, #restart-minor")) { window.ReflejaStats.restart(); return; }
  }, true);

  // Reintento periódico y vaciado al ocultar/cerrar (sin perder datos).
  setInterval(function () { flush(false); }, FLUSH_INTERVAL);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush(true);
  });
  window.addEventListener("pagehide", function () { flush(true); });
})();
