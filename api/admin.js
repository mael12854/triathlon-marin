// Fonction Vercel derrière la page /admin.
// Variables à définir dans Vercel (Settings → Environment Variables) :
//   ADMIN_CODE   : le code d'accès à l'admin
//   GITHUB_TOKEN : jeton GitHub (Contents + Issues en lecture/écriture sur ce repo)
const crypto = require("crypto");
const { toEntry, isRemoved, clean } = require("../lib/inscription.js");

const OWNER = process.env.VERCEL_GIT_REPO_OWNER || "mael12854";
const REPO = process.env.VERCEL_GIT_REPO_SLUG || "triathlon-marin";
const BRANCH = "main";
const SETTINGS_PATH = "docs/data/reglages.json";
const SAC_KEYS = ["nage", "velo", "course"];

function sameCode(given) {
  const expected = process.env.ADMIN_CODE || "";
  if (!expected || typeof given !== "string") return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

async function gh(path, opts = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "triathlon-marin-admin",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = "Bearer " + process.env.GITHUB_TOKEN;
  if (opts.body) headers["Content-Type"] = "application/json";
  const r = await fetch("https://api.github.com" + path, { ...opts, headers });
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) {
    const err = new Error((data && data.message) || "GitHub " + r.status);
    err.status = r.status;
    throw err;
  }
  return data;
}

async function listInscriptions() {
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await gh(`/repos/${OWNER}/${REPO}/issues?labels=inscription&state=all&per_page=100&page=${page}`);
    all.push(...batch.filter((i) => !i.pull_request));
    if (batch.length < 100) break;
  }
  return all
    .map((issue) => {
      const e = toEntry(issue);
      return e && { ...e, retire: isRemoved(issue), url: issue.html_url, auteur: issue.user && issue.user.login };
    })
    .filter(Boolean)
    .sort((a, b) => a.id - b.id);
}

async function readSettings() {
  const file = await gh(`/repos/${OWNER}/${REPO}/contents/${SETTINGS_PATH}?ref=${BRANCH}`);
  return { sha: file.sha, data: JSON.parse(Buffer.from(file.content, "base64").toString("utf8")) };
}

function validSettings(input) {
  if (!input || typeof input !== "object") throw Object.assign(new Error("Réglages invalides."), { status: 400 });
  const email = clean(input.contactEmail, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error("Adresse e-mail invalide."), { status: 400 });
  const sac = {};
  for (const key of SAC_KEYS) {
    const items = Array.isArray(input.sac && input.sac[key]) ? input.sac[key] : [];
    sac[key] = items.map((x) => clean(x, 40)).filter(Boolean).slice(0, 15);
  }
  return {
    inscriptionsOuvertes: input.inscriptionsOuvertes !== false,
    annonce: clean(input.annonce, 200),
    contactEmail: email,
    sac,
  };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST uniquement." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  if (!process.env.ADMIN_CODE) return res.status(500).json({ error: "ADMIN_CODE n'est pas défini dans Vercel." });
  if (!sameCode(body.code)) {
    await new Promise((r) => setTimeout(r, 800)); // freine les essais au hasard
    return res.status(401).json({ error: "Code incorrect." });
  }

  const canWrite = Boolean(process.env.GITHUB_TOKEN);
  try {
    switch (body.action) {
      case "login":
        return res.json({ ok: true, canWrite });

      case "data": {
        const [inscriptions, settings] = await Promise.all([listInscriptions(), readSettings()]);
        return res.json({ inscriptions, reglages: settings.data, canWrite });
      }

      case "hide":
      case "show": {
        if (!canWrite) return res.status(503).json({ error: "GITHUB_TOKEN manquant dans Vercel." });
        const n = parseInt(body.number, 10);
        if (!n) return res.status(400).json({ error: "Numéro manquant." });
        const issue = await gh(`/repos/${OWNER}/${REPO}/issues/${n}`);
        if (!(issue.labels || []).some((l) => l.name === "inscription")) return res.status(400).json({ error: "Ce n'est pas une inscription." });
        const patch = body.action === "hide" ? { state: "closed", state_reason: "not_planned" } : { state: "open" };
        await gh(`/repos/${OWNER}/${REPO}/issues/${n}`, { method: "PATCH", body: JSON.stringify(patch) });
        if (body.action === "show") {
          // Retire aussi un éventuel label « spam ».
          await gh(`/repos/${OWNER}/${REPO}/issues/${n}/labels/spam`, { method: "DELETE" }).catch(() => {});
        }
        return res.json({ ok: true });
      }

      case "saveSettings": {
        if (!canWrite) return res.status(503).json({ error: "GITHUB_TOKEN manquant dans Vercel." });
        const next = validSettings(body.reglages);
        const current = await readSettings();
        const content = JSON.stringify(next, null, 2) + "\n";
        await gh(`/repos/${OWNER}/${REPO}/contents/${SETTINGS_PATH}`, {
          method: "PUT",
          body: JSON.stringify({
            message: "Admin : mise à jour des réglages",
            content: Buffer.from(content, "utf8").toString("base64"),
            sha: current.sha,
            branch: BRANCH,
          }),
        });
        return res.json({ ok: true, reglages: next });
      }

      default:
        return res.status(400).json({ error: "Action inconnue." });
    }
  } catch (e) {
    const status = e.status >= 400 && e.status < 600 ? e.status : 500;
    return res.status(status === 401 ? 502 : status).json({ error: "GitHub : " + e.message });
  }
};
