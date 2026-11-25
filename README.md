# MS Diapos

L'éditeur de diapos de [MS Creators](https://ms-creators.com). On choisit un modèle, on écrit son texte, on présente — le tout aux couleurs de MS, sans rien connaître au design.

- **Éditeur** : textes à contour épais, étiquettes, cartes, images, formes ; glisser-déposer, guides d'alignement, annuler/rétablir, enregistrement automatique.
- **Bibliothèque d'éléments** : titres, étiquettes (dont les badges doré, cuivré et vert, au texte en dégradé), listes, cartes, photos, stickers, fonds — un clic ou un glisser pour les poser sur la diapo. Tous les textes s'écrivent au double-clic, et les fonds suivent : un badge ou une pastille s'élargit avec son texte, une étiquette ou une carte s'allonge, et ce qui est dessous dans le même bloc descend d'autant. Aucune lettre ne déborde.
- **Modèles** : des diapos et des présentations complètes prêtes à remplir.
- **Exemples** : d'anciennes présentations MS, déposées par le staff (PDF, images, ou présentation faite dans l'app), que tout le monde peut feuilleter page par page et télécharger en PDF — depuis l'accueil comme depuis l'éditeur.
- **Visite guidée** : à la première connexion, un projecteur présente les outils un à un, de l'accueil à l'éditeur, jusqu'au bouton Aide. Elle se relance depuis l'aide ou le bouton « Visite guidée » de l'accueil.
- **Mode invité** : « Essayer sans compte » ouvre l'éditeur sans Discord ; les présentations restent alors dans le navigateur.
- **Connexion Discord** : chacun retrouve ses présentations ; le rôle `@staff` du serveur MS Creators ouvre le **panel admin**, qui permet d'ajouter des éléments à la bibliothèque et de nouveaux modèles.
- **Export** PDF et PNG, **mode présentation** plein écran.

## Lancer en local

```bash
npm install
```

```bash
npm run dev
```

Sans configuration, l'application démarre en **mode démo local** : pas de compte, les présentations restent dans le navigateur, et une case « Simuler le rôle staff » sur l'accueil donne accès au panel admin. C'est le mode utilisé pour développer et pour les tests.

Pour brancher Supabase et Discord, copier `.env.example` en `.env.local` et le remplir.

## Mise en production

L'application est faite pour Vercel (site) et Supabase (comptes, base, fichiers).

### 1. Supabase

1. Créer un projet, puis exécuter **dans l'ordre** les fichiers de `supabase/migrations/` (éditeur SQL du tableau de bord, ou `supabase db push`) :
   - `20261115000000_init.sql` : tables, règles de sécurité, espaces de stockage `library` et `uploads` ;
   - `20261118000000_exemples_et_visite.sql` : rubrique Exemples (table `examples`, espace de stockage `examples`) et mémoire de la visite guidée ;
   - `20261123000000_renommage_pack.sql` : renommage des éléments et modèles du pack de départ (table `builtin_names`) ;
   - `20261124000000_textes_pack.sql` : textes réécrits des éléments du pack de départ (table `builtin_contents`).

   Tous sauf le premier peuvent être relancés sans risque.

   Les fichiers de `supabase/tests/` ne s'exécutent **pas** sur Supabase : ce sont des tests locaux (voir plus bas).
2. **Authentication → Providers → Discord** : activer, coller l'identifiant client et le secret de l'application Discord (étape 2).
3. **Authentication → URL Configuration** : mettre l'adresse du site en *Site URL* et ajouter `https://<ton-site>/**` aux *Redirect URLs* (plus `http://localhost:3000/**` pour le développement).

### 2. Discord

