// Recrée docs/data/inscrits.json à partir des issues "inscription".
// Pour retirer quelqu'un : fermer son issue en « Close as not planned »,
// ou lui mettre le label « spam ».
const fs = require("fs");
const path = require("path");

const LABEL = "inscription";
const FILE = path.join(process.cwd(), "docs", "data", "inscrits.json");

const { toEntry, isRemoved } = require("../../lib/inscription.js");

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
