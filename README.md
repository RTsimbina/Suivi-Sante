# Suivi Santé

Application de gestion de mutuelle/santé d'entreprise : dossiers, assurés, contrats,
plafonds, remboursements et appels de fonds — avec portails client et prestataire,
assistant IA à questions prédéfinies et bot de suivi multi-canaux.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Prisma 6 · PostgreSQL (Neon) · NextAuth · Tailwind 4 · Vitest

## Périmètre fonctionnel

| Module | Contenu |
|---|---|
| Référentiels | Sociétés clientes, prestataires (annuaire, groupes, liaison sociétés ↔ prestataires, exceptions de doublons), assurés et bénéficiaires |
| Dossiers et suivis | Réception, analyse, kanban, affectation en masse, commentaires, justificatifs, détection de doublons, numérotation automatique |
| Contrats / appels de fonds | Contrats par société, appels de fonds et modes de calcul, suivi budgétaire |
| Service technique | Barèmes par société (taux de couverture, plafonds), exclusions, calcul du ticket modérateur, imports ISA |
| Comptabilité | Imports Sage, import de suivi, vérification et paiement des dossiers |
| Santé | Vérification d'assuré, consultation des actes, simulation de remboursement |
| Messagerie | Service d'envoi centralisé (file d'attente en base), réception de courriels, rapports mensuels |
| Reporting / tableaux de bord | KPI, rapports par société, exports, journal d'activité |
| Assistant IA | Questions prédéfinies par rôle, analyse prédictive, bot multi-canaux — voir « Rôle de l'IA dans la plateforme » |
| Sécurité / comptes utilisateurs | Utilisateurs, rôles, verrouillage de session, historique des paramètres, audit |
| Portails | Portail client/assuré et portail prestataire (tableaux de bord, actes, barèmes, factures) |

## Rôles utilisateurs et isolation des données

Huit rôles, deux mondes — le personnel interne voit l'ensemble de la plateforme,
les rôles externes sont bornés à leur propre périmètre :

| Rôle | Libellé | Périmètre |
|---|---|---|
| `ADMINISTRATEUR` | Administrateur | Interne — accès global |
| `ACCUEIL` | Accueil | Interne — accès global |
| `TECHNIQUE` | Service Technique | Interne — accès global |
| `COMPTABILITE` | Comptabilité | Interne — accès global |
| `SANTE` | Contrôle Santé | Interne — accès global |
| `PORTAIL_CLIENT` | Client / Assuré | Externe — uniquement ses propres données |
| `CONTACT_ENTREPRISE` | Entreprise Cliente | Externe — uniquement les assurés de sa société |
| `PRESTATAIRE` | Prestataire | Externe — uniquement ses sociétés conventionnées |

- L'isolation multi-sociétés est appliquée **côté serveur** (`src/lib/data-isolation.ts`,
  `src/lib/authorize.ts`) : le périmètre provient du jeton NextAuth signé, jamais du client.
- Toute opération sensible est journalisée dans des tables d'audit rendues **immuables**
  par déclencheurs en base (UPDATE/DELETE interdits).

## Démarrage (développement)

```bash
npm install
npm run dev          # http://localhost:3000
```

## Build et base de données : deux choses séparées

> **Important** : les modifications de la structure de la base passent **exclusivement**
> par des migrations Prisma versionnées, appliquées de façon contrôlée. Jamais de
> `db push` en production, jamais de schéma improvisé au build. L'ordre attendu reste
> **migration d'abord, application ensuite**.

| Étape | Commande | Rôle |
|---|---|---|
| Générer le client Prisma | `npx prisma generate` | Génère le client nécessaire à l'application (automatique au `npm install` et au build) |
| Construire l'application | `npm run build` | `prisma generate` → tentative tolérante de `prisma migrate deploy` (simple avertissement si base injoignable, comme en CI) → `next build` |
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

> Procédure complète : **docs/procedure-deploiement.md** · Checklist de tests : **docs/checklist-deploiement.md**

1. **Appliquer les migrations en attente** : `DATABASE_URL="..." npm run db:migrate:deploy`
2. **Déployer l'application** : le build (`npm run build`) n'a plus besoin d'un accès à la base.

**Pipeline recommandé (sauvegarde obligatoire avant migration) :**

```bash
PROD_DATABASE_URL="postgresql://..." npm run deploy:prod
```

Le script enchaîne : tests automatiques → état des migrations → **sauvegarde vérifiée de la base**
(`pg_dump`, rétention 10) → confirmation humaine → `prisma migrate deploy` → vérification →
build sans accès base → rappel de la checklist de fonctionnement.