1. Sur le [portail développeur Discord](https://discord.com/developers/applications), créer une application.
2. **OAuth2 → Redirects** : ajouter l'adresse de retour indiquée par Supabase à l'étape précédente, de la forme `https://<ref>.supabase.co/auth/v1/callback`.
3. Copier le *Client ID* et le *Client Secret* dans Supabase.

L'application ne demande à Discord que l'identité (`identify`, `email`) et la lecture des rôles de la personne sur les serveurs dont elle est membre (`guilds.members.read`). Aucun bot n'est nécessaire, aucun message n'est lu ni envoyé.

### 3. Vercel

Importer le dépôt et définir les variables d'environnement de `.env.example` :

| Variable | Rôle |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Adresse du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé secrète, côté serveur uniquement |
| `DISCORD_GUILD_ID` | Identifiant du serveur MS Creators |
| `DISCORD_STAFF_ROLE_ID` | Identifiant du rôle staff (`1371781847557738526`) |

## Comment le rôle staff est vérifié

1. À la connexion, Discord remet au navigateur un jeton qui ne permet que de lire l'identité et les rôles de la personne.
2. Le navigateur l'envoie à `POST /api/discord/sync`. Le serveur interroge Discord avec ce jeton, vérifie qu'il appartient bien au compte connecté, et regarde si le rôle staff figure dans la liste.
3. Le résultat est écrit dans la table `profiles` avec la clé secrète. Les règles de la base interdisent toute écriture de cette table depuis un navigateur : personne ne peut se déclarer staff.
4. Chaque écriture dans la bibliothèque ou les modèles est revérifiée par la base (`is_staff()`), qui exige en plus une vérification datant de **moins de 7 jours**. Quelqu'un qui perd le rôle perd donc l'accès au plus tard une semaine après, ou dès sa prochaine connexion.

Pour retirer l'accès immédiatement : passer `is_staff` à `false` sur sa ligne de `profiles` dans le tableau de bord Supabase.

## Rubrique Exemples

Le staff dépose un exemple depuis l'accueil (« Ajouter un exemple ») ou le panel admin (onglet Exemples), à partir :

- d'un **PDF** (export Figma, Canva, PowerPoint…) : chaque page est convertie en image dans le navigateur de la personne qui dépose, et le PDF d'origine est gardé pour le téléchargement (jusqu'à 50 Mo, le plafond par fichier de l'offre gratuite de Supabase) ;
- d'**images** (une par diapo), rangées dans l'ordre naturel de leurs noms ;
- d'une **présentation faite dans l'app**.

Chaque page est stockée en WebP 1920 px de large plus une miniature, dans l'espace de stockage `examples`, sous un dossier au nom de l'exemple. Supprimer un exemple supprime ses fichiers.

Depuis le panel admin, « Modifier » permet aussi de **réordonner** les pages (glisser, ou flèches), d'en **retirer** et d'en **ajouter** (PDF ou images, à la suite). Dès que les pages changent, le PDF d'origine n'est plus proposé : le téléchargement est alors fabriqué à partir des pages.

## Panel admin : éléments et modèles

**Éditeur de modèles.** Dans l'onglet Modèles, « Modifier » (ou un clic sur la miniature) ouvre le modèle dans l'éditeur de diapos du site : ajouter, retirer, réordonner des diapos, changer textes, images, fonds, tout s'enregistre au fil de l'eau pour tout le monde. Un bandeau violet rappelle qu'on modifie un modèle et permet d'en changer le **type** (une diapo ou une présentation) et la **catégorie** ; « Terminer » (ou le logo) ramène au panel. On peut aussi **créer** un modèle (vierge, ou à partir d'une de ses présentations), le **dupliquer**, le **renommer** et le **supprimer**, et filtrer la liste (diapos, présentations, recherche par nom).

Les modèles du pack de départ sont fournis par l'application : « Modifier » sur l'un d'eux crée une copie modifiable qui prend sa place, au même rang, et met l'original de côté (récupérable en bas de l'onglet). Seul le staff peut ouvrir un modèle dans l'éditeur.

Chaque élément de la bibliothèque et chaque modèle — ceux ajoutés par le staff comme ceux du pack de départ — peut être **renommé** ou **supprimé** pour tout le monde. Les éléments qui contiennent du texte ont aussi un bouton **Textes** : on y réécrit chaque texte du bloc en le tapant, avec un aperçu en direct ; la mise en forme (police, couleurs, mots colorés, position) est conservée. Le pack de départ étant fourni par l'application, un élément du pack supprimé reste récupérable en bas de l'onglet (« supprimés — restaurer »), et un élément renommé peut retrouver son nom d'origine.

La conversion des PDF utilise [pdf.js](https://mozilla.github.io/pdf.js/) : ses fichiers sont copiés dans `public/pdfjs` par `scripts/copy-pdfjs.mjs`, lancé automatiquement après `npm install` et avant `dev`/`build` (le dossier n'est pas versionné).

## Visite guidée

Les étapes sont décrites dans `src/lib/tour.ts` (texte, élément montré, page). Chaque élément montré porte un attribut `data-tour` ou `data-testid` ; une étape dont l'élément est introuvable affiche sa bulle au centre plutôt que de bloquer.

La visite démarre seule tant que le profil n'a pas de date `onboarded_at` ; elle la remplit dès son lancement (fonction `mark_onboarded()`), et garde aussi un repère dans le navigateur pour le mode invité et le mode démo.

## Tests

```bash
npm test
```

Tests unitaires (géométrie du redimensionnement, filtrage du texte, historique, décision de rôle, intégrité du pack de départ).

```bash
npm run test:rls
```

Applique le schéma sur un Postgres local jetable et vérifie les règles de sécurité : qui peut lire, écrire, supprimer quoi. Nécessite PostgreSQL 15 ou plus (`initdb`, `pg_ctl`, `psql`).

```bash
npm run test:e2e
```

Pilote l'application dans Chromium, en mode démo : création, édition, glisser-déposer, modèles, export, présentation, panel admin. Nécessite Playwright et une application qui tourne sur `http://localhost:3000` (ou `E2E_URL`).

Ce script enchaîne `tests/e2e/run.cjs` (tout le parcours, exemples compris), `tests/e2e/tour.cjs` (visite guidée) et `tests/e2e/responsive.cjs` (chaque élément de la bibliothèque reçoit un texte long : rien ne doit sortir de son fond ni de sa carte, ni recouvrir un autre texte). `tests/e2e/guest.cjs` vérifie le mode invité ; son en-tête explique comment le lancer (il lui faut une application construite avec les variables Supabase).

## Organisation du code

```
src/
  app/                    pages (accueil, éditeur, modèle, admin) et route /api/discord/sync
  components/
    slide/SlideView.tsx   LE rendu d'une diapo : éditeur, miniatures, présentation et export l'utilisent tous
    editor/               zone de travail, barre d'outils, panneaux, modèles, présentation
    examples/             rubrique Exemples : cartes, visionneuse, dépôt
    tour/                 visite guidée (projecteur et bulles)
    admin/                panel admin et formulaires du staff
    home/                 connexion et liste des présentations
  lib/
    types.ts              modèle de données (diapos, éléments, bibliothèque)
    editor/store.ts       état de l'éditeur : sélection, historique, presse-papiers
    geometry.ts           redimensionnement, rotation, magnétisme
    text.ts               format du texte et filtrage (rien d'autre que des lignes et des mots colorés)
    starter.ts            pack de départ : éléments et modèles tirés des diapos MS
    backend/              accès aux données : Supabase en production, navigateur en mode démo
    server/discord.ts     décision « staff ou non » à partir de la réponse de Discord
    export.tsx            export PDF / PNG
    examples.ts           conversion PDF / images / présentation en pages d'exemple
    tour.ts               étapes de la visite guidée ; tour-layout.ts : placement des bulles
supabase/
  migrations/             schéma, règles de sécurité, stockage
  tests/                  tests des règles de sécurité
public/
  fonts/                  polices (licences libres, voir public/fonts/LICENCES.md)
  library/                logo, stickers et fonds du pack de départ
```

Toutes les coordonnées d'une diapo sont exprimées dans un repère fixe de 1920 × 1080 ; l'affichage n'est qu'une mise à l'échelle. C'est ce qui garantit que l'export est identique à ce qu'on voit dans l'éditeur.

Les textes se mesurent dans l'éditeur et leur taille réelle est enregistrée (`applyMeasure` dans `geometry.ts`) : un texte à hauteur fixée garde cette hauteur comme minimum (`minH`), un texte qui suit son contenu (`hug`, badges et pastilles) garde sa largeur d'origine comme minimum (`minW`) et s'élargit depuis son centre ou son bord selon l'alignement. Dans un groupe, la forme qui contient le texte s'allonge et les éléments placés dessous descendent ; c'est pourquoi les blocs de textes empilés de la bibliothèque sont groupés.

## Ajouter au pack de départ

Le staff ajoute éléments et modèles depuis le panel admin, sans toucher au code. Le pack fourni avec l'application, lui, vit dans `src/lib/starter.ts` ; `npm test` vérifie que chaque fichier référencé existe et que chaque modèle tient dans le cadre.
