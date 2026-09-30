# Contribuer à Suivi Santé

Merci de l'intérêt porté au projet ! Ce document décrit la mise en place
locale, les règles d'or du dépôt et le processus de contribution. Lisez-le
avant d'ouvrir une pull request — la CI et le mainteneur s'attendent à ce que
ses exigences soient respectées.

## Stack technique

Next.js 16 (App Router) · React 19 · TypeScript · Prisma 6 · PostgreSQL
(Neon) · NextAuth · Tailwind 4 · Vitest · shadcn/ui

## Mise en place locale

1. Node.js 22 et npm ;
2. `npm install` — le client Prisma est généré automatiquement (`postinstall`) ;
3. Créer `.env.local` avec au minimum `DATABASE_URL` (base de développement)
   et les variables d'authentification — **ne jamais commiter ce fichier** ;
4. `npm run dev` puis ouvrir <http://localhost:3000> ;
5. Données de démonstration : `npm run db:seed`.

## Règles d'or du dépôt

1. **Le build ne touche jamais la base.** `npm run build` construit
   uniquement l'application ; toute modification de structure passe par une
   migration Prisma (`prisma/migrations/`) appliquée de façon contrôlée. La
   CI le vérifie : le build s'exécute avec une `DATABASE_URL` volontairement
   factice, et échoue si l'application tente d'y accéder.
2. **Migrations avant code.** Si votre PR modifie `prisma/schema.prisma`, la
   migration correspondante doit être appliquée en production **avant** le
   déploiement du code (workflow « Migration base de données » ou
   `npm run db:migrate:deploy`), sinon on livre un code référençant un
   schéma absent.
3. **Migrations autosuffisantes.** Chaque `migration.sql` doit pouvoir être
   rejoué proprement : `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT
   EXISTS`, gardes `DO $$ … $$` pour les contraintes — aucune dépendance à
   un `db push` préalable.
4. **Secrets.** Jamais de valeur de secret dans le code, les tests, les
   fixtures ou les journaux. Voir [SECURITY.md](SECURITY.md).
5. **Isolation multi-sociétés.** Toute route API exposant des données métier
   doit respecter l'isolation par société et le contrôle par rôle ; des tests
   dédiés vérifient la non-fuite entre sociétés.
6. **Audit.** Les actions sensibles (création, modification, suppression sur
   les entités métier) doivent être journalisées dans la table d'audit,
   immuable par déclencheur de base.

## Commandes de développement

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement (<http://localhost:3000>) |
| `npm run test` | Suite de tests Vitest |
| `npm run test:watch` | Vitest en mode watch |
| `npx tsc --noEmit` | Vérification TypeScript sans émission |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Créer / tester une migration en développement |
| `npm run db:migrate:status` | État des migrations sur la base courante |
| `npm run db:backup` / `db:restore` | Sauvegarde / restauration d'urgence |

### Exigences avant toute pull request

- `npm run test` : 0 échec (la suite compte plus de 660 tests) ;
- `npx tsc --noEmit` : 0 erreur ;
- toute nouvelle fonctionnalité ou correction s'accompagne de nouveaux tests
  (routes API, schémas Zod de validation, composants selon le cas) ;
- pas de `console.log` résiduel ni de code commenté mort.

## Conventions de commit

Format : `type(scope): description` — en français, sans point final.

| Type | Usage |
|---|---|
| `feat` | nouvelle fonctionnalité |
| `fix` | correction de bug |
| `docs` | documentation seule |
| `refactor` | réorganisation sans changement de comportement |
| `test` | ajout ou correction de tests |
| `chore` | CI, dépendances, tooling |

Exemples tirés de l'historique du dépôt :

- `feat(prestataires): exception doublons validée Administrateur + code/IBAN/groupes + audit enrichi`
- `fix(migrate): liberation du verrou consultatif P1002 dans le workflow [skip deploy]`

Suffixe `[skip deploy]` : à ajouter quand le commit ne doit pas déclencher de
déploiement Vercel (migrations en attente d'application, changements de CI ou
de documentation sans impact applicatif).

## Branches et pull requests

1. Brancher depuis `main` : `feat/<sujet>`, `fix/<sujet>`, `docs/<sujet>` ;
2. Ouvrir la PR vers `main` en remplissant le modèle de pull request ;
3. La CI doit être verte (Vitest + TypeScript + build isolé de la base) ;
4. Relecture par le mainteneur avant fusion.

## Ouvrir une issue

Trois modèles sont disponibles :

- **Rapport de bug** — comportement incorrect ou inattendu ;
- **Demande de fonctionnalité** — amélioration ou nouvelle capacité ;
- **Incident** — indisponibilité ou dégradation d'exploitation.

Les incidents détectés par le workflow Healthcheck sont ouverts
automatiquement avec le préfixe `[Incident]` : commentez l'issue existante
plutôt que d'en ouvrir une nouvelle en double.

## Déploiement en production

Se référer à [docs/procedure-deploiement.md](docs/procedure-deploiement.md)
et [docs/checklist-deploiement.md](docs/checklist-deploiement.md). En
résumé : sauvegarde de la base, application des migrations, puis déploiement
de l'application — jamais l'inverse.
