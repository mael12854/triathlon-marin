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

## Mise en ligne

Le site est hébergé sur **Vercel** : https://triathlon-marin.vercel.app
(`vercel.json` lui dit de servir le dossier `docs/`). Chaque push sur `main` le met à jour ;
les commits du robot qui ne touchent que `docs/data/` ne relancent pas de déploiement,
car le site lit la liste des inscrits directement sur GitHub.

Réglage obligatoire côté GitHub (une seule fois) :
**Settings → Actions → General → Workflow permissions** : cocher « Read and write permissions ».

Le repo doit rester **public** pour que le site puisse lire la liste des inscrits.
Le compte et le repo GitHub sont indiqués dans `docs/config.js`.

Option : dans `docs/config.js`, mettre une adresse dans `contactEmail` pour afficher un lien
« Pas de compte GitHub ? Envoyez-nous un e-mail ».

## Espace admin : `/admin`

https://triathlon-marin.vercel.app/admin/ — protégé par un code d'accès.

- **Tableau de bord** : chiffres clés et graphiques (personnes par lieu, inscriptions dans le temps, taille des groupes, derniers petits mots).
- **Inscrits** : la liste complète, avec « Retirer » / « Remettre ».
- **Le sac** : modifier la liste à cocher du site.
- **Réglages** : ouvrir/fermer les inscriptions, annonce en haut du site, e-mail pour ceux sans compte GitHub.

Le contenu de la présentation (textes, photos, dates) ne se modifie pas depuis l'admin.

Variables à définir dans Vercel (*Settings → Environment Variables*) :

| Nom | Rôle |
|---|---|
| `ADMIN_CODE` | le code d'accès à l'admin (déjà défini) |
| `GITHUB_TOKEN` | clé GitHub *fine-grained*, limitée au repo `triathlon-marin`, permissions **Contents** et **Issues** en « Read and write ». Sans elle, l'admin est en lecture seule. |

Après avoir ajouté ou changé une variable : *Deployments → … → Redeploy*.

Les réglages sont enregistrés dans `docs/data/reglages.json`. Fichiers de l'admin :
`docs/admin/` (la page), `api/admin.js` (la fonction Vercel), `lib/inscription.js` (lecture des issues, partagée avec l'Action).

## Gérer les inscriptions

- **Le plus simple** : l'espace admin ci-dessus.
- **Voir la liste** : onglet *Issues* (label `inscription`), ou le fichier `docs/data/inscrits.json`.
- **Retirer quelqu'un** (doublon, spam) : fermer son issue avec **Close as not planned**, ou lui mettre le label `spam`.
- **Modifier** : l'auteur (ou vous) modifie le texte de l'issue ; la liste suit.
- **Tout recalculer** : onglet *Actions* → « Inscriptions » → *Run workflow*.

## Tester en local

```sh
python3 -m http.server -d docs 8000
# puis ouvrir http://localhost:8000
```
