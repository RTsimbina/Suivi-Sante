# Suivi Santé

Application de gestion de mutuelle/santé d'entreprise : dossiers, assurés, contrats, plafonds, remboursements et appels de fonds.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Prisma 6 · PostgreSQL (Neon) · NextAuth · Tailwind 4

## Démarrage (développement)

```bash
npm install
npm run dev          # http://localhost:3000
```

## Build et base de données : deux choses séparées

> **Important** : le build de production ne modifie **jamais** la structure de la base.
> Un build ne fait que construire l'application ; les modifications de la base passent
> exclusivement par des migrations Prisma appliquées de façon contrôlée.

| Étape | Commande | Rôle |
|---|---|---|
| Générer le client Prisma | `npx prisma generate` | Génère le client nécessaire à l'application (automatique au `npm install` et au build) |
| Construire l'application | `npm run build` | `prisma generate && next build` — ne touche pas à la base |
| Créer une migration (dev) | `npm run db:migrate` | `prisma migrate dev` : crée/teste une migration depuis `schema.prisma` |
| Appliquer les migrations (prod) | `npm run db:migrate:deploy` | `prisma migrate deploy` : applique uniquement les migrations en attente |
| Voir l'état des migrations | `npm run db:migrate:status` | Liste les migrations appliquées / en attente |

`prisma generate` (client) et `prisma db push`/`migrate` (structure de la base) n'ont pas le même rôle.
Le workflow attendu est :

```
Développeur → modification de prisma/schema.prisma → npm run db:migrate (création + tests)
→ validation → déploiement de la migration en production (db:migrate:deploy) → déploiement de l'application
```

## Processus de déploiement (production)

1. **Appliquer les migrations en attente** : `DATABASE_URL="..." npm run db:migrate:deploy`
2. **Déployer l'application** : le build (`npm run build`) n'a plus besoin d'un accès à la base.

### Adoption de la chaîne de migrations sur une base existante

La base de production a historiquement été maintenue via `prisma db push`. Pour l'adosser
à la chaîne de migrations **sans ré-exécuter le SQL** (les tables existent déjà), exécutez
**une seule fois** :

```bash
DATABASE_URL="postgresql://..." npm run db:baseline
```

Le script vérifie d'abord la cohérence base ↔ schéma (`prisma migrate diff`), enregistre
ensuite la migration `20260904000000_baseline_postgresql` comme déjà appliquée
(`prisma migrate resolve --applied`), puis affiche l'état final. Les migrations
**futures**, elles, seront appliquées réellement par `npm run db:migrate:deploy`.

## Scripts utilitaires

| Commande | Rôle |
|---|---|
| `npm run db:seed` | Injecte les données de test (`prisma/seed.ts`) |
| `npm run db:reset` | Réinitialise la base de développement (`prisma migrate reset`) |
| `npm run test` | Suite de tests (Vitest) |
