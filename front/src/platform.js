/* Refleja · panel /plataforma */
(function () {
  "use strict";

  var A = window.ReflejaAuth;
  var $ = function (id) { return document.getElementById(id); };
  var qLabels = {};   // qid -> texto corto (barras)
  var qFull = {};     // qid -> texto completo (tooltips/modales)
  var violInfo = {};  // tipo -> {name, desc, examples} de formulario.json
  var muniNames = {}; // slug -> nombre
  var violMode = "dominant";
  var funnelFlow = "pareja";
  var lastData = {};
  var htmlCache = {}; // container -> último html (para no re-renderizar sin cambios)
  var REG = {};       // container -> [{tip, title, body}] para tooltips/modales
  var REFRESH_MS = 2000;
  var DRAG_CARDS = []; // modales arrastrables (para re-encajar al cambiar tamaño)

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
    return A.authFetch(path, { cache: "no-store" }).then(function (r) {
      if (r.status === 401) { location.replace("/acceso"); throw new Error("401"); }
      return r.json();
    });
  }
  function pct(n) { return Math.round((n || 0) * 1000) / 10 + "%"; }
  function setHTML(id, html) {
    if (htmlCache[id] === html) return false; // sin cambios: no tocar el DOM (sin parpadeo)
    htmlCache[id] = html;
    $(id).innerHTML = html;
    return true;
  }

  // Las preguntas usan {persona}/{mipersona}; en el panel se muestran en neutro
  // según el flujo de la pregunta.
  function neutralize(text, qid) {
    var who = /^pareja/.test(qid || "") ? "tu pareja"
      : /^fam/.test(qid || "") ? "tu familiar" : "esta persona";
    var cap = who.charAt(0).toUpperCase() + who.slice(1);
    return String(text || "")
      .replace(/\{Persona\}/g, cap).replace(/\{persona\}/g, who)
      .replace(/\{Mipersona\}/g, cap).replace(/\{mipersona\}/g, who);
  }

  // ---------- tooltip flotante ----------
  var tipEl = null;
  function tip() {
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.id = "tip";
      tipEl.hidden = true;
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }
  function showTip(html, x, y) {
    var t = tip();
    t.innerHTML = html;
    t.hidden = false;
    moveTip(x, y);
  }
  function moveTip(x, y) {
    var t = tip();
    if (t.hidden) return;
    var r = t.getBoundingClientRect();
    var nx = x + 14, ny = y + 16;
    if (nx + r.width > innerWidth - 10) nx = Math.max(8, x - r.width - 14);
    if (ny + r.height > innerHeight - 10) ny = Math.max(8, y - r.height - 16);
    t.style.left = nx + "px";
    t.style.top = ny + "px";
  }
  function hideTip() { if (tipEl) tipEl.hidden = true; }

  function regOf(el) {
    var key = el.getAttribute("data-reg");
    if (!key) return null;
    var i = key.lastIndexOf(":");
    var list = REG[key.slice(0, i)];
    return (list && list[+key.slice(i + 1)]) || null;
  }

  // ---------- modales arrastrables ----------
  // Cada modal se puede mover arrastrando su encabezado. La posición se limita
  // a los bordes visibles y se re-encaja al cambiar el tamaño de la ventana.
  var DRAG_MARGIN = 8;
  function cardOffset(card) {
    var m = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px/.exec(card.style.transform || "");
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
  }
  function setCardOffset(card, x, y) {
    card.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
  }
  function clampCard(card) {
    var off = cardOffset(card);
    var r = card.getBoundingClientRect();
    var baseLeft = r.left - off.x, baseTop = r.top - off.y; // posición sin desplazamiento
    var minX = DRAG_MARGIN - baseLeft;
    var maxX = window.innerWidth - DRAG_MARGIN - r.width - baseLeft;
    var minY = DRAG_MARGIN - baseTop;
    var maxY = window.innerHeight - DRAG_MARGIN - r.height - baseTop;
    if (maxX < minX) maxX = minX; // más ancho que la pantalla: pegado al borde
    if (maxY < minY) maxY = minY;
    setCardOffset(card, Math.min(Math.max(off.x, minX), maxX),
                        Math.min(Math.max(off.y, minY), maxY));
  }
  function centerCard(card) { if (card) card.style.transform = ""; } // vuelve a centrar (CSS)
  function makeDraggable(modalId) {
    var overlay = $(modalId);
    if (!overlay) return;
    var card = overlay.querySelector(".modal-card");
    var head = overlay.querySelector(".modal-head");
    if (!card || !head) return;
    head.classList.add("draggable-head");
    DRAG_CARDS.push({ overlay: overlay, card: card });
    var on = false, sx = 0, sy = 0, ox = 0, oy = 0, pid = null;
    head.addEventListener("pointerdown", function (e) {
      if (e.target.closest && e.target.closest(".modal-close")) return; // cerrar no arrastra
      if (e.button != null && e.button !== 0) return; // solo botón principal
      on = true; pid = e.pointerId; sx = e.clientX; sy = e.clientY;
      var off = cardOffset(card); ox = off.x; oy = off.y;
      card.classList.add("dragging");
      try { head.setPointerCapture(pid); } catch (_) {}
      e.preventDefault();
    });
    head.addEventListener("pointermove", function (e) {
      if (!on) return;
      setCardOffset(card, ox + (e.clientX - sx), oy + (e.clientY - sy));
      clampCard(card);
    });
    function end() {
      if (!on) return;
      on = false; card.classList.remove("dragging");
      try { if (pid != null) head.releasePointerCapture(pid); } catch (_) {}
      pid = null;
    }
    head.addEventListener("pointerup", end);
    head.addEventListener("pointercancel", end);
  }
  function reclampOpenModals() {
    DRAG_CARDS.forEach(function (d) { if (!d.overlay.hidden) clampCard(d.card); });
  }

  // ---------- modal de detalle ----------
  function openDetail(title, bodyHtml) {
    $("detail-title").textContent = title;
    $("detail-body").innerHTML = bodyHtml;
    centerCard($("detail-modal").querySelector(".modal-card"));
    $("detail-modal").hidden = false;
  }
  function closeDetail() { $("detail-modal").hidden = true; }
  function statGrid(pairs) {
    return '<div class="dgrid">' + pairs.map(function (p) {
      return '<div class="dstat"><span class="dl">' + esc(p[0]) + '</span><span class="dv">' + p[1] + "</span></div>";
    }).join("") + "</div>";
  }

  // ---------- barras ----------
  // items: {name, value, tip, title, body, drop?}
  function simpleBars(container, items, opts) {
    opts = opts || {};
    REG[container] = items;
    if (!items.length) { setHTML(container, '<p class="empty">Sin datos todavía.</p>'); return; }
    var max = Math.max.apply(null, items.map(function (i) { return i.value; })) || 1;
    setHTML(container, items.map(function (i, idx) {
      var w = Math.max((i.value / max) * 100, i.value > 0 ? 2 : 0);
      return (
        '<div class="bar-row' + (i.body ? " click" : "") + '" data-reg="' + container + ":" + idx + '">' +
        '<span class="name">' + esc(i.name) + "</span>" +
        '<span class="bar-track"><span class="bar-fill' + (opts.drop ? " drop" : "") + '" style="width:' + w + '%"></span></span>' +
        '<span class="num">' + i.value + "</span></div>"
      );
    }).join(""));
  }

  // steps: {label, reached, answered, drop, tip, title, body, done?}
  function funnelBars(container, steps) {
    REG[container] = steps;
    var withData = steps.filter(function (s) { return s.reached > 0; });
    if (!withData.length) { setHTML(container, '<p class="empty">Aún nadie ha recorrido este flujo.</p>'); return; }
    var max = Math.max.apply(null, steps.map(function (s) { return s.reached; })) || 1;
    setHTML(container, steps.map(function (s, idx) {
      var totalW = Math.max((s.reached / max) * 100, s.reached > 0 ? 2 : 0);
      var ansW = s.reached ? (s.answered / s.reached) * 100 : 0;
      var dropW = 100 - ansW;
      var inner =
        '<span class="bar-fill' + (s.done ? " done" : "") + '" style="width:' + ansW + '%"></span>' +
        (s.drop > 0 ? '<span class="bar-fill drop" style="width:' + dropW + '%"></span>' : "");
      var dropTxt = s.drop > 0 ? ' · <span style="color:var(--high)">-' + s.drop + "</span>" : "";
      return (
        '<div class="bar-row click" data-reg="' + container + ":" + idx + '">' +
        '<span class="name">' + esc(s.label) + "</span>" +
        '<span class="bar-track" style="width:' + totalW + '%;display:flex">' + inner + "</span>" +
        '<span class="num">' + s.reached + dropTxt + "</span></div>"
      );
    }).join(""));
  }

  // ---------- gráfica de líneas SVG interactiva ----------
  var TS = { items: [], x: null, y: null, W: 760, H: 240, padL: 34, padR: 12, padT: 12, padB: 26 };
  var TS_SERIES = [
    { key: "page_views", color: "#b98bd0", label: "Vistas" },
    { key: "form_starts", color: "#e5567a", label: "Empezaron" },
    { key: "form_completes", color: "#2e9e6b", label: "Completaron" },
  ];
  function fmtDay(iso) {
    var d = new Date(iso + "T12:00:00");
    var out = d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
    return out.charAt(0).toUpperCase() + out.slice(1);
  }
  function lineChart(container, items) {
    TS.items = items;
    if (!items.length) { setHTML(container, '<p class="empty">Sin actividad registrada.</p>'); return; }
    var W = TS.W, H = TS.H, padL = TS.padL, padR = TS.padR, padT = TS.padT, padB = TS.padB;
    var maxY = 1;
    items.forEach(function (d) {
      TS_SERIES.forEach(function (s) { maxY = Math.max(maxY, d[s.key] || 0); });
    });
    var n = items.length;
    function x(i) { return padL + (n === 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (n - 1)); }
    function y(v) { return padT + (1 - v / maxY) * (H - padT - padB); }
    TS.x = x; TS.y = y;

    var grid = "", lastVal = null;
    for (var g = 0; g <= 4; g++) {
      var gy = padT + (g / 4) * (H - padT - padB);
      var val = Math.round(maxY * (1 - g / 4));
      grid += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="#efe9f1" stroke-width="1"/>';
      if (val !== lastVal) {
        grid += '<text x="4" y="' + (gy + 4) + '" font-size="10" fill="#9a8a9e">' + val + "</text>";
        lastVal = val;
      }
    }

    var paths = TS_SERIES.map(function (s) {
      if (n === 1) {
        return '<circle cx="' + x(0) + '" cy="' + y(items[0][s.key] || 0) + '" r="4" fill="' + s.color + '"/>';
      }
      var pts = items.map(function (d, i) { return x(i) + "," + y(d[s.key] || 0); });
      return '<polyline fill="none" stroke="' + s.color + '" stroke-width="2.5" stroke-linejoin="round" points="' + pts.join(" ") + '"/>';
    }).join("");

    var labels = "";
    var everyN = Math.ceil(n / 8);
    items.forEach(function (d, i) {
      if (i % everyN === 0 || i === n - 1) {
        labels += '<text x="' + x(i) + '" y="' + (H - 8) + '" font-size="10" fill="#9a8a9e" text-anchor="middle">' + esc(d.date.slice(5)) + "</text>";
      }
    });

    // Capa de interacción: guía vertical + puntos + rect transparente que captura el mouse.
    var hover =
      '<line id="ts-guide" y1="' + padT + '" y2="' + (H - padB) + '" stroke="#c9b8ce" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/>' +
      TS_SERIES.map(function (s, k) {
        return '<circle id="ts-dot-' + k + '" r="4" fill="' + s.color + '" stroke="#fff" stroke-width="1.5" visibility="hidden"/>';
      }).join("") +
      '<rect id="ts-overlay" x="' + padL + '" y="' + padT + '" width="' + (W - padL - padR) + '" height="' + (H - padT - padB) + '" fill="transparent" style="cursor:crosshair"/>';

    var changed = setHTML(container,
      '<svg class="line" id="ts-svg" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet">' +
      grid + paths + labels + hover + "</svg>");
    if (changed) wireTsHover();
  }
  function tsIndexFromEvent(e) {
    var svg = $("ts-svg");
    if (!svg || !TS.items.length) return -1;
    var r = svg.getBoundingClientRect();
    var vx = (e.clientX - r.left) * (TS.W / r.width);
    var n = TS.items.length;
    if (n === 1) return 0;
    var span = (TS.W - TS.padL - TS.padR) / (n - 1);
    var i = Math.round((vx - TS.padL) / span);
    return Math.max(0, Math.min(n - 1, i));
  }
  function tsTipHtml(d) {
    return '<b>' + esc(fmtDay(d.date)) + "</b>" + TS_SERIES.map(function (s) {
      return '<span class="t-row"><i style="background:' + s.color + '"></i>' + s.label + ": <b>" + (d[s.key] || 0) + "</b></span>";
    }).join("");
  }
  function wireTsHover() {
    var ov = $("ts-overlay");
    if (!ov) return;
    ov.addEventListener("mousemove", function (e) {
      var i = tsIndexFromEvent(e);
      if (i < 0) return;
      var d = TS.items[i];
      var gx = TS.x(i);
      var guide = $("ts-guide");
      guide.setAttribute("x1", gx); guide.setAttribute("x2", gx);
      guide.setAttribute("visibility", "visible");
      TS_SERIES.forEach(function (s, k) {
        var dot = $("ts-dot-" + k);
        dot.setAttribute("cx", gx);
        dot.setAttribute("cy", TS.y(d[s.key] || 0));
        dot.setAttribute("visibility", "visible");
      });
      showTip(tsTipHtml(d), e.clientX, e.clientY);
    });
    ov.addEventListener("mouseleave", function () {
      var guide = $("ts-guide");
      if (guide) guide.setAttribute("visibility", "hidden");
      TS_SERIES.forEach(function (_, k) {
        var dot = $("ts-dot-" + k);
        if (dot) dot.setAttribute("visibility", "hidden");
      });
      hideTip();
    });
    ov.addEventListener("click", function (e) {
      var i = tsIndexFromEvent(e);
      if (i < 0) return;
      var d = TS.items[i];
      openDetail(fmtDay(d.date), statGrid([
        ["Vistas de página", d.page_views || 0],
        ["Formularios empezados", d.form_starts || 0],
        ["Formularios completados", d.form_completes || 0],
        ["Menores de edad", d.minors || 0],
        ["Visitantes nuevos", d.new_visitors || 0],
      ]));
    });
  }

  // ---------- KPIs ----------
  function renderKpis(o) {
    var cards = [
      { label: "Visitantes", value: o.total_visitors, sub: pct(o.start_rate) + " empieza el test", info: "visitors" },
      { label: "Activos ahora", value: o.active_now, live: true, sub: "últimos 90 s", info: "active_now" },
      { label: "Empezaron", value: o.started, sub: o.total_runs + " intentos", info: "started" },
      { label: "Completaron", value: o.completed, sub: pct(o.completion_rate) + " de compleción", info: "completed" },
      { label: "Entraron sin empezar", value: o.entered_not_started, sub: "no inician el test", info: "entered_not_started" },
      { label: "Menores de edad", value: o.minors, sub: "se completa igual", info: "minors" },
      { label: "Repitieron", value: o.repeat_visitors, sub: "volvieron a empezar", info: "repeat" },
      { label: "Ayuda urgente", value: o.urgent_clicks, sub: "clics en urgente/911", info: "urgent" },
      { label: "Ocultar sitio", value: o.hide_clicks, sub: "salidas rápidas", info: "hide" },
    ];
    setHTML("kpis", cards.map(function (c) {
      return (
        '<div class="kpi"><div class="label-row"><span class="label">' + c.label + "</span>" +
        '<button class="info-i" data-info="' + c.info + '" aria-label="¿De dónde sale?">i</button></div>' +
        '<div class="value' + (c.live ? " live" : "") + '">' + c.value + "</div>" +
        '<div class="sub">' + c.sub + "</div></div>"
      );
    }).join(""));
  }

  // ---------- Violencia ----------
  var VIOL_LABELS = {
    psicologica: "Psicológica", fisica: "Física", economica: "Económica",
    patrimonial: "Patrimonial", sexual: "Sexual", intimidacion: "Intimidación",
  };
  var VIOL_MODE_LABELS = { dominant: "Predominante", present: "Presencia", totals: "Puntaje total" };
  function renderViolence(v) {
    var map = v[violMode] || {};
    var base = v.completed_runs || 0;
    var items = Object.keys(VIOL_LABELS).map(function (k) {
      var name = VIOL_LABELS[k];
      var info = violInfo[k] || {};
      var val = map[k] || 0;
      var share = base && violMode !== "totals" ? " (" + pct(val / base) + " de " + base + ")" : "";
      var body =
        (info.desc ? '<p class="dtext">' + esc(info.desc) + "</p>" : "") +
        statGrid([
          ["Predominante en", ((v.dominant || {})[k] || 0) + " formularios"],
          ["Presente en", ((v.present || {})[k] || 0) + " formularios"],
          ["Puntaje acumulado", (v.totals || {})[k] || 0],
          ["Base", base + " completados"],
        ]) +
        (info.examples && info.examples.length
          ? '<p class="dsub">Ejemplos:</p><ul class="dlist">' + info.examples.slice(0, 3).map(function (x) {
              return "<li>" + esc(x) + "</li>";
            }).join("") + "</ul>"
          : "");
      return {
        name: name, value: val,
        tip: "<b>" + esc(info.name || name) + "</b>" +
          '<span class="t-row">' + VIOL_MODE_LABELS[violMode] + ": <b>" + val + "</b>" + esc(share) + "</span>" +
          '<span class="t-more">Clic para ver detalle</span>',
        title: info.name || ("Violencia " + name.toLowerCase()),
        body: body,
      };
    }).sort(function (a, b) { return b.value - a.value; });
    simpleBars("viol-bars", items);
  }

  // ---------- Embudo ----------
  var FLOW_LABELS = { pareja: "Pareja / ex pareja", fam: "Familiar", trab: "Trabajo / escuela" };
  function qDetailBody(s, extra) {
    return '<p class="dtext">' + esc(qFull[s.question_id] || s.question_id) + "</p>" +
      statGrid([
        ["Llegaron a la pregunta", s.reached],
        ["La respondieron", s.answered],
        ["Abandonaron aquí", s.drop],
        ["Tasa de abandono", pct(s.drop_rate || (s.reached ? s.drop / s.reached : 0))],
      ].concat(extra || []));
  }
  function qTip(s) {
    return "<b>" + esc(qFull[s.question_id] || s.question_id) + "</b>" +
      '<span class="t-row">Llegaron: <b>' + s.reached + "</b> · Respondieron: <b>" + s.answered + "</b></span>" +
      '<span class="t-row">Abandono aquí: <b style="color:#ffb3bc">' + s.drop + "</b> (" + pct(s.drop_rate || (s.reached ? s.drop / s.reached : 0)) + ")</span>" +
      '<span class="t-more">Clic para ver detalle</span>';
  }
  function renderFunnel(f) {
    var flowSteps = (f.flows || {})[funnelFlow] || [];
    var start = ((f.intro || [])[0] || {}).reached || 0;
    var mk = function (s, pos, posLabel) {
      var extra = [["Posición", posLabel]];
      if (start) extra.push(["Siguen aquí desde el inicio", pct(s.reached / start)]);
      return {
        label: qLabel(s.question_id),
        reached: s.reached, answered: s.answered, drop: s.drop,
        tip: qTip(s),
        title: "Embudo · " + (FLOW_LABELS[funnelFlow] || funnelFlow),
        body: qDetailBody(s, extra),
      };
    };
    var all = (f.intro || []).map(function (s, i) { return mk(s, i, "Introducción"); })
      .concat(flowSteps.map(function (s, i) { return mk(s, i, "Pregunta " + (i + 1) + " de " + flowSteps.length); }));
    var completed = (f.completed_by_flow || {})[funnelFlow] || 0;
    all.push({
      label: "✓ Completó el formulario", done: true,
      reached: completed, answered: completed, drop: 0,
      tip: "<b>Completaron el formulario</b>" +
        '<span class="t-row">' + (FLOW_LABELS[funnelFlow] || funnelFlow) + ": <b>" + completed + "</b>" +
        (start ? " (" + pct(completed / start) + " desde el inicio)" : "") + "</span>",
      title: "Completaron · " + (FLOW_LABELS[funnelFlow] || funnelFlow),
      body: statGrid([
        ["Completaron este flujo", completed],
        ["Empezaron (eligieron edad)", start],
        ["Conversión total", start ? pct(completed / start) : "—"],
      ]),
    });
    funnelBars("funnel-bars", all);
  }

  // ---------- Municipios / preguntas frecuentes ----------
  function muniItem(i, kind) {
    var name = muniNames[i.municipio] || i.municipio;
    var m = lastData.muni || {};
    var inForm = 0, inDir = 0;
    (m.items || []).forEach(function (x) { if (x.municipio === i.municipio) inForm = x.count; });
    (m.directory || []).forEach(function (x) { if (x.municipio === i.municipio) inDir = x.count; });
    var listTotal = 0;
    ((kind === "form" ? m.items : m.directory) || []).forEach(function (x) { listTotal += x.count; });
    var share = listTotal ? " (" + pct(i.count / listTotal) + ")" : "";
    return {
      name: name, value: i.count,
      tip: "<b>" + esc(name) + "</b>" +
        '<span class="t-row">' + (kind === "form" ? "Elegido al final del formulario" : "Consultado en el directorio") +
        ": <b>" + i.count + "</b>" + esc(share) + "</span>" +
        '<span class="t-more">Clic para ver detalle</span>',
      title: name,
      body: statGrid([
        ["Elegido en el formulario", inForm],
        ["Consultas en el directorio", inDir],
        ["% en esta lista", listTotal ? pct(i.count / listTotal) : "—"],
      ]),
    };
  }
  function renderMunicipios(m) {
    lastData.muni = m;
    simpleBars("muni-bars", (m.items || []).map(function (i) { return muniItem(i, "form"); }));
    simpleBars("dir-bars", (m.directory || []).map(function (i) { return muniItem(i, "dir"); }));
  }
  function renderTopQuestions(f) {
    var items = (f.top_reached || []).slice(0, 10).map(function (s) {
      return {
        name: qLabel(s.question_id), value: s.reached,
        tip: qTip(s),
        title: "Pregunta frecuente",
        body: qDetailBody(s),
      };
    });
    simpleBars("topq-bars", items);
  }

  // ---------- helpers de etiquetas y tiempo ----------
  var SPECIAL_LABELS = {
    age: "¿Qué edad tienes?", start: "Relación",
    MINOR: "Menor de edad", LOCATION: "Municipio", RESULT: "Resultado", inicio: "Inicio",
  };
  function qLabel(id) {
    if (!id) return "Inicio";
    return qLabels[id] || SPECIAL_LABELS[id] || id;
  }
  function fmtAgo(s) {
    s = Math.max(0, Math.floor(s || 0));
    if (s < 60) return s + "s";
    if (s < 3600) return Math.floor(s / 60) + "m";
    if (s < 86400) {
      var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
      return h + "h" + (m ? " " + m + "m" : "");
    }
    var d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600);
    return d + "d" + (hh ? " " + hh + "h" : "");
  }

  // ---------- Tiempo real ----------
  var AGE_LABELS = { minor: "Menos de 18", "18-25": "18 a 25", "26-40": "26 a 40", "41+": "41 o más" };
  var RISK_LABELS = { high: "Alto", medium: "Medio", low: "Bajo" };
  function renderRealtime(rt, o) {
    $("live-count").textContent = o ? o.active_now : rt.active_visitors;
    var dev = rt.by_device || {}, ctry = rt.by_country || {};
    var devStr = Object.keys(dev).map(function (k) { return (k || "?") + ": " + dev[k]; }).join(" · ") || "—";
    var ctryStr = Object.keys(ctry).filter(function (k) { return k && k !== "null"; })
      .map(function (k) { return k + ": " + ctry[k]; }).join(" · ") || "—";
    setHTML("rt-summary", "<span>📱 " + esc(devStr) + "</span><span>🌎 " + esc(ctryStr) + "</span>");

    var runs = rt.recent_runs || [];
    REG["rt-recent"] = runs.map(function (r) {
      var flowName = FLOW_LABELS[r.flow_type] || (r.age_bucket === "minor" ? "Menor de edad" : "Sin definir");
      var qName = qFull[r.last_question_id] || qLabel(r.last_question_id);
      var state = r.completed ? "Completado" + (r.risk_level ? " · riesgo " + (RISK_LABELS[r.risk_level] || r.risk_level).toLowerCase() : "") : "En curso";
      return {
        tip: "<b>" + esc(flowName) + "</b>" +
          '<span class="t-row">Última pantalla: ' + esc(qName) + "</span>" +
          '<span class="t-row">' + esc(state) + " · hace " + fmtAgo(r.seconds_ago) + "</span>" +
          '<span class="t-more">Clic para ver detalle</span>',
        title: "Recorrido · " + flowName,
        body: '<p class="dtext">' + esc(qName) + "</p>" + statGrid([
          ["Tipo de relación", esc(flowName)],
          ["Edad", AGE_LABELS[r.age_bucket] || "—"],
          ["Paso máximo alcanzado", r.max_step || 0],
          ["Municipio", r.municipio ? esc(muniNames[r.municipio] || r.municipio) : "—"],
          ["Estado", esc(state)],
          ["Riesgo", r.risk_level ? esc(RISK_LABELS[r.risk_level] || r.risk_level) : "—"],
          ["Última actividad", "hace " + fmtAgo(r.seconds_ago)],
        ]),
      };
    });

    // El "hace Xs" cambia cada tick: se separa de la estructura para no
    // re-renderizar (ni parpadear) la lista completa cada 2 s.
    var rows = runs.map(function (r, idx) {
      var flowChip = r.flow_type
        ? '<span class="chip ' + r.flow_type + '">' + { pareja: "Pareja", fam: "Familiar", trab: "Trabajo" }[r.flow_type] + "</span>"
        : (r.age_bucket === "minor" ? '<span class="chip">Menor</span>' : '<span class="chip">—</span>');
      var q = qLabel(r.last_question_id);
      var state = r.completed
        ? '<span class="chip ' + (r.risk_level || "low") + '">' + (r.risk_level || "fin") + "</span>"
        : "";
      return (
        '<div class="recent-item click" data-reg="rt-recent:' + idx + '">' + flowChip +
        '<span class="grow">' + esc(q) + "</span>" + state +
        '<span class="ago"></span></div>'
      );
    });
    setHTML("rt-recent", rows.length ? rows.join("") : '<p class="empty">Sin actividad reciente.</p>');
    var agoEls = $("rt-recent").querySelectorAll(".ago");
    runs.forEach(function (r, idx) {
      if (agoEls[idx]) agoEls[idx].textContent = fmtAgo(r.seconds_ago);
    });
  }

  function stamp() {
    var d = new Date();
    $("updated").textContent = "actualizado " +
      String(d.getHours()).padStart(2, "0") + ":" +
      String(d.getMinutes()).padStart(2, "0") + ":" +
      String(d.getSeconds()).padStart(2, "0");
  }

  // ---------- carga y refresco automático (2 s, sin parpadeo) ----------
  var inflight = false;
  var timer = null;
  function refreshAll(force) {
    if (inflight && !force) return Promise.resolve();
    inflight = true;
    return Promise.all([
      getJSON("/platform/overview" + filterQuery()),
      getJSON("/platform/funnel"),
      getJSON("/platform/violence" + filterQuery()),
      getJSON("/platform/municipios" + filterQuery("no-muni")),
      getJSON("/platform/timeseries" + filterQuery()),
      getJSON("/platform/realtime"),
    ]).then(function (res) {
      lastData.overview = res[0];
      lastData.funnel = res[1];
      lastData.viol = res[2];
      renderKpis(res[0]);
      renderFunnel(res[1]);
      renderTopQuestions(res[1]);
      renderViolence(res[2]);
      renderMunicipios(res[3]);
      lineChart("ts-chart", res[4].items);
      renderRealtime(res[5], res[0]);
      stamp();
    }).catch(function () { /* transitorio: se reintenta en el siguiente tick */ })
      .finally(function () { inflight = false; });
  }
  function startAuto() {
    if (!timer) timer = setInterval(function () {
      if (document.visibilityState !== "hidden") refreshAll(false);
    }, REFRESH_MS);
  }
  function stopAuto() { if (timer) { clearInterval(timer); timer = null; } }

  // ---------- Historial de inicios de sesión (modal) ----------
  function fmtDate(iso) {
    return iso ? String(iso).slice(0, 16).replace("T", " ") : "—";
  }
  function openHistory() {
    centerCard($("history-modal").querySelector(".modal-card"));
    $("history-modal").hidden = false;
    $("history-body").innerHTML = '<p class="loading">Cargando…</p>';
    getJSON("/platform/logins?limit=200")
      .then(function (data) {
        var items = (data && data.items) || [];
        if (!items.length) {
          $("history-body").innerHTML = '<p class="empty">Sin inicios de sesión todavía.</p>';
          return;
        }
        var rows = items.map(function (r) {
          return "<tr>" +
            "<td class='user'>" + esc(r.username) + "</td>" +
            "<td>" + esc(r.browser || "—") + "</td>" +
            "<td>" + esc(r.os || "—") + "</td>" +
            "<td>" + esc(r.device || "—") + "</td>" +
            "<td>" + esc(r.country || "—") + "</td>" +
            "<td>" + fmtDate(r.created_at) + "</td>" +
            "</tr>";
        }).join("");
        $("history-body").innerHTML =
          "<table class='hist'><thead><tr>" +
          "<th>Usuario</th><th>Navegador</th><th>SO</th><th>Dispositivo</th><th>País</th><th>Fecha (UTC)</th>" +
          "</tr></thead><tbody>" + rows + "</tbody></table>";
      })
      .catch(function () {
        $("history-body").innerHTML = '<p class="empty">No se pudo cargar el historial.</p>';
      });
  }
  function closeHistory() { $("history-modal").hidden = true; }

  // ---------- Info de cada estadística (modal) ----------
  var INFO = {
    visitors: ["Visitantes", "Personas reales (humanas) que abrieron el sitio público y superaron el Cloudflare Turnstile invisible. Cada visitante es un identificador aleatorio anónimo (no se guarda IP ni datos personales) y se cuenta una sola vez por navegador durante la vida del token (30 días)."],
    active_now: ["Activos ahora", "Visitantes con el sitio abierto: señal de vida en los últimos 90 segundos. Cada navegador con una pestaña del sitio envía una señal ligera cada 25 s (aprox. 1 por minuto si la pestaña está en segundo plano), además de cada interacción. Varias pestañas del mismo navegador cuentan como 1 visitante."],
    started: ["Empezaron", "Intentos de formulario que iniciaron (se eligió edad y tipo de relación). Un mismo visitante puede tener varios intentos."],
    completed: ["Completaron", "Formularios completados: llegaron a la pantalla de resultado. También cuenta cuando la persona indica ser menor de 18 años (se considera completado aunque no responda preguntas). El % es sobre los que empezaron."],
    entered_not_started: ["Entraron sin empezar", "Visitantes que abrieron el sitio pero nunca iniciaron el formulario (solo navegaron)."],
    minors: ["Menores de edad", "Personas que indicaron tener menos de 18 años. Se les deriva a apoyo y su intento se cuenta como completado."],
    repeat: ["Repitieron", "Visitantes que hicieron el formulario más de una vez (usaron 'volver a empezar' o lo repitieron en otra visita)."],
    urgent: ["Ayuda urgente", "Clics en los botones de 'Ayuda urgente' y de emergencia (911) del sitio público (inicio y páginas de municipio)."],
    hide: ["Ocultar sitio", "Clics en el botón 'Ocultar' que sale rápidamente a un sitio neutral (salida de seguridad)."],
    realtime: ["En tiempo real", "Visitantes activos en los últimos 90 s y los últimos recorridos del formulario (tipo de relación, hasta qué pregunta llegaron y hace cuánto). Pasa el mouse sobre una fila para ver el resumen y haz clic para el detalle completo."],
    violence: ["Tipos de violencia", "Se calcula solo sobre formularios completados con respuestas. 'Puntaje total' suma los puntos por tipo según las respuestas; 'Presencia' cuenta en cuántos formularios aparece cada tipo; 'Predominante' cuenta en cuántos es el tipo con mayor puntaje. Los menores de edad completan sin puntajes, así que no afectan esta gráfica. Haz clic en una barra para ver la definición y ejemplos del tipo."],
    funnel: ["Embudo", "Cada barra muestra cuántas personas llegaron a esa pregunta. En rojo, quienes la vieron pero no continuaron (abandono). La última barra verde es cuántas completaron el formulario en ese flujo. Pasa el mouse para ver cifras y haz clic en una barra para el detalle."],
    muni_form: ["Municipios (formulario)", "Municipio que la persona elige al final del formulario para ver recursos de apoyo. Se normaliza para no duplicar por mayúsculas/acentos."],
    muni_dir: ["Municipios (directorio)", "Municipios más consultados en el directorio estatal: visitas a las páginas /municipios y a cada página de municipio (/&lt;municipio&gt;)."],
    topq: ["Preguntas más frecuentes", "Las preguntas del cuestionario a las que más personas llegaron. No incluye estados de ruteo (menor de edad, municipio, resultado). Haz clic en una barra para ver la pregunta completa y sus cifras."],
    timeseries: ["Actividad diaria", "Por día: vistas de página, formularios empezados y formularios completados. Pasa el mouse sobre la gráfica para ver los valores de cada día y haz clic para el detalle completo."],
  };
  function openInfo(key) {
    var d = INFO[key];
    if (!d) return;
    $("info-title").textContent = d[0];
    $("info-text").innerHTML = d[1];
    centerCard($("info-modal").querySelector(".modal-card"));
    $("info-modal").hidden = false;
  }
  function closeInfo() { $("info-modal").hidden = true; }

  // ---------- init ----------
  function markEmptyDates() {
    ["f-from", "f-to"].forEach(function (id) {
      var el = $(id);
      el.classList.toggle("is-empty", !el.value);
    });
  }
  function wireControls() {
    $("f-apply").addEventListener("click", function () { refreshAll(true); });
    $("f-reset").addEventListener("click", function () {
      $("f-from").value = ""; $("f-to").value = "";
      $("f-flow").value = ""; $("f-muni").value = "";
      markEmptyDates();
      refreshAll(true);
    });
    ["f-from", "f-to"].forEach(function (id) {
      $(id).addEventListener("change", markEmptyDates);
      $(id).addEventListener("input", markEmptyDates);
    });
    markEmptyDates();
    $("logout-btn").addEventListener("click", function () {
      A.logout().then(function () { location.replace("/acceso"); });
    });
    $("history-btn").addEventListener("click", openHistory);
    $("history-close").addEventListener("click", closeHistory);
    $("history-modal").addEventListener("click", function (e) {
      if (e.target.id === "history-modal") closeHistory();
    });
    $("info-close").addEventListener("click", closeInfo);
    $("info-modal").addEventListener("click", function (e) {
      if (e.target.id === "info-modal") closeInfo();
    });
    $("detail-close").addEventListener("click", closeDetail);
    $("detail-modal").addEventListener("click", function (e) {
      if (e.target.id === "detail-modal") closeDetail();
    });
    // Delegado: clic en cualquier ícono "i" abre su explicación; clic en un
    // elemento registrado abre su modal de detalle.
    document.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".info-i") : null;
      if (b) { e.preventDefault(); openInfo(b.getAttribute("data-info")); return; }
      var el = e.target.closest ? e.target.closest("[data-reg]") : null;
      if (el) {
        var r = regOf(el);
        if (r && r.body) { hideTip(); openDetail(r.title || "", r.body); }
      }
    });
    // Delegado: tooltip al pasar el mouse sobre cualquier elemento registrado.
    document.addEventListener("mouseover", function (e) {
      var el = e.target.closest ? e.target.closest("[data-reg]") : null;
      if (!el) return;
      var r = regOf(el);
      if (r && r.tip) showTip(r.tip, e.clientX, e.clientY);
    });
    document.addEventListener("mousemove", function (e) {
      var el = e.target.closest ? e.target.closest("[data-reg]") : null;
      if (el) moveTip(e.clientX, e.clientY);
      else if (!e.target.closest || !e.target.closest("#ts-overlay")) hideTip();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (!$("history-modal").hidden) closeHistory();
      if (!$("info-modal").hidden) closeInfo();
      if (!$("detail-modal").hidden) closeDetail();
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
    // Modales arrastrables + re-encaje dentro de los límites al cambiar tamaño.
    ["detail-modal", "info-modal", "history-modal"].forEach(makeDraggable);
    window.addEventListener("resize", reclampOpenModals);
  }

  function loadStatic() {
    return Promise.all([
      fetch("/formulario.json", { cache: "no-store" }).then(function (r) { return r.json(); }).catch(function () { return {}; }),
      fetch("/municipios.json", { cache: "no-store" }).then(function (r) { return r.json(); }).catch(function () { return {}; }),
    ]).then(function (res) {
      var form = res[0] || {};
      if (form.questions) {
        Object.keys(form.questions).forEach(function (id) {
          var q = form.questions[id];
          var qid = (q && q.qid) || id;   // etiquetar por qid estable
          var t = neutralize((q && q.text) || id, qid);
          qFull[qid] = t;
          qLabels[qid] = t.length > 46 ? t.slice(0, 44) + "…" : t;
        });
      }
      violInfo = form.violenceTypeInfo || {};
      qLabels["age"] = qLabels["age"] || "Edad";
      qLabels["start"] = qLabels["start"] || "Relación";
      qFull["age"] = qFull["age"] || "¿Qué edad tienes?";
      qFull["start"] = qFull["start"] || "Tipo de relación con la persona";
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
        return loadStatic().then(function () { return refreshAll(true); }).then(function () {
          startAuto();
          // Con el panel oculto no tiene caso consultar; al volver, un
          // refresco inmediato deja todo al día al instante.
          document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "hidden") stopAuto();
            else { refreshAll(true); startAuto(); }
          });
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
