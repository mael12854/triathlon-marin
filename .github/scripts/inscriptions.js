// Recrée docs/data/inscrits.json à partir des issues "inscription".
// Pour retirer quelqu'un : fermer son issue en « Close as not planned »,
// ou lui mettre le label « spam ».
const fs = require("fs");
const path = require("path");

const LABEL = "inscription";
const FILE = path.join(process.cwd(), "docs", "data", "inscrits.json");

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

module.exports = async ({ github, context, core }) => {
  const { owner, repo } = context.repo;
  const ev = context.payload;

  // Nouvelle inscription : on s'assure qu'elle a le label, et on dit merci.
  if (context.eventName === "issues" && ev.action === "opened" && /^\[Inscription\]/i.test(ev.issue.title)) {
    try {
      await github.rest.issues.getLabel({ owner, repo, name: LABEL });
    } catch {
      await github.rest.issues.createLabel({ owner, repo, name: LABEL, color: "f0a050", description: "Supporter inscrit sur le site" });
    }
    if (!ev.issue.labels.some((l) => l.name === LABEL)) {
      await github.rest.issues.addLabels({ owner, repo, issue_number: ev.issue.number, labels: [LABEL] });
    }
    await github.rest.issues.createComment({
      owner, repo, issue_number: ev.issue.number,
      body: "Merci, c'est noté ! Votre prénom apparaîtra sur le site d'ici quelques minutes. Allez Marin ! 🏊 🚲 🏃",
    });
  }

  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner, repo, labels: LABEL, state: "all", per_page: 100,
  });

  // L'issue qui vient d'arriver peut ne pas encore apparaître dans la recherche.
  if (context.eventName === "issues" && ev.action !== "deleted" && /^\[Inscription\]/i.test(ev.issue.title)
      && !issues.some((i) => i.number === ev.issue.number)) {
    issues.push(ev.issue);
  }
  const deleted = context.eventName === "issues" && ev.action === "deleted" ? ev.issue.number : null;

  const inscrits = issues
    .filter((i) => !i.pull_request && !isRemoved(i) && i.number !== deleted)
    .map(toEntry)
    .filter(Boolean)
    .sort((a, b) => a.id - b.id);

  // Ne réécrit le fichier que si la liste a changé.
  let previous = null;
  try { previous = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { /* fichier absent */ }
  if (previous && JSON.stringify(previous.inscrits) === JSON.stringify(inscrits)) {
    core.info("Liste inchangée.");
    return;
  }
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ updated: new Date().toISOString(), inscrits }, null, 2) + "\n");
  core.info(`${inscrits.length} inscription(s) enregistrée(s).`);
};
