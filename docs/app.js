(function () {
  "use strict";

  var cfg = Object.assign({ owner: "", repo: "", branch: "main", date: "2026-10-18", contactEmail: "" }, window.TRIATHLON_CONFIG || {});

  // Sur GitHub Pages, devine le compte et le repo depuis l'adresse.
  (function guessRepo() {
    var host = location.hostname;
    var m = host.match(/^([^.]+)\.github\.io$/i);
    if (!m) return;
    if (!cfg.owner) cfg.owner = m[1];
    if (!cfg.repo) {
      var first = location.pathname.split("/").filter(Boolean)[0];
      cfg.repo = first && !/\.html?$/.test(first) ? first : host;
    }
  })();

  var hasRepo = Boolean(cfg.owner && cfg.repo);
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // ---------- compte à rebours ----------
  function countdownText() {
    var p = cfg.date.split("-").map(Number);
    var race = new Date(p[0], p[1] - 1, p[2]);
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var days = Math.round((race - today) / 86400000);
    if (days > 1) return "Plus que " + days + " dodos !";
    if (days === 1) return "C'est demain !";
    if (days === 0) return "C'est aujourd'hui !";
    return "Bravo Marin !";
  }
  $$("[data-countdown]").forEach(function (el) { el.textContent = countdownText(); });

  // ---------- fichier agenda (.ics) ----------
  var ics = $("[data-ics]");
  if (ics) {
    var d = cfg.date.replace(/-/g, "");
    var p = cfg.date.split("-").map(Number);
    var next = new Date(Date.UTC(p[0], p[1] - 1, p[2] + 1)).toISOString().slice(0, 10).replace(/-/g, "");
    var body = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Triathlon de Marin//FR", "BEGIN:VEVENT",
      "UID:triathlon-marin-" + d + "@github.io",
      "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z",
      "DTSTART;VALUE=DATE:" + d, "DTEND;VALUE=DATE:" + next,
      "SUMMARY:Triathlon de Marin",
      "LOCATION:Piscine Alfred Sevestre puis parc Suzanne Lenglen\\, Issy-les-Moulineaux",
      "DESCRIPTION:Nage à la piscine Alfred Sevestre\\, puis vélo et course au parc Suzanne Lenglen. Allez Marin !",
      "END:VEVENT", "END:VCALENDAR"
    ].join("\r\n");
    ics.href = "data:text/calendar;charset=utf-8," + encodeURIComponent(body);
    ics.download = "triathlon-marin.ics";
  }

  // ---------- lecture des fichiers de données ----------
  // Version la plus fraîche : directement dans le repo (sans attendre un nouveau déploiement).
  function fetchData(file) {
    var sources = [];
    if (hasRepo) sources.push("https://raw.githubusercontent.com/" + cfg.owner + "/" + cfg.repo + "/" + cfg.branch + "/docs/data/" + file + "?t=" + Date.now());
    sources.push(new URL("data/" + file, document.baseURI).href + "?t=" + Date.now());
    function tryNext(i) {
      if (i >= sources.length) return Promise.reject(new Error("introuvable"));
      return fetch(sources[i], { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .catch(function () { return tryNext(i + 1); });
    }
    return tryNext(0);
  }

  // ---------- liste du sac (cochée et gardée sur l'appareil) ----------
  function setupSac(box) {
    var key = "sac-" + box.getAttribute("data-list");
    var saved = [];
    try { saved = JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { saved = []; }
    var inputs = $$("input", box);
    inputs.forEach(function (input) {
      var name = input.parentNode.textContent.trim();
      input.checked = saved.indexOf(name) !== -1;
      input.addEventListener("change", function () {
        var on = inputs.filter(function (x) { return x.checked; }).map(function (x) { return x.parentNode.textContent.trim(); });
        try { localStorage.setItem(key, JSON.stringify(on)); } catch (e) { /* stockage indisponible */ }
      });
    });
  }

  function renderSac(sac) {
    $$("[data-list]").forEach(function (box) {
      var items = sac && sac[box.getAttribute("data-list")];
      if (Array.isArray(items)) {
        $$("label", box).forEach(function (l) { l.remove(); });
        items.forEach(function (item) {
          var label = el("label");
          var input = el("input");
          input.type = "checkbox";
          label.appendChild(input);
          label.appendChild(document.createTextNode(item));
          box.appendChild(label);
        });
      }
      setupSac(box);
    });
  }

  // ---------- réglages (modifiables depuis /admin) ----------
  var masques = [];
  function applySettings(s) {
    s = s || {};
    masques = Array.isArray(s.masques) ? s.masques : [];
    if (lastData) render(lastData);
    renderSac(s.sac);
    var banner = $("#annonce");
    if (s.annonce) { banner.textContent = s.annonce; banner.hidden = false; }
    if (s.inscriptionsOuvertes === false) {
      form.hidden = true;
      $("#signup-closed").hidden = false;
    }
    if (s.contactEmail) cfg.contactEmail = s.contactEmail;
    setupMail();
  }

  // ---------- formulaire d'inscription ----------
  var form = $("#signup-form");
  var err = $("#form-error");
  var count = form.elements.personnes;

  $$("[data-step]", form).forEach(function (btn) {
    btn.addEventListener("click", function () {
      var v = parseInt(count.value, 10) || 1;
      count.value = Math.min(20, Math.max(1, v + Number(btn.getAttribute("data-step"))));
    });
  });

  $("#mail-link").addEventListener("click", function (e) {
    e.preventDefault();
    var v = readForm();
    var text = "Prénom(s) : " + (v.prenom || "") + "\nPersonnes : " + v.personnes + "\nOù : " + v.lieux + "\nMessage : " + (v.message || "");
    location.href = "mailto:" + cfg.contactEmail + "?subject=" + encodeURIComponent("Inscription triathlon de Marin") + "&body=" + encodeURIComponent(text);
  });
  function setupMail() { $("#mail-fallback").hidden = !cfg.contactEmail; }

  function readForm() {
    var lieu = form.querySelector("input[name=lieux]:checked");
    return {
      prenom: form.elements.prenom.value.trim(),
      personnes: Math.min(20, Math.max(1, parseInt(count.value, 10) || 1)),
      lieux: lieu ? lieu.value : "Piscine + parc",
      message: form.elements.message.value.trim()
    };
  }

  function showError(msg) {
    err.textContent = msg;
    err.hidden = !msg;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = readForm();
    form.elements.prenom.setAttribute("aria-invalid", v.prenom ? "false" : "true");
    if (!v.prenom) { showError("Il manque votre prénom."); form.elements.prenom.focus(); return; }
    if (!hasRepo) { showError("Le site n'est pas encore relié à un repo GitHub (voir config.js)."); return; }
    showError("");

    var url = "https://github.com/" + cfg.owner + "/" + cfg.repo + "/issues/new?" + [
      ["template", "inscription.yml"],
      ["title", "[Inscription] " + v.prenom],
      ["prenom", v.prenom],
      ["personnes", String(v.personnes)],
      ["lieux", v.lieux],
      ["message", v.message]
    ].map(function (kv) { return kv[0] + "=" + encodeURIComponent(kv[1]); }).join("&");

    $("#sent-link").href = url;
    window.open(url, "_blank", "noopener");
    var dlg = $("#sent");
    if (dlg.showModal) dlg.showModal(); else alert("Sur la page GitHub, cliquez sur « Create ».");
    pollFor(v.prenom);
  });

  // ---------- tableau des supporters ----------
  var people = $("#people"), messages = $("#messages"), status = $("#board-status");

  function el(tag, text) { var n = document.createElement(tag); if (text != null) n.textContent = text; return n; }

  var lastData = null;
  function render(data) {
    lastData = data;
    var list = ((data && data.inscrits) || []).filter(function (x) { return masques.indexOf(x.id) === -1; });
    var total = list.reduce(function (s, x) { return s + (Number(x.personnes) || 1); }, 0);
    $("#n-personnes").textContent = total;
    $("#n-inscriptions").textContent = list.length;
    people.textContent = "";
    messages.textContent = "";
    list.forEach(function (x) {
      var li = el("li", x.prenom);
      var extra = [];
      if (Number(x.personnes) > 1) extra.push("×" + x.personnes);
      if (x.lieux && x.lieux !== "Piscine + parc") extra.push(x.lieux.toLowerCase());
      if (extra.length) li.appendChild(el("small", extra.join(" · ")));
      people.appendChild(li);
      if (x.message) {
        var m = el("li");
        m.appendChild(el("b", x.prenom));
        m.appendChild(document.createTextNode(x.message));
        messages.appendChild(m);
      }
    });
    status.textContent = list.length
      ? "La liste se met à jour quelques minutes après chaque inscription."
      : "Personne encore… soyez le premier ou la première !";
    return list;
  }

  function load() {
    return fetchData("inscrits.json").then(render).catch(function () {
      status.textContent = "Impossible de charger la liste pour le moment.";
      return [];
    });
  }

  var pollTimer = null;
  function pollFor(name) {
    clearInterval(pollTimer);
    var tries = 0;
    pollTimer = setInterval(function () {
      tries++;
      load().then(function (list) {
        var found = list.some(function (x) { return x.prenom === name; });
        if (found || tries > 20) clearInterval(pollTimer);
      });
    }, 30000);
  }

  // Réglages de l'admin (Vercel), sinon ceux du repo.
  fetch("/api/reglages", { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .catch(function () { return fetchData("reglages.json"); })
    .then(applySettings, function () { applySettings({}); });
  load();
})();
