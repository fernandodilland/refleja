/* =====================================================================
 * Refleja · Analítica anónima del sitio público
 * ---------------------------------------------------------------------
 * - Token estadístico (JWT 30 días): se obtiene UNA sola vez resolviendo el
 *   Cloudflare Turnstile INVISIBLE y se guarda en localStorage. Mientras siga
 *   válido NO se vuelve a ejecutar el Turnstile (su token es de un solo uso).
 * - Los eventos se ACUMULAN en una cola persistida en localStorage y se envían
 *   en LOTE a /api/public/collect (menos peticiones, sin perder datos aunque se
 *   recargue o cierre la pestaña).
 * - Señal de vida: ping ligero a /api/public/ping cada 25 s con la pestaña
 *   visible, para que "Activos ahora" en /plataforma cuente sesiones abiertas.
 *   No consume cuotas ni pasa por la cola de eventos.
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
  var PING_INTERVAL = 25000;   // ms: señal de vida (ventana de "activos": 90 s; oculta, el navegador la espacia a ~1/min)

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
  // Cada evento lleva un id local (_cid) para depurar la cola por IDENTIDAD
  // tras un envío exitoso: dos flushes solapados (p.ej. el de cierre sobre
  // uno en vuelo) nunca descuentan eventos que aún no se enviaron.
  var queue = [];
  var cidSeq = 0;
  try { queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]") || []; } catch (e) { queue = []; }
  queue.forEach(function (e) { if (typeof e._cid === "number" && e._cid > cidSeq) cidSeq = e._cid; });
  queue.forEach(function (e) { if (typeof e._cid !== "number") e._cid = ++cidSeq; });
  function persistQueue() {
    if (queue.length > MAX_QUEUE) queue = queue.slice(queue.length - MAX_QUEUE);
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch (e) {}
  }
  function enqueue(ev) { ev._cid = ++cidSeq; queue.push(ev); persistQueue(); scheduleFlush(); }

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
  var tokenFailUntil = 0; // backoff: si Turnstile/red falla, no relanzarlo en cada reintento
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
    if (Date.now() < tokenFailUntil) return Promise.reject(new Error("token-backoff"));
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
        tokenFailUntil = 0;
        return d.token;
      })
      .catch(function (e) { inflight = null; tokenFailUntil = Date.now() + 30000; throw e; });
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
    // _cid es solo bookkeeping local: no viaja al servidor.
    var payload = events.map(function (e) {
      var c = {};
      for (var k in e) { if (k !== "_cid") c[k] = e[k]; }
      return c;
    });
    return fetch(API + "/public/collect", {
      method: "POST",
      keepalive: !!keepalive,
      headers: { "Content-Type": "application/json", "X-Refleja-Token": token },
      body: JSON.stringify({ events: payload }),
    });
  }
  function flush(sync) {
    // El flush síncrono (ocultar/cerrar pestaña) NO respeta el candado: si hay
    // uno en vuelo puede morir con la página, y es preferible arriesgar un
    // duplicado (los eventos de run son idempotentes en el servidor) a perder
    // un resultado por no reenviarlo con keepalive antes de cerrar.
    if ((flushing && !sync) || !queue.length) return Promise.resolve();
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
        if (r && r.ok) {
          var sent = {};
          batch.forEach(function (e) { sent[e._cid] = true; });
          queue = queue.filter(function (e) { return !sent[e._cid]; });
          persistQueue();
        }
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

  // ---- señal de vida ("Activos ahora" en /plataforma) -----------------
  // El backend cuenta como activo a quien dio señal en los últimos 90 s; sin
  // esto, una pestaña abierta pero sin interacción deja de contar en segundos.
  // Se envía también con la pestaña en segundo plano: una sesión abierta
  // sigue contando. No hace falta espaciarla a mano: el navegador ya
  // ralentiza los timers de pestañas ocultas (~1 disparo/min), y la ventana
  // de 90 s del backend absorbe ese ritmo.
  var PING_MIN_SPACING = 10000; // no repetir señal si la última fue hace <10 s (evita ráfagas al alternar pestañas)
  var PING_ERR_BACKOFF = 5000;  // tras un fallo de red: reintentar pronto (< intervalo, para no saltarse un tick)
  var PING_429_BACKOFF = 60000; // tras un 429: esperar, pero por DEBAJO de la ventana de 90 s (no desaparecer del conteo)
  var pingBusy = false;
  var pingBackoffUntil = 0;
  var pingLastAt = 0;
  function ping(token) {
    // Timeout duro: un fetch colgado (red móvil inestable) no debe dejar
    // pingBusy bloqueado indefinidamente y matar los siguientes ticks.
    var opts = { method: "POST", headers: { "X-Refleja-Token": token } };
    var ctl = window.AbortController ? new AbortController() : null;
    if (!ctl) return fetch(API + "/public/ping", opts);
    opts.signal = ctl.signal;
    var timer = setTimeout(function () { ctl.abort(); }, 10000);
    return fetch(API + "/public/ping", opts).then(
      function (r) { clearTimeout(timer); return r; },
      function (e) { clearTimeout(timer); throw e; }
    );
  }
  function sendPing() {
    if (pingBusy || Date.now() < pingBackoffUntil) return;
    if (Date.now() - pingLastAt < PING_MIN_SPACING) return;
    pingBusy = true;
    // ensureToken() (no forzado) devuelve el token cacheado o, si falta o está
    // por caducar, lo renueva respetando `inflight` y el backoff de Turnstile.
    // Así la señal no muere aunque el token de 30 días expire con la pestaña
    // abierta e inactiva (caso exacto que este ping busca cubrir).
    ensureToken()
      .then(ping)
      .then(function (r) {
        if (r && r.status === 401) return ensureToken(true).then(ping);
        return r;
      })
      .then(function (r) {
        pingLastAt = Date.now();
        if (r && r.status === 429) pingBackoffUntil = Date.now() + PING_429_BACKOFF;
      })
      .catch(function () { pingBackoffUntil = Date.now() + PING_ERR_BACKOFF; })
      .then(function () { pingBusy = false; });
  }
  setInterval(sendPing, PING_INTERVAL);

  // Reintento periódico y vaciado al ocultar/cerrar (sin perder datos).
  setInterval(function () { flush(false); }, FLUSH_INTERVAL);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush(true);
    else { sendPing(); flush(false); } // al volver: señal inmediata + reintento de la cola
  });
  window.addEventListener("pagehide", function () { flush(true); });
})();
