// Fonction Vercel derrière la page /admin.
// À configurer une fois dans Vercel :
//   ADMIN_CODE : le code d'accès (Settings → Environment Variables)
//   un stockage Blob relié au projet (Storage → Create → Blob) : fournit BLOB_READ_WRITE_TOKEN tout seul
const crypto = require("crypto");
const { hasStore, readSettings, writeSettings } = require("../lib/store.js");

const OWNER = process.env.VERCEL_GIT_REPO_OWNER || "mael12854";
const REPO = process.env.VERCEL_GIT_REPO_SLUG || "triathlon-marin";
const BRANCH = "main";

// Tolère les espaces, les guillemets et les majuscules/minuscules (claviers de téléphone).
const tidy = (s) => String(s || "").trim().replace(/^["']+|["']+$/g, "").trim().toLowerCase();

function sameCode(given) {
  const expected = tidy(process.env.ADMIN_CODE);
  if (!expected || typeof given !== "string") return false;
  const a = crypto.createHash("sha256").update(tidy(given)).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

// Les listes sont tenues à jour par l'Action GitHub dans le repo (public).
async function readList(file) {
  const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/docs/data/${file}?t=${Date.now()}`;
  const r = await fetch(url, { cache: "no-store" });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error("Liste introuvable sur GitHub (" + r.status + ").");
  const data = await r.json();
  return (data.inscrits || []).map((x) => ({ ...x, url: `https://github.com/${OWNER}/${REPO}/issues/${x.id}` }));
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  // État de la configuration (sans rien révéler du code).
  if (req.method === "GET") return res.json({ codeConfigure: Boolean(tidy(process.env.ADMIN_CODE)), stockage: hasStore() });
  if (req.method !== "POST") return res.status(405).json({ error: "POST uniquement." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  if (!process.env.ADMIN_CODE) return res.status(500).json({ error: "ADMIN_CODE n'est pas défini dans Vercel." });
  if (!sameCode(body.code)) {
    await new Promise((r) => setTimeout(r, 800)); // freine les essais au hasard
    return res.status(401).json({ error: "Code incorrect." });
  }

  const canWrite = hasStore();
  try {
    switch (body.action) {
      case "login":
        return res.json({ ok: true, canWrite });

      case "data": {
        const [inscriptions, avec, reglages] = await Promise.all([readList("inscrits.json"), readList("avec-marin.json"), readSettings()]);
        const masques = new Set(reglages.masques);
        const masquesAvec = new Set(reglages.masquesAvec);
        return res.json({
          inscriptions: inscriptions.map((x) => ({ ...x, retire: masques.has(x.id) })),
          avec: avec.map((x) => ({ ...x, retire: masquesAvec.has(x.id) })),
          reglages,
          canWrite,
        });
      }

      case "hide":
      case "show": {
        if (!canWrite) return res.status(503).json({ error: "Le stockage Vercel Blob n'est pas encore relié au projet." });
        const n = parseInt(body.number, 10);
        if (!n) return res.status(400).json({ error: "Numéro manquant." });
        const key = body.liste === "avec" ? "masquesAvec" : "masques";
        const current = await readSettings();
        const set = new Set(current[key]);
        if (body.action === "hide") set.add(n); else set.delete(n);
        const saved = await writeSettings({ ...current, [key]: [...set] });
        return res.json({ ok: true, reglages: saved });
      }

      case "saveSettings": {
        if (!canWrite) return res.status(503).json({ error: "Le stockage Vercel Blob n'est pas encore relié au projet." });
        const current = await readSettings();
        // Les inscriptions masquées ne se changent que par « Retirer » / « Remettre ».
        const saved = await writeSettings({ ...(body.reglages || {}), masques: current.masques, masquesAvec: current.masquesAvec });
        return res.json({ ok: true, reglages: saved });
      }

      default:
        return res.status(400).json({ error: "Action inconnue." });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
