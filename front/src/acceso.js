/* Refleja · lógica de /acceso (login admin) */
(function () {
  "use strict";
  var DEV = ReflejaAuth.DEV;
  var LOGIN_SITEKEY = "0x4AAAAAADuyMXPIrcMOrFNc"; // Turnstile "managed" (visible)
  var widgetId = null;
  var tsToken = null;

  // Callback que Cloudflare invoca cuando su api.js termina de cargar.
  window.reflejaTurnstileReady = function () {
    if (DEV || !window.turnstile) return; // en local se usa dev-bypass
    try {
      widgetId = window.turnstile.render("#turnstile-box", {
        sitekey: LOGIN_SITEKEY,
        callback: function (t) { tsToken = t; },
        "error-callback": function () { tsToken = null; },
        "expired-callback": function () { tsToken = null; },
      });
    } catch (e) {}
  };

  function el(id) { return document.getElementById(id); }

  function init() {
    var form = el("login-form");
    var errorEl = el("error-msg");
    var submitBtn = el("submit-btn");

    if (DEV) {
      el("dev-note").style.display = "block";
      el("turnstile-box").style.display = "none";
    }

    // ¿Ya hay sesión válida? (cookie de refresh) -> ir directo al panel.
    ReflejaAuth.refresh()
      .then(function () { location.replace("/plataforma"); })
      .catch(function () { /* sin sesión: mostrar login */ });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      errorEl.textContent = "";
      var u = el("username").value.trim();
      var p = el("password").value;
      var token = DEV ? "dev-bypass" : tsToken;

      if (!u || !p) { errorEl.textContent = "Escribe usuario y contraseña."; return; }
      if (!token) { errorEl.textContent = "Completa la verificación de seguridad."; return; }

      submitBtn.disabled = true;
      submitBtn.textContent = "Entrando…";
      ReflejaAuth.login(u, p, token)
        .then(function (res) {
          if (res.ok) {
            location.replace("/plataforma");
          } else {
            errorEl.textContent =
              (res.data && res.data.detail) || "No se pudo iniciar sesión.";
            submitBtn.disabled = false;
            submitBtn.textContent = "Entrar";
            tsToken = null;
            if (widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
          }
        })
        .catch(function () {
          errorEl.textContent = "Error de conexión con el servidor.";
          submitBtn.disabled = false;
          submitBtn.textContent = "Entrar";
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
