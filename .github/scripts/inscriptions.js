// Recrée les listes du site à partir des issues GitHub :
//   - label « inscription » → docs/data/inscrits.json   (supporters)
//   - label « avec-marin »  → docs/data/avec-marin.json (ceux qui font le triathlon avec Marin)
// Pour retirer quelqu'un : bouton « Retirer » de l'admin, ou fermer son issue
// en « Close as not planned », ou lui mettre le label « spam ».
const fs = require("fs");
const path = require("path");

const { toEntry, toAvecEntry, isRemoved } = require("../../lib/inscription.js");

const KINDS = [
  {
    label: "inscription",
    prefix: /^\[Inscription\]/i,
    color: "f0a050",
    description: "Supporter inscrit sur le site",
    file: path.join(process.cwd(), "docs", "data", "inscrits.json"),
    key: "inscrits",
    toEntry,
    thanks: "Merci, c'est noté ! Votre prénom apparaîtra sur le site d'ici quelques minutes. Allez Marin ! 🏊 🚲 🏃",
  },
  {
    label: "avec-marin",
    prefix: /^\[Avec Marin\]/i,
    color: "4cbb73",
    description: "Fait le triathlon avec Marin",
    file: path.join(process.cwd(), "docs", "data", "avec-marin.json"),
    key: "inscrits",
    toEntry: toAvecEntry,
    thanks: "Génial, c'est noté ! Votre prénom apparaîtra sur le site d'ici quelques minutes. C'est sans engagement : si vous êtes absent le jour J, ce n'est pas grave. 🏊 🚲 🏃",
  },
];

async function sync(kind, { github, context, core }) {
  const { owner, repo } = context.repo;
  const ev = context.payload;
  const isEventIssue = context.eventName === "issues" && kind.prefix.test(ev.issue.title);

  // Nouvelle inscription : on s'assure qu'elle a le label, et on dit merci.
  if (isEventIssue && ev.action === "opened") {
    try {
      await github.rest.issues.getLabel({ owner, repo, name: kind.label });
    } catch {
      await github.rest.issues.createLabel({ owner, repo, name: kind.label, color: kind.color, description: kind.description });
    }
    if (!ev.issue.labels.some((l) => l.name === kind.label)) {
      await github.rest.issues.addLabels({ owner, repo, issue_number: ev.issue.number, labels: [kind.label] });
    }
    await github.rest.issues.createComment({ owner, repo, issue_number: ev.issue.number, body: kind.thanks });
  }

  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner, repo, labels: kind.label, state: "all", per_page: 100,
  });

  // L'issue qui vient d'arriver peut ne pas encore apparaître dans la recherche.
  if (isEventIssue && ev.action !== "deleted" && !issues.some((i) => i.number === ev.issue.number)) {
    issues.push(ev.issue);
  }
  const deleted = context.eventName === "issues" && ev.action === "deleted" ? ev.issue.number : null;

  const list = issues
    .filter((i) => !i.pull_request && !isRemoved(i) && i.number !== deleted)
    .map(kind.toEntry)
    .filter(Boolean)
    .sort((a, b) => a.id - b.id);

  // Ne réécrit le fichier que si la liste a changé.
  let previous = null;
  try { previous = JSON.parse(fs.readFileSync(kind.file, "utf8")); } catch { /* fichier absent */ }
  if (previous && JSON.stringify(previous[kind.key]) === JSON.stringify(list)) {
    core.info(`${kind.label} : liste inchangée.`);
    return;
  }
  fs.mkdirSync(path.dirname(kind.file), { recursive: true });
  fs.writeFileSync(kind.file, JSON.stringify({ updated: new Date().toISOString(), [kind.key]: list }, null, 2) + "\n");
  core.info(`${kind.label} : ${list.length} inscription(s) enregistrée(s).`);
}

module.exports = async (ctx) => {
  for (const kind of KINDS) await sync(kind, ctx);
};
