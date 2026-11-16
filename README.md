# MS Diapos

L'éditeur de diapos de [MS Creators](https://ms-creators.com). On choisit un modèle, on écrit son texte, on présente — le tout aux couleurs de MS, sans rien connaître au design.

- **Éditeur** : textes à contour épais, étiquettes, cartes, images, formes ; glisser-déposer, guides d'alignement, annuler/rétablir, enregistrement automatique.
- **Bibliothèque d'éléments** : titres, étiquettes, listes, cartes, photos, stickers, fonds — un clic ou un glisser pour les poser sur la diapo.
- **Modèles** : des diapos et des présentations complètes prêtes à remplir.
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

1. Créer un projet, puis exécuter `supabase/migrations/20261115000000_init.sql` (éditeur SQL du tableau de bord, ou `supabase db push`). Le script crée les tables, les règles de sécurité et les deux espaces de stockage (`library`, `uploads`).
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

## Organisation du code

```
src/
  app/                    pages (accueil, éditeur, modèle, admin) et route /api/discord/sync
  components/
    slide/SlideView.tsx   LE rendu d'une diapo : éditeur, miniatures, présentation et export l'utilisent tous
    editor/               zone de travail, barre d'outils, panneaux, modèles, présentation
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
supabase/
  migrations/             schéma, règles de sécurité, stockage
  tests/                  tests des règles de sécurité
public/
  fonts/                  polices (licences libres, voir public/fonts/LICENCES.md)
  library/                logo, stickers et fonds du pack de départ
```

Toutes les coordonnées d'une diapo sont exprimées dans un repère fixe de 1920 × 1080 ; l'affichage n'est qu'une mise à l'échelle. C'est ce qui garantit que l'export est identique à ce qu'on voit dans l'éditeur.

## Ajouter au pack de départ

Le staff ajoute éléments et modèles depuis le panel admin, sans toucher au code. Le pack fourni avec l'application, lui, vit dans `src/lib/starter.ts` ; `npm test` vérifie que chaque fichier référencé existe et que chaque modèle tient dans le cadre.
