# Le triathlon de Marin 🏊 🚲 🏃

Le site du **3e triathlon** de Marin (date à venir) à Issy-les-Moulineaux, avec l'inscription des supporters
et de ceux qui font le triathlon avec lui. Les triathlons précédents sont dans `/anciens`.
Tout tourne sur **GitHub** et **Vercel** : pas de serveur à gérer.

- `docs/` : le site (HTML/CSS/JS, sans outil de build)
- `docs/data/inscrits.json` : la « base de données » des inscrits, tenue à jour automatiquement
- `.github/ISSUE_TEMPLATE/inscription.yml` : le formulaire d'inscription des supporters
- `.github/ISSUE_TEMPLATE/avec-marin.yml` : le formulaire « faire le triathlon avec Marin »
- `docs/data/avec-marin.json` : ceux qui font le triathlon avec Marin (tenu à jour automatiquement)
- `.github/workflows/inscriptions.yml` + `.github/scripts/inscriptions.js` : le robot qui range les inscriptions


## Comment ça marche

Deux inscriptions sur le site :
- **Supporters** (« Je viens encourager Marin ») : prénom, nombre de personnes, lieu, petit mot.
- **Avec Marin** (« Fais le triathlon avec moi ») : prénom, épreuves (nage, vélo et/ou course), petit mot.
  Sans engagement : une absence le jour J n'est pas grave.

Les deux fonctionnent pareil :

1. Sur le site, la personne remplit le formulaire.
2. Une page GitHub s'ouvre avec une issue déjà remplie : il clique sur **Create**.
3. Une GitHub Action lit l'issue, répond « Merci », et ajoute la personne dans `docs/data/inscrits.json` ou `docs/data/avec-marin.json`.
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

## Triathlon en cours (3e)

- **Date** : dans `docs/config.js` (`date: "2027-06-13"` par exemple) pour le compte à rebours et le bouton
  agenda, et dans `docs/index.html` (rubrique « Rendez-vous » et bas de page) pour le texte affiché.
  Tant qu'elle est vide, le site affiche « Date à venir ».
- **Listes** : seules les inscriptions créées après `DEPUIS` (dans `.github/scripts/inscriptions.js`)
  comptent ; celles du 2e triathlon restent dans GitHub et dans l'archive.

## Page 404

`docs/404.html` s'affiche pour toute adresse qui n'existe pas (chemins absolus, elle marche partout).

## Anciens triathlons : `/anciens`

- `docs/anciens/index.html` : la page qui liste les anciens triathlons.
- `docs/anciens/2e-triathlon/` : copie figée du site du 2e triathlon (18 octobre 2026), avec ses propres
  photos, styles et données (supporters, sac). Elle ne dépend plus du reste : on peut modifier la page
  d'accueil pour le triathlon suivant sans la casser.

Pour archiver un triathlon : copier `docs/` (sans `admin/` ni `anciens/`) dans `docs/anciens/<nom>/`,
y figer les fichiers de `data/`, mettre `archive: true` dans son `config.js`, et retirer
les formulaires (`<form>`) et la fenêtre `<dialog id="sent">` de son `index.html` : on ne peut plus s'inscrire
à un ancien triathlon. Ensuite, sur la page d'accueil : nouveaux textes, `date` dans `config.js`, et
`DEPUIS` mis à la date du jour dans `.github/scripts/inscriptions.js` pour repartir de listes vides.

## Espace admin : `/admin`

https://triathlon-marin.vercel.app/admin/ — protégé par un code d'accès.

- **Tableau de bord** : chiffres clés et graphiques (personnes par lieu, inscriptions dans le temps, taille des groupes, derniers petits mots).
- **Supporters** et **Avec Marin** : les listes complètes, avec « Retirer » / « Remettre ».
- **Le sac** : modifier la liste à cocher du site.
- **Réglages** : ouvrir/fermer chaque inscription, annonce en haut du site, e-mail pour ceux sans compte GitHub.

Le contenu de la présentation (textes, photos, dates) ne se modifie pas depuis l'admin.

À configurer une fois dans Vercel (aucune clé GitHub à créer) :

1. `ADMIN_CODE` dans *Settings → Environment Variables* : le code d'accès (déjà fait).
2. Un stockage **Blob** relié au projet : onglet *Storage* → *Create Database* → *Blob* → *Connect*
   (public ou privé, les deux marchent). Vercel ajoute tout seul les variables `BLOB_…`.
3. *Deployments* → *…* → *Redeploy*.

Sans le stockage Blob, l'admin fonctionne en lecture seule.

Les réglages (sac, annonce, inscriptions ouvertes, personnes retirées) sont gardés dans Vercel Blob ;
`docs/data/reglages.json` sert de valeurs par défaut. Fichiers : `docs/admin/` (la page),
`api/admin.js` et `api/reglages.js` (fonctions Vercel), `lib/store.js` (stockage),
`lib/inscription.js` (lecture des issues, utilisé par l'Action GitHub).

## Gérer les inscriptions

- **Le plus simple** : l'espace admin ci-dessus.
- **Voir la liste** : onglet *Issues* (label `inscription`), ou le fichier `docs/data/inscrits.json`.
- **Retirer quelqu'un** (doublon, spam) : bouton « Retirer » dans l'admin. Sur GitHub, fermer l'issue avec **Close as not planned** marche aussi.
- **Modifier** : l'auteur (ou vous) modifie le texte de l'issue ; la liste suit.
- **Tout recalculer** : onglet *Actions* → « Inscriptions » → *Run workflow*.
