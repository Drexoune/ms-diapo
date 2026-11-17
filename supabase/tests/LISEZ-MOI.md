# Tests des règles de sécurité — à lancer en local uniquement

Ces fichiers **ne s'exécutent pas sur Supabase**. Ils recréent, sur un Postgres local jetable, le strict nécessaire de Supabase (rôles, `auth.uid()`, stockage), appliquent le schéma, puis vérifient qui peut lire, écrire et supprimer quoi.

```bash
npm run test:rls
```

Le seul script à exécuter sur un projet Supabase est `supabase/migrations/20261115000000_init.sql`.
