/* Refleja · panel /plataforma */
(function () {
  "use strict";

  var A = window.ReflejaAuth;
  var $ = function (id) { return document.getElementById(id); };
  var qLabels = {}; // question_id -> texto
  var muniNames = {}; // slug -> nombre
  var violMode = "dominant";
  var funnelFlow = "pareja";
  var lastData = {};
  var rtTimer = null;

  // ---------- utilidades ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function filterQuery(extra) {
    var p = [];
    var f = $("f-from").value, t = $("f-to").value,
      fl = $("f-flow").value, mu = $("f-muni").value;
    if (f) p.push("date_from=" + f);
    if (t) p.push("date_to=" + t);
    if (extra !== "no-flow" && fl) p.push("flow_type=" + fl);
    if (extra !== "no-muni" && mu) p.push("municipio=" + encodeURIComponent(mu));
    return p.length ? "?" + p.join("&") : "";
  }
  function getJSON(path) {
    return A.authFetch(path).then(function (r) {
      if (r.status === 401) { location.replace("/acceso"); throw new Error("401"); }
      return r.json();
    });
  }
  function pct(n) { return Math.round((n || 0) * 1000) / 10 + "%"; }

  // ---------- barras ----------
  function simpleBars(container, items, opts) {
    opts = opts || {};
    var el = $(container);
    if (!items.length) { el.innerHTML = '<p class="empty">Sin datos todavía.</p>'; return; }
    var max = Math.max.apply(null, items.map(function (i) { return i.value; })) || 1;
    el.innerHTML = items.map(function (i) {
      var w = Math.max((i.value / max) * 100, i.value > 0 ? 2 : 0);
      return (
        '<div class="bar-row" title="' + esc(i.title || i.name) + '">' +
        '<span class="name">' + esc(i.name) + "</span>" +
        '<span class="bar-track"><span class="bar-fill' + (opts.drop ? " drop" : "") + '" style="width:' + w + '%"></span></span>' +
        '<span class="num">' + i.value + "</span></div>"
      );
    }).join("");
  }

  function funnelBars(container, steps) {
    var el = $(container);
    var withData = steps.filter(function (s) { return s.reached > 0; });
    if (!withData.length) { el.innerHTML = '<p class="empty">Aún nadie ha recorrido este flujo.</p>'; return; }
    var max = Math.max.apply(null, steps.map(function (s) { return s.reached; })) || 1;
    el.innerHTML = steps.map(function (s) {
      var totalW = Math.max((s.reached / max) * 100, s.reached > 0 ? 2 : 0);
      var ansW = s.reached ? (s.answered / s.reached) * 100 : 0;
      var dropW = 100 - ansW;
      var inner =
        '<span class="bar-fill" style="width:' + ansW + '%"></span>' +
        (s.drop > 0 ? '<span class="bar-fill drop" style="width:' + dropW + '%"></span>' : "");
      var dropTxt = s.drop > 0 ? ' · <span style="color:var(--high)">-' + s.drop + "</span>" : "";
      return (
        '<div class="bar-row" title="' + esc(s.title) + '">' +
        '<span class="name">' + esc(s.label) + "</span>" +
        '<span class="bar-track" style="width:' + totalW + '%;display:flex">' + inner + "</span>" +
        '<span class="num">' + s.reached + dropTxt + "</span></div>"
      );
    }).join("");
  }

  // ---------- gráfica de líneas SVG ----------
  function lineChart(container, items) {
    var el = $(container);
    if (!items.length) { el.innerHTML = '<p class="empty">Sin actividad registrada.</p>'; return; }
    var W = 760, H = 240, padL = 34, padR = 12, padT = 12, padB = 26;
    var series = [
      { key: "page_views", color: "#b98bd0" },
      { key: "form_starts", color: "#e5567a" },
      { key: "form_completes", color: "#2e9e6b" },
    ];
    var maxY = 1;
    items.forEach(function (d) {
      series.forEach(function (s) { maxY = Math.max(maxY, d[s.key] || 0); });
    });
    var n = items.length;
    function x(i) { return padL + (n === 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (n - 1)); }
    function y(v) { return padT + (1 - v / maxY) * (H - padT - padB); }

    var grid = "";
    for (var g = 0; g <= 4; g++) {
      var gy = padT + (g / 4) * (H - padT - padB);
      var val = Math.round(maxY * (1 - g / 4));
      grid +=
        '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy +
        '" stroke="#efe9f1" stroke-width="1"/>' +
        '<text x="4" y="' + (gy + 4) + '" font-size="10" fill="#9a8a9e">' + val + "</text>";
    }

    var paths = series.map(function (s) {
      var pts = items.map(function (d, i) { return x(i) + "," + y(d[s.key] || 0); });
      if (n === 1) {
        return '<circle cx="' + x(0) + '" cy="' + y(items[0][s.key] || 0) + '" r="4" fill="' + s.color + '"/>';
      }
      return '<polyline fill="none" stroke="' + s.color + '" stroke-width="2.5" stroke-linejoin="round" points="' + pts.join(" ") + '"/>';
    }).join("");

    var labels = "";
    var everyN = Math.ceil(n / 8);
    items.forEach(function (d, i) {
      if (i % everyN === 0 || i === n - 1) {
        labels += '<text x="' + x(i) + '" y="' + (H - 8) + '" font-size="10" fill="#9a8a9e" text-anchor="middle">' + esc(d.date.slice(5)) + "</text>";
      }
    });

    el.innerHTML =
      '<svg class="line" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet">' +
      grid + paths + labels + "</svg>";
  }

  // ---------- KPIs ----------
  function renderKpis(o) {
    var cards = [
      { label: "Visitantes", value: o.total_visitors, sub: pct(o.start_rate) + " empieza el test" },
      { label: "Activos ahora", value: o.active_now, live: true, sub: "últimos 60 s" },
      { label: "Empezaron", value: o.started, sub: o.total_runs + " intentos" },
      { label: "Completaron", value: o.completed, sub: pct(o.completion_rate) + " de compleción" },
      { label: "Entraron sin empezar", value: o.entered_not_started, sub: "no inician el test" },
      { label: "Menores de edad", value: o.minors, sub: "derivados a apoyo" },
    ];
    $("kpis").innerHTML = cards.map(function (c) {
      return (
        '<div class="kpi"><div class="label">' + c.label + "</div>" +
        '<div class="value' + (c.live ? " live" : "") + '">' + c.value + "</div>" +
        '<div class="sub">' + c.sub + "</div></div>"
      );
    }).join("");
  }

  // ---------- Violencia ----------
  var VIOL_LABELS = {
    psicologica: "Psicológica", fisica: "Física", economica: "Económica",
    patrimonial: "Patrimonial", sexual: "Sexual", intimidacion: "Intimidación",
  };
  function renderViolence(v) {
    var map = v[violMode] || {};
    var items = Object.keys(VIOL_LABELS).map(function (k) {
      return { name: VIOL_LABELS[k], value: map[k] || 0 };
    }).sort(function (a, b) { return b.value - a.value; });
    simpleBars("viol-bars", items);
  }

  // ---------- Embudo ----------
  function renderFunnel(f) {
    var steps = (f.flows[funnelFlow] || []).map(function (s) {
      return {
        label: qLabels[s.question_id] || s.question_id,
        title: qLabels[s.question_id] || s.question_id,
        reached: s.reached, answered: s.answered, drop: s.drop,
      };
    });
    // Incluir intro (age/start) al inicio.
    var intro = (f.intro || []).map(function (s) {
      return {
        label: qLabels[s.question_id] || s.question_id,
        title: qLabels[s.question_id] || s.question_id,
        reached: s.reached, answered: s.answered, drop: s.drop,
      };
    });
    funnelBars("funnel-bars", intro.concat(steps));
  }

  // ---------- Municipios / preguntas frecuentes ----------
  function renderMunicipios(m) {
    var items = m.items.map(function (i) {
      return { name: muniNames[i.municipio] || i.municipio, value: i.count, title: i.municipio };
    });
    simpleBars("muni-bars", items);
  }
  function renderTopQuestions(f) {
    var items = (f.top_reached || []).slice(0, 10).map(function (s) {
      return { name: qLabels[s.question_id] || s.question_id, value: s.reached, title: s.question_id };
    });
    simpleBars("topq-bars", items);
  }

  // ---------- Tiempo real ----------
  function renderRealtime(rt, o) {
    $("live-count").textContent = rt.active_visitors;
    if (o) $("live-count").textContent = o.active_now;
    var dev = rt.by_device || {}, ctry = rt.by_country || {};
    var devStr = Object.keys(dev).map(function (k) { return (k || "?") + ": " + dev[k]; }).join(" · ") || "—";
    var ctryStr = Object.keys(ctry).filter(function (k) { return k && k !== "null"; })
      .map(function (k) { return k + ": " + ctry[k]; }).join(" · ") || "—";
    $("rt-summary").innerHTML =
      "<span>📱 " + esc(devStr) + "</span><span>🌎 " + esc(ctryStr) + "</span>";

    var rows = (rt.recent_runs || []).map(function (r) {
      var flowChip = r.flow_type
        ? '<span class="chip ' + r.flow_type + '">' + { pareja: "Pareja", fam: "Familiar", trab: "Trabajo" }[r.flow_type] + "</span>"
        : (r.age_bucket === "minor" ? '<span class="chip">Menor</span>' : '<span class="chip">—</span>');
      var q = qLabels[r.last_question_id] || r.last_question_id || "inicio";
      var state = r.completed
        ? '<span class="chip ' + (r.risk_level || "low") + '">' + (r.risk_level || "fin") + "</span>"
        : "";
      return (
        '<div class="recent-item">' + flowChip +
        '<span class="grow">' + esc(q) + "</span>" + state +
        '<span class="ago">' + r.seconds_ago + "s</span></div>"
      );
    });
    $("rt-recent").innerHTML = rows.length ? rows.join("") : '<p class="empty">Sin actividad reciente.</p>';
  }

  function stamp() {
    var d = new Date();
    $("updated").textContent = "actualizado " +
      String(d.getHours()).padStart(2, "0") + ":" +
      String(d.getMinutes()).padStart(2, "0") + ":" +
      String(d.getSeconds()).padStart(2, "0");
  }

  // ---------- carga ----------
  function loadAll() {
    return Promise.all([
      getJSON("/platform/overview" + filterQuery()),
      getJSON("/platform/funnel"),
      getJSON("/platform/violence" + filterQuery()),
      getJSON("/platform/municipios" + filterQuery("no-muni")),
      getJSON("/platform/timeseries" + filterQuery()),
    ]).then(function (res) {
      lastData.overview = res[0];
      renderKpis(res[0]);
      renderFunnel(res[1]); lastData.funnel = res[1];
      renderTopQuestions(res[1]);
      renderViolence(res[2]); lastData.viol = res[2];
      renderMunicipios(res[3]);
      lineChart("ts-chart", res[4].items);
      stamp();
    });
  }

  function loadRealtime() {
    return Promise.all([
      getJSON("/platform/realtime"),
      getJSON("/platform/overview" + filterQuery()),
    ]).then(function (res) {
      renderRealtime(res[0], res[1]);
      renderKpis(res[1]);
      stamp();
    }).catch(function () {});
  }

  // ---------- init ----------
  function wireControls() {
    $("f-apply").addEventListener("click", loadAll);
    $("f-reset").addEventListener("click", function () {
      $("f-from").value = ""; $("f-to").value = "";
      $("f-flow").value = ""; $("f-muni").value = "";
      loadAll();
    });
    $("logout-btn").addEventListener("click", function () {
      A.logout().then(function () { location.replace("/acceso"); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("#viol-tabs .tab"), function (t) {
      t.addEventListener("click", function () {
        document.querySelectorAll("#viol-tabs .tab").forEach(function (x) { x.classList.remove("active"); });
        t.classList.add("active");
        violMode = t.dataset.mode;
        if (lastData.viol) renderViolence(lastData.viol);
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("#funnel-tabs .tab"), function (t) {
      t.addEventListener("click", function () {
        document.querySelectorAll("#funnel-tabs .tab").forEach(function (x) { x.classList.remove("active"); });
        t.classList.add("active");
        funnelFlow = t.dataset.flow;
        if (lastData.funnel) renderFunnel(lastData.funnel);
      });
    });
  }

  function loadStatic() {
    return Promise.all([
      fetch("/formulario.json").then(function (r) { return r.json(); }).catch(function () { return {}; }),
      fetch("/municipios.json").then(function (r) { return r.json(); }).catch(function () { return {}; }),
    ]).then(function (res) {
      var form = res[0] || {};
      if (form.questions) {
        Object.keys(form.questions).forEach(function (id) {
          var t = form.questions[id].text || id;
          qLabels[id] = t.length > 46 ? t.slice(0, 44) + "…" : t;
        });
      }
      qLabels["age"] = qLabels["age"] || "Edad";
      qLabels["start"] = qLabels["start"] || "Relación";
      var mr = (res[1] || {}).municipioResources || {};
      var sel = $("f-muni");
      Object.keys(mr).map(function (slug) { return { slug: slug, name: mr[slug].name }; })
        .sort(function (a, b) { return a.name.localeCompare(b.name, "es"); })
        .forEach(function (m) {
          muniNames[m.slug] = m.name;
          var o = document.createElement("option");
          o.value = m.slug; o.textContent = m.name;
          sel.appendChild(o);
        });
    });
  }

  function start() {
    // Guard de sesión: refresh (cookie). Si falla, a /acceso.
    A.refresh()
      .then(function () {
        $("loading-view").hidden = true;
        $("app").hidden = false;
        wireControls();
        return loadStatic().then(loadAll).then(function () {
          rtTimer = setInterval(loadRealtime, 5000);
        });
      })
      .catch(function () { location.replace("/acceso"); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
