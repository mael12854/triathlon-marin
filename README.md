# Le triathlon de Marin 🏊 🚲 🏃

Le site de Marin (6 ans) pour son triathlon du **dimanche 18 octobre** à Issy-les-Moulineaux,
avec l'inscription des supporters. Tout tourne sur **GitHub uniquement** : pas de serveur, pas de Supabase.

- `docs/` : le site (HTML/CSS/JS, sans outil de build)
- `docs/data/inscrits.json` : la « base de données » des inscrits, tenue à jour automatiquement
- `.github/ISSUE_TEMPLATE/inscription.yml` : le formulaire d'inscription GitHub
- `.github/workflows/inscriptions.yml` + `.github/scripts/inscriptions.js` : le robot qui range les inscriptions


## Comment ça marche

1. Sur le site, un proche remplit le formulaire « Je viens encourager Marin ».
2. Une page GitHub s'ouvre avec une issue déjà remplie : il clique sur **Create**.
3. Une GitHub Action lit l'issue, répond « Merci », et ajoute la personne dans `docs/data/inscrits.json`.
4. Le site relit ce fichier : le prénom apparaît dans la liste en 1 à 5 minutes.

> Il faut un compte GitHub (gratuit) pour s'inscrire. Les issues sont publiques :
> le formulaire ne demande qu'un prénom, un nombre de personnes, le lieu et un petit mot.

## Mise en ligne (une seule fois)

1. Pousser ce repo sur GitHub. Il doit être **public** (GitHub Pages gratuit + inscriptions ouvertes à tous).
2. **Settings → Pages** : *Source* = « Deploy from a branch », branche `main`, dossier `/docs`.
3. **Settings → Actions → General → Workflow permissions** : cocher « Read and write permissions ».
4. Le site est en ligne sur `https://<votre-compte>.github.io/<nom-du-repo>/`.

Le compte et le repo sont devinés depuis l'adresse du site. Pour un nom de domaine perso,
ou une branche autre que `main`, remplir `docs/config.js`.

Option : dans `docs/config.js`, mettre une adresse dans `contactEmail` pour afficher un lien
« Pas de compte GitHub ? Envoyez-nous un e-mail ».

## Gérer les inscriptions

- **Voir la liste** : onglet *Issues* (label `inscription`), ou le fichier `docs/data/inscrits.json`.
- **Retirer quelqu'un** (doublon, spam) : fermer son issue avec **Close as not planned**, ou lui mettre le label `spam`.
- **Modifier** : l'auteur (ou vous) modifie le texte de l'issue ; la liste suit.
- **Tout recalculer** : onglet *Actions* → « Inscriptions » → *Run workflow*.

## Tester en local

```sh
python3 -m http.server -d docs 8000
# puis ouvrir http://localhost:8000
```