Outils associés :

| Commande | Rôle |
|---|---|
| `npm run db:backup` | Sauvegarde vérifiée de la base (`backups/`, horodatée) |
| `npm run db:restore` | Restauration d'urgence (destructive, confirmation requise) |
| `npm run deploy:prod` | Pipeline production complet (tests + sauvegarde + validation + migration + build) |

### Automatisations GitHub Actions

Six workflows (`.github/workflows/`) encadrent le cycle de vie :

| Workflow | Rôle |
|---|---|
| `ci.yml` | À chaque push et pull request : tests Vitest, TypeScript, build de vérification sans base |
| `migrate.yml` | Application contrôlée des migrations en production (avec modes de récupération P3018 / P1002) |
| `healthcheck.yml` | Sondage périodique de `/api/health`, ouverture automatique d'un incident en cas d'échec |
| `mail-process.yml` | Traitement périodique de la file d'e-mails sortants |
| `mail-test-send.yml` | Vérification de bout en bout de la chaîne d'envoi |
| `seed.yml` | Réinjection contrôlée des données de référence |

Le point de santé applicatif est **`GET /api/health`** (base, migrations, messagerie).
Plus de 660 tests automatisés (Vitest) sont exécutés par la CI à chaque push.

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

## Service de messagerie centralisé

La plateforme envoie ses e-mails (réinitialisation de mot de passe, rapports
mensuels, notifications, tests) via un **service centralisé** : file
d'attente en base (`CourrielSortant`), worker avec réclamation atomique
(`FOR UPDATE SKIP LOCKED`), retries à backoff exponentiel, quotas et
anti-abus, journal complet — remise finale par le relais SMTP du domaine
d'expédition (Resend / Brevo / SMTP2GO…), jamais via les API Gmail/Yahoo/Outlook.

- Architecture, domaine d'envoi et procédure SPF / DKIM / DMARC :
  **[docs/MESSAGERIE.md](docs/MESSAGERIE.md)**
- API : `POST /api/mail/send` (envoi), `GET /api/mail` (logs & suivi),
  `POST /api/mail/process` (worker : cron, clé API ou admin),
  `GET /api/mail/dns-check` (statut SPF / DKIM / DMARC)
- UI : page **Configuration → Service de messagerie centralisé** — monitoring
  24 h, statut du domaine, e-mail de test, traitement manuel de la file

## Rôle de l'IA dans la plateforme

L'intelligence artificielle est un module à part entière de la plateforme. Elle prend
trois formes complémentaires, appuyées sur un socle LLM unifié, et s'exerce selon un
cadre strict : **l'IA assiste, elle ne décide pas**.

### 1. Assistant IA à questions prédéfinies (page Assistant)

Interface de consultation en langage naturel structuré : chaque rôle dispose d'un
catalogue de 20 questions métier, soit **8 × 20 = 160 questions prédéfinies**, chacune
associée à une requête réelle exécutée sur la base de la plateforme.

Chaîne de sécurité imposée à chaque exécution (`src/lib/assistant/`) :

```
RÔLE → questions autorisées → question sélectionnée → paramètres validés
→ permissions → filtre d'isolation → requête prédéfinie → résultat
```

- Aucune requête n'est construite depuis une entrée client non validée : l'identifiant
  de question doit exister dans le catalogue **et** appartenir au rôle de l'utilisateur.
- Les paramètres (période, société, prestataire, assuré, statut, acte, dossier, année)
  sont typés, bornés et filtrés selon une liste déclarée.
- Les rôles externes ne se voient proposer que leurs propres données en options :
  l'assuré consulte ses dossiers, l'entreprise cliente ses assurés, le prestataire
  ses sociétés conventionnées.
- **L'assistant n'invente jamais de donnée** : si aucune donnée ne correspond, la
  réponse le dit explicitement.

Sept présentations de résultats : compteur, montant en Ariary, tableau, liste,
graphique, groupe de KPI, texte — avec période appliquée (10 préréglages + période
personnalisée) et synthèse rédigée à partir des données réelles.

