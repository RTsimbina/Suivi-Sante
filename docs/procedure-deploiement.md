# Procédure de déploiement sécurisée — Suivi Santé

> Principe fondamental : **un simple `npm run build` ne modifie jamais la base de production.**
> Le build construit l'application ; les modifications de la base passent exclusivement par
> des migrations Prisma appliquées de façon contrôlée, après sauvegarde.

## Vue d'ensemble

```
DÉVELOPPEMENT                INTÉGRATION / RECETTE              PRODUCTION
─────────────                ─────────────────────              ──────────
Code                         Nouvelle version (push/PR)         Sauvegarde BDD
 ↓                            ↓                                  ↓
Tests (vitest)               Tests automatiques (CI)            Validation de la migration
 ↓                            ↓                                  ↓
prisma migrate dev           Migration sur BDD de recette       prisma migrate deploy
 ↓                            ↓                                  ↓
Tests fonctionnels           Tests utilisateurs                 Déploiement de l'application
                                                                ↓
                                                                Tests de fonctionnement
```

Chaque étape est détaillée ci-dessous avec les commandes exactes.

---

## 1. Développement

| Étape | Commande | Détail |
|---|---|---|
| Code | — | Modifier `prisma/schema.prisma` et/ou le code applicatif |
| Tests | `npm run test` | Suite Vitest — doit passer à 100 % |
| Migration locale | `npm run db:migrate` | `prisma migrate dev` crée le fichier SQL dans `prisma/migrations/` et l'applique en local |
| Tests fonctionnels | — | Vérifier les écrans touchés sur `npm run dev` |

**Règles :**
- Le fichier de migration créé par `prisma migrate dev` est **commité avec le schéma** — c'est lui qui sera rejoué en recette puis en production.
- Ne jamais utiliser `prisma db push` en dehors du prototypage rapide local : il ne laisse aucune trace rejouable.
- Ne jamais éditer une migration déjà appliquée en recette/production ; créer une nouvelle migration pour corriger.

## 2. Intégration / recette

La recette utilise **une base distincte** de la production (suggestion : une branche Neon dédiée, ou un second projet). Son URL n'est **jamais** celle de la production.

| Étape | Commande | Détail |
|---|---|---|
| Nouvelle version | `git push origin main` (ou PR) | Déclenche la CI (voir `.github/workflows/ci.yml`) |
| Tests automatiques | CI : vitest + `tsc` + build | Le build de CI tourne **sans base de données** |
| Migration recette | `DATABASE_URL="<url recette>" npm run db:migrate:deploy` | Applique uniquement les migrations en attente |
| Tests utilisateurs | `docs/checklist-deploiement.md` | Parcours métier complets sur la version de recette |

**Critère de passage en production :** CI verte + migration recette appliquée sans erreur + checklist utilisateurs sans anomalie bloquante.

## 3. Production

Tout le pipeline est automatisé dans un script unique :

```bash
PROD_DATABASE_URL="postgresql://..." bash scripts/deploy-production.sh
```

Le script enchaîne, dans cet ordre strict :

| # | Étape | Garantie |
|---|---|---|
| 1 | Prérequis | URL prod **explicite** (jamais le `.env`), `pg_dump` présent, dépôt propre |
| 2 | Tests automatiques | `npm run test` + `npx tsc --noEmit` doivent passer |
| 3 | État des migrations | `prisma migrate status` affiché AVANT toute action |
| 4 | **Sauvegarde BDD** | `pg_dump` vérifié (lisibilité + taille), horodaté dans `backups/` |
| 5 | **Validation humaine** | Confirmation `OUI` requise après lecture des migrations en attente |
| 6 | `prisma migrate deploy` | Applique uniquement les migrations en attente |
| 7 | Vérification post-migration | `prisma migrate status` doit être « up to date » |
| 8 | Build de l'application | Lancé avec une URL factice — toute connexion base au build ferait échouer le déploiement |
| 9 | Tests de fonctionnement | Rappel de la checklist à exécuter immédiatement |

Options : `SKIP_TESTS=1`, `SKIP_BUILD=1` (déploiement Vercel : le build y est refait), `AUTO_APPROVE=1` (réservé à la CI).

### Pourquoi la sauvegarde est obligatoire

La base contient les données vitales de l'activité :
sociétés, assurés, bénéficiaires, dossiers, prestations, remboursements, budgets, appels de fonds.
Si une migration se passe mal, la sauvegarde horodatée de l'étape 4 est le moyen de récupération :

```bash
# Restauration d'urgence (destructive, demande confirmation par saisie du nom de base)
DATABASE_URL="postgresql://..." bash scripts/restore-db.sh backups/suivi-sante-YYYYMMDD-HHMMSS.dump
```

Rétention par défaut : 10 sauvegardes (`KEEP=10` dans `backup-db.sh`). Conservez la sauvegarde
de chaque déploiement jusqu'à validation complète de la checklist de fonctionnement.

### Déploiement manuel (sans le script)

Si le pipeline ne peut pas être utilisé, exécuter au minimum dans cet ordre :

```bash
DATABASE_URL="<url prod>" bash scripts/backup-db.sh     # 1. sauvegarde
DATABASE_URL="<url prod>" npm run db:migrate:status     # 2. lire les migrations en attente
# 3. valider le contenu des migrations (fichiers SQL de prisma/migrations/)
DATABASE_URL="<url prod>" npm run db:migrate:deploy     # 4. appliquer
npm run build                                           # 5. construire (sans effet sur la base)
# 6. exécuter la checklist de fonctionnement
```

## 4. Outils associés

| Commande | Rôle |
|---|---|
| `npm run db:backup` | Sauvegarde vérifiée (`backups/`, rétention 10) |
| `npm run db:restore` | Restauration d'urgence (destructive) |
| `npm run deploy:prod` | Pipeline production complet (sauvegarde + validation + migration + build) |
| `npm run db:migrate:status` | État des migrations (recette ou prod selon l'URL fournie) |
| `npm run db:migrate:deploy` | Application des migrations en attente |
| `npm run db:baseline` | Adoption one-shot de la chaîne de migrations sur la base Neon existante |

> **Sécurité des URLs** : ne jamais commiter d'URL de base (mot de passe inclus). Toujours passer
> par des variables d'environnement. Pour Neon, utiliser la connexion **directe** (sans `-pooler`)
> pour les migrations, et la connexion poolée pour l'application.
