// Réglages de l'admin, gardés dans Vercel Blob (aucune clé à créer :
// Vercel fournit BLOB_READ_WRITE_TOKEN quand le stockage est relié au projet).
const { list, put, del } = require("@vercel/blob");
const defaults = require("../docs/data/reglages.json");

const PREFIX = "reglages/";
const SAC_KEYS = ["nage", "velo", "course"];

const hasStore = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

const clean = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function normalise(input) {
  const src = input && typeof input === "object" ? input : {};
  const email = clean(src.contactEmail, 120);
  const sac = {};
  for (const key of SAC_KEYS) {
    const items = Array.isArray(src.sac && src.sac[key]) ? src.sac[key] : defaults.sac[key];
    sac[key] = items.map((x) => clean(x, 40)).filter(Boolean).slice(0, 15);
  }
  const masques = Array.isArray(src.masques) ? src.masques : [];
  return {
    inscriptionsOuvertes: src.inscriptionsOuvertes !== false,
    annonce: clean(src.annonce, 200),
    contactEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
    sac,
    masques: [...new Set(masques.map((n) => parseInt(n, 10)).filter((n) => n > 0))].sort((a, b) => a - b),
  };
}

// Chaque enregistrement crée un nouveau fichier : on lit toujours le plus récent.
async function readSettings() {
  if (!hasStore()) return normalise(defaults);
  const { blobs } = await list({ prefix: PREFIX, limit: 100 });
  if (!blobs.length) return normalise(defaults);
  blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const r = await fetch(blobs[0].url, { cache: "no-store" });
  if (!r.ok) throw new Error("Lecture des réglages impossible (" + r.status + ").");
  return normalise(await r.json());
}

async function writeSettings(next) {
  const data = normalise(next);
  await put(PREFIX + Date.now() + ".json", JSON.stringify(data, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: true,
  });
  // Ménage : on garde les 10 dernières versions.
  const { blobs } = await list({ prefix: PREFIX, limit: 100 });
  blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const old = blobs.slice(10).map((b) => b.url);
  if (old.length) await del(old).catch(() => {});
  return data;
}

module.exports = { hasStore, readSettings, writeSettings, normalise };
