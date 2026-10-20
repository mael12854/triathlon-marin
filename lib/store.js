// Réglages de l'admin, gardés dans Vercel Blob (aucune clé à créer :
// Vercel fournit BLOB_STORE_ID, ou BLOB_READ_WRITE_TOKEN, quand le stockage est relié au projet).
const { list, put, del, get } = require("@vercel/blob");
const defaults = require("../docs/data/reglages.json");

const PREFIX = "reglages/";
const SAC_KEYS = ["nage", "velo", "course"];

const hasStore = () => Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);

// Le stockage peut être « public » ou « private » : on essaie l'un puis l'autre.
let access = null;
async function withAccess(fn) {
  const order = access ? [access] : ["public", "private"];
  let lastErr;
  for (const a of order) {
    try {
      const r = await fn(a);
      access = a;
      return r;
    } catch (e) {
      lastErr = e;
      if (!/access|private|public/i.test(String(e && e.message))) throw e;
    }
  }
  throw lastErr;
}

const clean = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function normalise(input) {
  const src = input && typeof input === "object" ? input : {};
  const email = clean(src.contactEmail, 120);
  const sac = {};
  for (const key of SAC_KEYS) {
    const items = Array.isArray(src.sac && src.sac[key]) ? src.sac[key] : defaults.sac[key];
    sac[key] = items.map((x) => clean(x, 40)).filter(Boolean).slice(0, 15);
  }
  const ids = (arr) => [...new Set((Array.isArray(arr) ? arr : []).map((n) => parseInt(n, 10)).filter((n) => n > 0))].sort((a, b) => a - b);
  return {
    inscriptionsOuvertes: src.inscriptionsOuvertes !== false,
    avecOuvert: src.avecOuvert !== false,
    annonce: clean(src.annonce, 200),
    contactEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
    sac,
    masques: ids(src.masques),
    masquesAvec: ids(src.masquesAvec),
  };
}

// Chaque enregistrement crée un nouveau fichier : on lit toujours le plus récent.
async function readSettings() {
  if (!hasStore()) return normalise(defaults);
  const { blobs } = await list({ prefix: PREFIX, limit: 100 });
  if (!blobs.length) return normalise(defaults);
  blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const res = await withAccess((a) => get(blobs[0].url, { access: a, useCache: false }));
  if (!res || res.statusCode !== 200) throw new Error("Lecture des réglages impossible.");
  return normalise(JSON.parse(await new Response(res.stream).text()));
}

async function writeSettings(next) {
  const data = normalise(next);
  await withAccess((a) => put(PREFIX + Date.now() + ".json", JSON.stringify(data, null, 2), {
    access: a,
    contentType: "application/json",
    addRandomSuffix: true,
  }));
  // Ménage : on garde les 10 dernières versions.
  const { blobs } = await list({ prefix: PREFIX, limit: 100 });
  blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const old = blobs.slice(10).map((b) => b.url);
  if (old.length) await del(old).catch(() => {});
  return data;
}

module.exports = { hasStore, readSettings, writeSettings, normalise };
