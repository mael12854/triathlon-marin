// Lecture d'une issue « inscription » (utilisé par l'Action GitHub et par /api/admin).

// Les issue forms produisent : "### Libellé\n\nvaleur\n\n### Libellé suivant…"
function parseBody(body) {
  const out = {};
  const parts = (body || "").split(/^###\s+/m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf("\n");
    const label = (nl === -1 ? part : part.slice(0, nl)).trim().toLowerCase();
    let value = nl === -1 ? "" : part.slice(nl + 1).trim();
    if (value === "_No response_") value = "";
    out[label] = value;
  }
  const pick = (start) => {
    const key = Object.keys(out).find((k) => k.startsWith(start));
    return key ? out[key] : "";
  };
  return {
    prenom: pick("prénom") || pick("prenom"),
    personnes: pick("nombre"),
    lieux: pick("où") || pick("ou "),
    message: pick("un petit mot"),
  };
}

const clean = (s, max) => String(s || "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function normaliseLieux(s) {
  const v = (s || "").toLowerCase();
  const piscine = v.includes("piscine");
  const parc = v.includes("parc");
  if (piscine && !parc) return "Piscine";
  if (parc && !piscine) return "Parc";
  return "Piscine + parc";
}

function toEntry(issue) {
  const f = parseBody(issue.body);
  const prenom = clean(f.prenom || issue.title.replace(/^\[Inscription\]\s*/i, ""), 60);
  if (!prenom) return null;
  const n = parseInt(String(f.personnes).replace(/[^\d]/g, ""), 10);
  return {
    id: issue.number,
    prenom,
    personnes: Number.isFinite(n) ? Math.min(20, Math.max(1, n)) : 1,
    lieux: normaliseLieux(f.lieux),
    message: clean(f.message, 280),
    date: issue.created_at,
  };
}

const isRemoved = (issue) =>
  issue.state_reason === "not_planned" ||
  (issue.labels || []).some((l) => (typeof l === "string" ? l : l.name).toLowerCase() === "spam");

module.exports = { parseBody, toEntry, isRemoved, clean };
