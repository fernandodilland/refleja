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
        theme: "light",
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

    // Botón "ojito" para ver/ocultar la contraseña.
    var pwInput = el("password");
    var pwBtn = el("toggle-pw");
    var EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
    var EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    if (pwBtn && pwInput) {
      pwBtn.innerHTML = EYE;
      pwBtn.addEventListener("click", function () {
        var show = pwInput.type === "password";
        pwInput.type = show ? "text" : "password";
        pwBtn.innerHTML = show ? EYE_OFF : EYE;
        pwBtn.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
        pwBtn.setAttribute("title", show ? "Ocultar contraseña" : "Mostrar contraseña");
        pwInput.focus();
      });
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
