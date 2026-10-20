(function () {
  "use strict";

  var API = "/api/admin";
  var KEY = "triathlon-admin-code";
  var SAC_KEYS = ["nage", "velo", "course"];
  var state = { code: "", canWrite: false, inscriptions: [], avec: [], reglages: null };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  var SVG = "http://www.w3.org/2000/svg";
  function sv(tag, attrs, text) {
    var n = document.createElementNS(SVG, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }

  // ---------- appels au serveur ----------
  function call(action, extra) {
    var body = Object.assign({ code: state.code, action: action }, extra || {});
    return fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok) { var e = new Error(data.error || "Erreur " + r.status); e.status = r.status; throw e; }
          return data;
        });
      });
  }

  // ---------- connexion ----------
  var gate = $("#gate"), body = $("#admin-body"), loginMsg = $("#login-msg");

  function enter(code, silent) {
    state.code = code;
    loginMsg.textContent = silent ? "" : "Vérification…";
    return call("login").then(function (r) {
      try { sessionStorage.setItem(KEY, code); } catch (e) { /* indisponible */ }
      state.canWrite = r.canWrite;
      loginMsg.textContent = "";
      gate.hidden = true;
      body.hidden = false;
      $("#setup").hidden = r.canWrite;
      document.body.classList.toggle("readonly", !r.canWrite);
      return refresh();
    }).catch(function (e) {
      try { sessionStorage.removeItem(KEY); } catch (x) { /* indisponible */ }
      state.code = "";
      loginMsg.textContent = e.status === 401 ? "Code incorrect." : e.message;
      $("#code").select();
    });
  }

  $("#login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var code = $("#code").value.trim();
    if (code) enter(code);
  });
  $("#logout").addEventListener("click", function () {
    try { sessionStorage.removeItem(KEY); } catch (e) { /* indisponible */ }
    location.reload();
  });

  // ---------- onglets ----------
  var tabs = $$("[role=tab]");
  function selectTab(tab) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      $("#" + t.getAttribute("aria-controls")).hidden = !on;
    });
    if (tab.id === "t-stats") drawCharts();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { selectTab(t); });
    t.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      var next = tabs[(i + d + tabs.length) % tabs.length];
      next.focus();
      selectTab(next);
    });
  });

  // ---------- données ----------
  function refresh() {
    $("#data-note").textContent = "Chargement…";
    return call("data").then(function (d) {
      state.inscriptions = d.inscriptions || [];
      state.avec = d.avec || [];
      state.reglages = d.reglages || {};
      state.canWrite = d.canWrite;
      renderStats();
      renderTable();
      renderSac();
      renderSettings();
      $("#data-note").textContent = "Données à jour à " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) + ".";
    }).catch(function (e) {
      $("#data-note").textContent = "Impossible de charger les données : " + e.message;
    });
  }
  $$("[data-refresh]").forEach(function (b) { b.addEventListener("click", refresh); });

  function actifs() { return state.inscriptions.filter(function (x) { return !x.retire; }); }
  var fmtDate = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  // ---------- tableau de bord ----------
  function renderStats() {
    var list = actifs();
    var total = list.reduce(function (s, x) { return s + x.personnes; }, 0);
    $("#k-personnes").textContent = total;
    $("#k-inscriptions").textContent = list.length;
    $("#k-messages").textContent = list.filter(function (x) { return x.message; }).length;
    $("#k-retires").textContent = (state.inscriptions.length - list.length) + (state.avec.length - avecActifs().length);
    $("#k-avec").textContent = avecActifs().length;

    var ul = $("#last-msgs");
    ul.textContent = "";
    var msgs = list.filter(function (x) { return x.message; }).slice(-5).reverse();
    if (!msgs.length) ul.appendChild(el("li", null, "Pas encore de petit mot."));
    msgs.forEach(function (x) {
      var li = el("li");
      li.appendChild(el("b", null, x.prenom));
      li.appendChild(document.createTextNode(x.message));
      ul.appendChild(li);
    });
    drawCharts();
  }

  // Graduations « rondes » pour un axe qui part de 0.
  function ticks(max) {
    if (max <= 0) return [0, 1];
    var steps = [1, 2, 5, 10, 20, 25, 50, 100];
    var step = steps.find(function (s) { return max / s <= 5; }) || Math.ceil(max / 5);
    var out = [];
    for (var v = 0; v <= max + step - 1e-9; v += step) out.push(v);
    if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
    return out;
  }

  // Barre avec bout arrondi (4 px) et base carrée.
  function barPath(x, y, w, h, horizontal) {
    var r = Math.min(4, horizontal ? w : h, horizontal ? h / 2 : w / 2);
    if (horizontal) {
      return "M" + x + "," + y + "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) +
        "V" + (y + h - r) + "Q" + (x + w) + "," + (y + h) + " " + (x + w - r) + "," + (y + h) + "H" + x + "Z";
    }
    return "M" + x + "," + (y + h) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y +
      "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) + "V" + (y + h) + "Z";
  }

  var tip = $("#tip");
  function showTip(evtOrEl, value, label) {
    tip.textContent = "";
    tip.appendChild(el("strong", null, value));
    tip.appendChild(el("span", null, label));
    tip.hidden = false;
    var x, y;
    if (evtOrEl.clientX != null) { x = evtOrEl.clientX; y = evtOrEl.clientY; }
    else { var b = evtOrEl.getBoundingClientRect(); x = b.left + b.width / 2; y = b.top; }
    var w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x + 14)) + "px";
    tip.style.top = Math.max(8, y - h - 12) + "px";
  }
  function hideTip() { tip.hidden = true; }

  function hitTarget(node, value, label) {
    node.setAttribute("tabindex", "0");
    node.setAttribute("aria-label", label + " : " + value);
    node.addEventListener("pointermove", function (e) { showTip(e, value, label); });
    node.addEventListener("pointerleave", hideTip);
    node.addEventListener("focus", function () { showTip(node, value, label); });
    node.addEventListener("blur", hideTip);
  }

  function emptyMsg(box, text) {
    box.textContent = "";
    box.appendChild(el("p", "empty", text));
  }

  // Barres horizontales (une seule série, une seule couleur).
  function hbars(box, rows, ariaLabel, unit) {
    var W = Math.max(280, box.clientWidth), labelW = 70, valW = 40, rowH = 44, bar = 24, top = 4;
    var plotW = W - labelW - valW;
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; })) || 1;
    var H = top + rows.length * rowH;
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": ariaLabel });
    rows.forEach(function (r, i) {
      var y = top + i * rowH;
      var w = Math.max(r.value ? 2 : 0, (r.value / max) * plotW);
      svg.appendChild(sv("text", { x: 0, y: y + rowH / 2 + 5, class: "cat" }, r.label));
      var hit = sv("rect", { x: labelW, y: y, width: plotW + valW, height: rowH, class: "hit" });
      svg.appendChild(hit);
      svg.appendChild(sv("path", { d: barPath(labelW, y + (rowH - bar) / 2, w, bar, true), class: "bar" }));
      svg.appendChild(sv("text", { x: labelW + w + 8, y: y + rowH / 2 + 5, class: "val" }, String(r.value)));
      hitTarget(hit, r.value + " " + unit + (r.value > 1 ? "s" : ""), r.label);
    });
    box.textContent = "";
    box.appendChild(svg);
  }

  // 1. Personnes par lieu.
  function chartLieux(box) {
    var list = actifs();
    if (!list.length) return emptyMsg(box, "Aucune inscription pour l'instant.");
    var sum = function (f) { return list.filter(f).reduce(function (s, x) { return s + x.personnes; }, 0); };
    hbars(box, [
      { label: "Piscine", value: sum(function (x) { return x.lieux !== "Parc"; }) },
      { label: "Parc", value: sum(function (x) { return x.lieux !== "Piscine"; }) }
    ], "Personnes par lieu", "personne");
    var both = sum(function (x) { return x.lieux === "Piscine + parc"; });
    box.appendChild(el("p", "note", both + " personne" + (both > 1 ? "s viennent" : " vient") + " aux deux lieux et compte" + (both > 1 ? "nt" : "") + " dans les deux barres."));
  }

  // 1 bis. Qui fait quoi avec Marin.
  function avecActifs() { return state.avec.filter(function (x) { return !x.retire; }); }
  function chartAvec(box) {
    var list = avecActifs();
    if (!list.length) return emptyMsg(box, "Personne ne s'est encore inscrit.");
    var n = function (k) { return list.filter(function (x) { return (x.epreuves || []).indexOf(k) !== -1; }).length; };
    hbars(box, [
      { label: "Nage", value: n("nage") },
      { label: "Vélo", value: n("velo") },
      { label: "Course", value: n("course") }
    ], "Nombre de personnes par épreuve avec Marin", "personne");
    var all = list.filter(function (x) { return (x.epreuves || []).length === 3; }).length;
    if (all) box.appendChild(el("p", "note", all + " personne" + (all > 1 ? "s font" : " fait") + " les trois épreuves avec Marin."));
  }

  // 2. Total cumulé dans le temps (ligne en escalier + repère vertical au survol).
  function chartTemps(box) {
    var list = actifs().filter(function (x) { return x.date; }).sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    if (!list.length) return emptyMsg(box, "Aucune inscription pour l'instant.");
    var pts = [], total = 0;
    list.forEach(function (x) { total += x.personnes; pts.push({ t: new Date(x.date).getTime(), v: total, who: x.prenom, add: x.personnes }); });
    var now = Date.now();
    var t0 = pts[0].t, t1 = Math.max(now, pts[pts.length - 1].t);
    if (t1 - t0 < 3600000) t0 = t1 - 3600000;
    var W = Math.max(280, box.clientWidth), H = 220, L = 34, R = 44, T = 10, B = 26;
    var pw = W - L - R, ph = H - T - B;
    var yt = ticks(total), ymax = yt[yt.length - 1];
    var X = function (t) { return L + ((t - t0) / (t1 - t0)) * pw; };
    var Y = function (v) { return T + ph - (v / ymax) * ph; };
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Total cumulé de supporters dans le temps", tabindex: "0" });
    var g = sv("g", { class: "grid" });
    yt.forEach(function (v) {
      g.appendChild(sv("line", { x1: L, x2: L + pw, y1: Y(v), y2: Y(v) }));
      svg.appendChild(sv("text", { x: L - 8, y: Y(v) + 4, "text-anchor": "end" }, String(v)));
    });
    svg.insertBefore(g, svg.firstChild);
    // Étiquettes de temps : début et fin.
    var short = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    svg.appendChild(sv("text", { x: L, y: H - 6 }, short.format(t0)));
    svg.appendChild(sv("text", { x: L + pw, y: H - 6, "text-anchor": "end" }, "maintenant"));

    var d = "M" + X(t0) + "," + Y(0);
    pts.forEach(function (p) { d += "H" + X(p.t) + "V" + Y(p.v); });
    d += "H" + X(t1);
    svg.appendChild(sv("path", { d: d + "V" + Y(0) + "Z", class: "area" }));
    svg.appendChild(sv("path", { d: d, class: "line" }));
    svg.appendChild(sv("circle", { cx: X(t1), cy: Y(total), r: 4, class: "dot" }));
    svg.appendChild(sv("text", { x: X(t1) + 8, y: Y(total) + 4, class: "val" }, String(total)));

    var cross = sv("line", { y1: T, y2: T + ph, class: "cross", visibility: "hidden" });
    var mark = sv("circle", { r: 4, class: "dot", visibility: "hidden" });
    svg.appendChild(cross);
    svg.appendChild(mark);
    var hit = sv("rect", { x: L, y: T, width: pw, height: ph, class: "hit" });
    svg.appendChild(hit);

    var idx = pts.length - 1;
    function show(i, evt) {
      idx = Math.max(0, Math.min(pts.length - 1, i));
      var p = pts[idx];
      cross.setAttribute("x1", X(p.t)); cross.setAttribute("x2", X(p.t));
      cross.setAttribute("visibility", "visible");
      mark.setAttribute("cx", X(p.t)); mark.setAttribute("cy", Y(p.v));
      mark.setAttribute("visibility", "visible");
      showTip(evt || mark, p.v + " personnes", fmtDate.format(p.t) + " · +" + p.add + " " + p.who);
    }
    function hide() { cross.setAttribute("visibility", "hidden"); mark.setAttribute("visibility", "hidden"); hideTip(); }
    hit.addEventListener("pointermove", function (e) {
      var r = svg.getBoundingClientRect();
      var x = (e.clientX - r.left) * (W / r.width);
      var best = 0, bd = Infinity;
      pts.forEach(function (p, i) { var dd = Math.abs(X(p.t) - x); if (dd < bd) { bd = dd; best = i; } });
      show(best, e);
    });
    hit.addEventListener("pointerleave", hide);
    svg.addEventListener("focus", function () { show(idx); });
    svg.addEventListener("blur", hide);
    svg.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); show(idx - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); show(idx + 1); }
    });
    box.textContent = "";
    box.appendChild(svg);
  }

  // 3. Taille des groupes (colonnes).
  function chartGroupes(box) {
    var list = actifs();
    if (!list.length) return emptyMsg(box, "Aucune inscription pour l'instant.");
    var maxSize = Math.max(4, Math.min(10, Math.max.apply(null, list.map(function (x) { return x.personnes; }))));
    var cats = [];
    for (var s = 1; s <= maxSize; s++) {
      var last = s === maxSize && list.some(function (x) { return x.personnes > maxSize; });
      cats.push({ label: last ? s + "+" : String(s), value: list.filter(function (x) { return last ? x.personnes >= s : x.personnes === s; }).length });
    }
    var W = Math.max(280, box.clientWidth), H = 200, L = 28, R = 8, T = 18, B = 26;
    var pw = W - L - R, ph = H - T - B, band = pw / cats.length, colW = Math.min(24, band * 0.6);
    var yt = ticks(Math.max.apply(null, cats.map(function (c) { return c.value; }))), ymax = yt[yt.length - 1];
    var Y = function (v) { return T + ph - (v / ymax) * ph; };
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Inscriptions selon la taille du groupe" });
    var g = sv("g", { class: "grid" });
    yt.forEach(function (v) {
      g.appendChild(sv("line", { x1: L, x2: L + pw, y1: Y(v), y2: Y(v) }));
      svg.appendChild(sv("text", { x: L - 8, y: Y(v) + 4, "text-anchor": "end" }, String(v)));
    });
    svg.appendChild(g);
    cats.forEach(function (c, i) {
      var cx = L + band * i + band / 2;
      var hit = sv("rect", { x: L + band * i, y: T, width: band, height: ph, class: "hit" });
      svg.appendChild(hit);
      if (c.value) {
        svg.appendChild(sv("path", { d: barPath(cx - colW / 2, Y(c.value), colW, Y(0) - Y(c.value), false), class: "bar" }));
        svg.appendChild(sv("text", { x: cx, y: Y(c.value) - 6, "text-anchor": "middle", class: "val" }, String(c.value)));
      }
      svg.appendChild(sv("text", { x: cx, y: H - 6, "text-anchor": "middle" }, c.label));
      hitTarget(hit, c.value + " inscription" + (c.value > 1 ? "s" : ""), "Groupes de " + c.label + " personne" + (c.label === "1" ? "" : "s"));
    });
    box.textContent = "";
    box.appendChild(svg);
  }

  function drawCharts() {
    if ($("#tab-stats").hidden || body.hidden) return;
    chartLieux($("#chart-lieux"));
    chartAvec($("#chart-avec"));
    chartTemps($("#chart-temps"));
    chartGroupes($("#chart-groupes"));
  }
  var resizeTimer;
  window.addEventListener("resize", function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawCharts, 150); });

  // ---------- listes (supporters et « avec Marin ») ----------
  var NOMS = { nage: "Nage", velo: "Vélo", course: "Course" };

  function renderList(tbody, list, liste, cells) {
    tbody.textContent = "";
    if (!list.length) {
      var tr0 = el("tr"), td0 = el("td", null, "Aucune inscription.");
      td0.colSpan = 8;
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
      return;
    }
    list.slice().reverse().forEach(function (x) {
      var tr = el("tr", x.retire ? "off" : "");
      var tdId = el("td");
      var a = el("a", null, "#" + x.id);
      a.href = x.url; a.target = "_blank"; a.rel = "noopener";
      tdId.appendChild(a);
      tr.appendChild(tdId);
      tr.appendChild(el("td", null, x.prenom));
      cells(x).forEach(function (c) { tr.appendChild(c); });
      tr.appendChild(el("td", "msg", x.message || "—"));
      tr.appendChild(el("td", null, x.date ? fmtDate.format(new Date(x.date)) : ""));
      var st = el("td");
      st.appendChild(el("span", "badge " + (x.retire ? "off" : "on"), x.retire ? "Retirée" : "Affichée"));
      tr.appendChild(st);
      var act = el("td");
      var btn = el("button", "row-btn", x.retire ? "Remettre" : "Retirer");
      btn.type = "button";
      btn.disabled = !state.canWrite;
      btn.setAttribute("data-needs-auth", "");
      btn.addEventListener("click", function () {
        if (!x.retire && !confirm("Retirer « " + x.prenom + " » du site ?")) return;
        btn.disabled = true;
        btn.textContent = "…";
        call(x.retire ? "show" : "hide", { number: x.id, liste: liste }).then(function (r) {
          x.retire = !x.retire;
          if (r.reglages) state.reglages = r.reglages;
          renderTable();
          renderStats();
        }).catch(function (e) {
          alert(e.message);
          btn.disabled = false;
          btn.textContent = x.retire ? "Remettre" : "Retirer";
        });
      });
      act.appendChild(btn);
      tr.appendChild(act);
      tbody.appendChild(tr);
    });
  }

  function renderTable() {
    renderList($("#people-rows"), state.inscriptions, "supporters", function (x) {
      return [el("td", "n", String(x.personnes)), el("td", null, x.lieux)];
    });
    renderList($("#avec-rows"), state.avec, "avec", function (x) {
      var td = el("td");
      (x.epreuves || []).forEach(function (k) { td.appendChild(el("span", "chip " + k, NOMS[k] || k)); });
      return [td];
    });
  }

  // ---------- sac ----------
  function sacRow(value) {
    var li = el("li");
    var input = el("input");
    input.value = value;
    input.maxLength = 40;
    input.setAttribute("aria-label", "Élément du sac");
    li.appendChild(input);
    [["↑", "Monter", -1], ["↓", "Descendre", 1], ["✕", "Supprimer", 0]].forEach(function (b) {
      var btn = el("button", null, b[0]);
      btn.type = "button";
      btn.title = b[1];
      btn.setAttribute("aria-label", b[1]);
      btn.addEventListener("click", function () {
        var ul = li.parentNode;
        if (b[2] === 0) { li.remove(); return; }
        var sib = b[2] < 0 ? li.previousElementSibling : li.nextElementSibling;
        if (!sib) return;
        if (b[2] < 0) ul.insertBefore(li, sib); else ul.insertBefore(sib, li);
        btn.focus();
      });
      li.appendChild(btn);
    });
    return li;
  }

  function renderSac() {
    var sac = (state.reglages && state.reglages.sac) || {};
    SAC_KEYS.forEach(function (k) {
      var ul = $("[data-sac=" + k + "] ul");
      ul.textContent = "";
      (sac[k] || []).forEach(function (v) { ul.appendChild(sacRow(v)); });
    });
  }
  $$(".sac-col .add").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var row = sacRow("");
      btn.parentNode.querySelector("ul").appendChild(row);
      row.querySelector("input").focus();
    });
  });

  // ---------- réglages ----------
  function renderSettings() {
    var r = state.reglages || {};
    $("#s-open").checked = r.inscriptionsOuvertes !== false;
    $("#s-avec").checked = r.avecOuvert !== false;
    $("#s-annonce").value = r.annonce || "";
    $("#s-email").value = r.contactEmail || "";
  }

  function collect() {
    var sac = {};
    SAC_KEYS.forEach(function (k) {
      sac[k] = $$("[data-sac=" + k + "] input").map(function (i) { return i.value.trim(); }).filter(Boolean);
    });
    return {
      inscriptionsOuvertes: $("#s-open").checked,
      avecOuvert: $("#s-avec").checked,
      annonce: $("#s-annonce").value.trim(),
      contactEmail: $("#s-email").value.trim(),
      sac: sac
    };
  }

  $$("[data-save]").forEach(function (btn) {
    btn.setAttribute("data-needs-auth", "");
    btn.addEventListener("click", function () {
      var msg = $("[data-msg=" + btn.getAttribute("data-save") + "]");
      if (!state.canWrite) { msg.className = "save-msg err"; msg.textContent = "Le stockage Vercel n'est pas encore relié (voir l'encadré en haut)."; return; }
      btn.disabled = true;
      msg.className = "save-msg";
      msg.textContent = "Enregistrement…";
      call("saveSettings", { reglages: collect() }).then(function (r) {
        state.reglages = r.reglages;
        renderSac();
        renderSettings();
        msg.className = "save-msg ok";
        msg.textContent = "Enregistré. C'est en ligne sur le site.";
      }).catch(function (e) {
        msg.className = "save-msg err";
        msg.textContent = e.message;
      }).then(function () { btn.disabled = false; });
    });
  });

  // ---------- démarrage ----------
  var saved = "";
  try { saved = sessionStorage.getItem(KEY) || ""; } catch (e) { saved = ""; }
  if (saved) enter(saved, true); else $("#code").focus();
})();
