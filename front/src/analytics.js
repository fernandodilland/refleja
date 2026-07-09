/* =====================================================================
 * Refleja · Analítica anónima del sitio público
 * ---------------------------------------------------------------------
 * - Obtiene UNA sola vez un JWT estadístico (30 días) resolviendo el
 *   Cloudflare Turnstile INVISIBLE. Si ya hay un JWT válido guardado, NO
 *   se vuelve a ejecutar el Turnstile.
 * - Envía eventos de uso (sin datos personales) a /api/public/collect con
 *   el token en el header X-Refleja-Token.
 * - Si el token expira o el back responde 401, se renueva solo.
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
    } catch (e) {
      return null;
    }
  }

  function newRunUid() {
    var id =
      window.crypto && crypto.randomUUID
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
  function clearRunUid() {
    try { localStorage.removeItem(RUN_KEY); } catch (e) {}
  }

  // ---- Cloudflare Turnstile invisible --------------------------------
  var tsLoading = null;
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve();
    if (tsLoading) return tsLoading;
    tsLoading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return tsLoading;
  }

  function getCloudflareToken() {
    // En local no hay dominio válido para Turnstile: se usa el bypass de dev.
    if (DEV) return Promise.resolve("dev-bypass");
    return loadTurnstile().then(function () {
      return new Promise(function (resolve, reject) {
        var box = document.createElement("div");
        box.style.cssText = "position:fixed;left:-9999px;top:-9999px;";
        document.body.appendChild(box);
        var settled = false;
        function cleanup() {
          try { window.turnstile.remove(wid); } catch (e) {}
          try { box.remove(); } catch (e) {}
        }
        var wid = window.turnstile.render(box, {
          sitekey: INVISIBLE_SITEKEY,
          appearance: "interaction-only",
          callback: function (tok) { if (!settled) { settled = true; cleanup(); resolve(tok); } },
          "error-callback": function () { if (!settled) { settled = true; cleanup(); reject(new Error("turnstile")); } },
          "timeout-callback": function () { if (!settled) { settled = true; cleanup(); reject(new Error("timeout")); } },
        });
        setTimeout(function () {
          if (!settled) { settled = true; cleanup(); reject(new Error("cf-timeout")); }
        }, 20000);
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
    if (!force) {
      var t = storedToken();
      if (t) return Promise.resolve(t);
    }
    if (inflight) return inflight;
    inflight = getCloudflareToken()
      .then(function (cf) {
        return fetch(API + "/public/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turnstile_token: cf }),
        });
      })
      .then(function (r) {
        if (!r.ok) throw new Error("session " + r.status);
        return r.json();
      })
      .then(function (d) {
        var exp = parseJwtExp(d.token) || Date.now() / 1000 + d.expires_in_days * 86400;
        try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: d.token, exp: exp })); } catch (e) {}
        inflight = null;
        return d.token;
      })
      .catch(function (e) { inflight = null; throw e; });
    return inflight;
  }

  // ---- envío de eventos ---------------------------------------------
  function post(token, event) {
    return fetch(API + "/public/collect", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", "X-Refleja-Token": token },
      body: JSON.stringify(event),
    });
  }
  function send(event) {
    return ensureToken()
      .then(function (token) {
        return post(token, event).then(function (r) {
          if (r && r.status === 401) {
            // token expirado/inválido: renovar una vez (Turnstile de nuevo).
            return ensureToken(true).then(function (t2) { return post(t2, event); });
          }
          return r;
        });
      })
      .catch(function () { /* la analítica nunca debe romper la experiencia */ });
  }

  // ---- API pública para script.js ------------------------------------
  window.ReflejaStats = {
    pageView: function () { send({ type: "page_view", device: deviceType() }); },
    runStart: function () { send({ type: "run_start", run_uid: newRunUid() }); },
    answer: function (o) {
      send({
        type: "answer",
        run_uid: getRunUid(),
        question_id: o.questionId,
        next_id: o.nextId || null,
        step: typeof o.step === "number" ? o.step : null,
        flow_type: o.flowType || null,
        age_bucket: o.ageBucket || null,
      });
    },
    minor: function () { send({ type: "minor", run_uid: getRunUid() }); },
    municipio: function (slug) { send({ type: "municipio", run_uid: getRunUid(), municipio: slug }); },
    result: function (o) {
      send({
        type: "result",
        run_uid: getRunUid(),
        risk_level: o.riskLevel || null,
        municipio: o.municipio || null,
        scores: o.scores || null,
      });
    },
    reset: function () { clearRunUid(); },
  };

  // Vista de página en cuanto carga (dispara el Turnstile una sola vez si hace falta).
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { window.ReflejaStats.pageView(); });
  } else {
    window.ReflejaStats.pageView();
  }
})();
