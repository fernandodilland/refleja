/* =====================================================================
 * Refleja · Autenticación del panel admin (compartido por /acceso y /plataforma)
 * ---------------------------------------------------------------------
 * - access token: solo en memoria (nunca en localStorage).
 * - refresh token: cookie httpOnly (la gestiona el navegador).
 * - refresh automático antes de expirar y ante un 401.
 * ===================================================================== */
window.ReflejaAuth = (function () {
  "use strict";

  var DEV = !/(^|\.)refleja\.org$/i.test(location.hostname);
  var API = DEV
    ? "http://" + (location.hostname || "127.0.0.1") + ":20832/api"
    : "https://api.refleja.org/api";

  var accessToken = null;
  var expEpoch = 0;

  function setAccess(tok, expiresIn) {
    accessToken = tok;
    expEpoch = Date.now() + expiresIn * 1000;
  }
  function clearAccess() {
    accessToken = null;
    expEpoch = 0;
  }

  // Un solo refresh en vuelo compartido entre llamadas concurrentes. Evita que
  // dos peticiones simultáneas roten la cookie a la vez (lo que dispararía la
  // detección de reuso del servidor y cerraría la sesión).
  var _refreshing = null;
  function refresh() {
    if (_refreshing) return _refreshing;
    _refreshing = fetch(API + "/auth/refresh", { method: "POST", credentials: "include" })
      .then(function (r) {
        if (!r.ok) throw new Error("refresh " + r.status);
        return r.json();
      })
      .then(function (d) {
        setAccess(d.access_token, d.expires_in);
        return d.access_token;
      })
      .finally(function () {
        _refreshing = null;
      });
    return _refreshing;
  }

  function ensureAccess() {
    if (accessToken && Date.now() < expEpoch - 30000) {
      return Promise.resolve(accessToken);
    }
    return refresh();
  }

  function authFetch(path, opts) {
    opts = opts || {};
    return ensureAccess().then(function (tok) {
      function go(t) {
        var headers = Object.assign({}, opts.headers || {}, { Authorization: "Bearer " + t });
        return fetch(API + path, Object.assign({ credentials: "include" }, opts, { headers: headers }));
      }
      return go(tok).then(function (r) {
        if (r.status === 401) {
          return refresh().then(go);
        }
        return r;
      });
    });
  }

  function login(username, password, turnstileToken) {
    return fetch(API + "/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: username,
        password: password,
        turnstile_token: turnstileToken,
      }),
    }).then(function (r) {
      return r.json().then(function (d) {
        if (r.ok) setAccess(d.access_token, d.expires_in);
        return { ok: r.ok, status: r.status, data: d };
      });
    });
  }

  function logout() {
    return fetch(API + "/auth/logout", { method: "POST", credentials: "include" })
      .catch(function () {})
      .then(function () { clearAccess(); });
  }

  return {
    API: API,
    DEV: DEV,
    refresh: refresh,
    ensureAccess: ensureAccess,
    authFetch: authFetch,
    login: login,
    logout: logout,
    setAccess: setAccess,
  };
})();