API : `GET /api/assistant` (questions du rôle et options filtrées selon les droits),
`POST /api/assistant` (exécution d'une question).

### 2. Analyse prédictive des opérations (page IA)

Moteur d'analyse continue des dossiers (`GET /api/ia`, page IA) : détection des
retards, anomalies, doublons, incohérences et pièces justificatives manquantes ;
prévisions de volume attendu, charge estimée par gestionnaire et risque de retard.
Comme pour le reste de la plateforme, l'analyse respecte le périmètre société
imposé depuis le jeton d'authentification.

### 3. Bot de suivi multi-canaux (WhatsApp / Telegram / Messenger)

Un bot de consultation (`src/lib/bot-service.ts`, webhooks `/api/webhook/*`) permet
à l'assuré de suivre ses remboursements depuis ses messageries habituelles :

- identification par numéro de téléphone ou `/verifier [numéro de sécurité sociale]`,
  sessions persistées en base avec expiration (TTL 4 h) ;
- commandes : `/mesdossiers` (situation des derniers dossiers), `/dossier [numéro]`
  (suivi d'un dossier précis, avec contrôle de propriété strict), `/calcul [numéro]`
  (explication pas à pas du calcul : barème applicable, plafond, taux couvert,
  ticket modérateur, montants enregistrés et payés) ;
- réponses en langage libre assurées par un LLM **strictement encadré** : le prompt
  système interdit toute création de dossier ou de demande de remboursement et toute
  recherche d'assuré ou de prestataire par nom ; le bot ne fait que guider vers la
  consultation de dossiers existants ;
- tous les échanges (canal, expéditeur, message, réponse) sont journalisés en base
  (`MessageBot`) et consultables via les API de supervision `/api/bot-status`
  et `/api/bot-messages`.

### 4. Socle LLM unifié

Le module `src/lib/llm.ts` abstrait le fournisseur de langage : API compatibles
OpenAI (OpenAI, Groq, Together…), Eden AI, ou SDK local de développement. La
configuration est entièrement environnementale (`LLM_BASE_URL`, `LLM_API_KEY`,
`LLM_MODEL`, `LLM_PROVIDER`) ; sans configuration, la fonctionnalité concernée se
dégrade proprement (réponse de repli) sans affecter le reste de la plateforme.

### 5. Cadre et limites

- **Consultation, pas décision** : aucune écriture métier (création, modification,
  paiement…) n'est accessible à l'IA ou au bot ; les actions restent humaines.
- **Données réelles uniquement** : résultats issus de requêtes prédéfinies sur la
  base ; aucune invention, aucune extrapolation présentée comme un fait.
- **Isolation et sécurité serveur** : rôle, périmètre et paramètres sont forcés
  depuis le jeton signé ; l'IA ne voit jamais plus que son utilisateur.
- **Traçabilité** : exécutions via API authentifiées, échanges du bot journalisés.
- **Substituabilité** : le fournisseur LLM est optionnel et remplaçable par simple
  configuration, sans dépendance forte à un service externe.

## Sécurité

- Authentification NextAuth (jetons signés), mots de passe hachés, verrouillage de
  compte et limitation de débit.
- RBAC à huit rôles et isolation multi-sociétés forcée côté serveur.
- Tables d'audit immuables (déclencheurs en base interdisant modification et
  suppression), historique des paramètres.
- Vérification cryptographique des webhooks entrants.
- Politique de divulgation : **[SECURITY.md](SECURITY.md)** (rapports privés,
  jamais d'issue publique).
- Normes communautaires : licence **MIT**, code de conduite, guide de contribution,
  modèles d'issue et de pull request.

## Scripts utilitaires

| Commande | Rôle |
|---|---|
| `npm run db:seed` | Injecte les données de test (`prisma/seed.ts`) |
| `npm run db:reset` | Réinitialise la base de développement (`prisma migrate reset`) |
| `npm run db:generate` | Génère le client Prisma seul |
| `npm run db:push` | Synchronisation directe du schéma — développement uniquement, jamais en production |
| `npm run db:baseline` | Adosse la chaîne de migrations à une base existante (une seule fois) |
| `npm run test` | Suite de tests (Vitest) — exécutée par la CI à chaque push |
| `npm run lint` | Analyse statique ESLint |

## Documentation associée

- **[docs/procedure-deploiement.md](docs/procedure-deploiement.md)** — procédure de mise en production complète
- **[docs/checklist-deploiement.md](docs/checklist-deploiement.md)** — checklist de tests après déploiement
- **[docs/github-actions.md](docs/github-actions.md)** — fonctionnement des six workflows
- **[docs/MESSAGERIE.md](docs/MESSAGERIE.md)** — architecture de la messagerie, SPF / DKIM / DMARC
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — règles de développement (build sans base, migrations d'abord, migrations idempotentes, secrets, isolation, audit)
- **[SECURITY.md](SECURITY.md)** — politique de sécurité et de signalement
- **[LICENSE](LICENSE)** — licence MIT
