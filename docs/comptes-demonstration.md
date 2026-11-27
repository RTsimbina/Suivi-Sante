# Comptes de démonstration — Suivi Santé

Ce document décrit le jeu de comptes de démonstration de la plateforme : leur
catalogue (source de vérité unique), la procédure d'initialisation idempotente,
les données réelles associées à chaque profil et l'état de leur validation.
Il répond à la règle du cahier des charges : *aucun compte ne doit ouvrir des
tableaux vides*, et *aucun rôle ne doit être supposé — tout est vérifié dans le
code* (référentiel `ROLES`, `src/lib/referentiels.ts`).

---

## 1. Principes et garde-fous

- **Source de vérité** : le catalogue `src/lib/comptes-demo.ts` est partagé par
  le seed (`prisma/seed-demo.ts`), les tests de non-régression
  (`src/lib/comptes-demo.test.ts`) et ce document. Aucune liste parallèle.
- **Rôles réels uniquement** : chaque compte porte un rôle du référentiel
  `ROLES` (10 rôles). Le login est *fail-closed* (`src/lib/auth.ts`) : un rôle
  inconnu refuse la connexion — le rôle historique erroné
  `PORTAIL_PRESTATAIRE` (absent du référentiel) a été corrigé en `PRESTATAIRE`
  dans `prisma/seed-portail.ts`.
- **Mots de passe de démonstration, environnement dev/test uniquement** :
  posés À LA CRÉATION seulement (interne `SuiviSante@2026`, externe
  `Contact@2026`, mêmes valeurs que `scripts/reset_seed.mjs`). Le seed ne
  réinitialise JAMAIS le mot de passe d'un compte existant, sauf option
  explicite `REINIT_MDP_DEMO=OUI` (et jamais pour le compte administrateur de
  référence, marqué `motDePasseVerrouille`).
- **Non destructif** : le seed ne supprime rien, ne touche aucun compte hors
  catalogue, ne réactive pas un compte désactivé et ne modifie jamais le
  champ `actif`.
- **Garde anti-exécution accidentelle** : le seed exige l'acquittement
  explicite `SEED_DEMO=OUI`. Ne JAMAIS l'exécuter sur la base de production.

## 2. Procédure d'initialisation (idempotent, ré-exécutable)

```bash
# 1. Base migrée + jeu de données de base
npm run db:seed

# 2. (Optionnel) jeu métier 5 sociétés — PURGE le jeu métier existant
node scripts/reset_seed.mjs

# 3. Comptes de démonstration + associations de données réelles
SEED_DEMO=OUI npx tsx prisma/seed-demo.ts

# (Optionnel) réaligner les mots de passe de tous les comptes de démo
# (sauf administrateur) sur les valeurs de création — dev/test uniquement :
SEED_DEMO=OUI REINIT_MDP_DEMO=OUI npx tsx prisma/seed-demo.ts
```

Le seed est **idempotent** : upserts par e-mail, étapes de traitement créées
uniquement pour les dossiers qui n'en ont encore aucune, objectifs de délai et
seuils créés seulement s'ils manquent. Une relance ne duplique rien — et il se
**répare lui-même** : si un référentiel a été altéré (ex. objectif de délai
fermé par un test d'intégration), une relance recrée l'entrée manquante.

## 3. Tableau des comptes (31)

Statut de validation — exécution du 2026-11-27, script
`scripts/test-comptes-demo-e2e.mjs` contre le serveur Next local
(base recette PostgreSQL dédiée) : **86/86 vérifications OK**.

- « sondes » = connexion + rôle dans le jeton + accès HTTP 200 à une route clé
  du rôle + refus HTTP 403 sur des routes interdites (contrôle SERVEUR, pas un
  masquage d'interface) ;
- « connexion » = connexion NextAuth réelle (csrf → callback → session) avec le
  bon rôle en session ;
- « cycle actif » = désactivation par l'admin → session révoquée (401 à la
  première requête) → login refusé → réactivation → login OK.

### Comptes internes (mot de passe à la création : `SuiviSante@2026`)

| Compte | Rôle | Service | Usage (modules testés) | Statut de validation |
|---|---|---|---|---|
| `admin@suivisante.mg` | ADMINISTRATEUR | Administration | Utilisateurs, sociétés, contrats, barèmes, permissions, journal, objectifs et seuils KPI | Validé — sondes (`/api/utilisateurs`, `/api/kpi/objectifs`) ; mot de passe verrouillé (jamais réinitialisé par le seed) |
| `accueil@suivisante.mg` | ACCUEIL | Accueil | Réception, import, affectation, transmission, kanban, Ma Performance | Validé — sondes (+ `/api/import`) ; mot de passe erroné refusé |
| `technique@suivisante.mg` | TECHNIQUE | Service Technique | Dossiers affectés, analyse, validation, rejet, barèmes, prestataires, KPI | Validé — connexion |
| `technique2@suivisante.mg` | TECHNIQUE | Service Technique | Analyse/validation/retour, KPI individuels | Validé — sondes (`/api/prestataires`, `/api/technique/societes`) ; KPI `ma-performance` alimenté |
| `technique3@suivisante.mg` | TECHNIQUE | Service Technique | Analyse/validation/retour, KPI individuels | Validé — connexion |
| `technique4@suivisante.mg` | TECHNIQUE | Service Technique | Analyse/validation/retour, KPI individuels | Validé — connexion |
| `technique5@suivisante.mg` | TECHNIQUE | Service Technique | Analyse/validation/retour, KPI individuels | Validé — connexion + cycle actif complet (désactivation → révocation 401 → login refusé → réactivation → login OK) |
| `compta@suivisante.mg` | COMPTABILITE | Comptabilité | Comptabilisation, contrôles, transmission finance, KPI | Validé — connexion |
| `compta2@suivisante.mg` | COMPTABILITE | Comptabilité | Décomptes, contrôles comptables, KPI | Validé — connexion |
| `finance1@suivisante.mg` | COMPTABILITE | Finance (rôle COMPTABILITE) | Appels de fonds, paiements, reporting, KPI | Validé — sondes (`/api/reporting/rapport`, `/api/appels-fonds`) ; KPI alimenté ; `/api/utilisateurs` refusé |
| `finance2@suivisante.mg` | COMPTABILITE | Finance (rôle COMPTABILITE) | Appels de fonds, paiements, montants payés/restants, KPI | Validé — connexion |
| `sante@suivisante.mg` | SANTE | Contrôle médical | Contrôle (début/fin), validation/rejet, vérification assuré, simulation acte, KPI | Validé — connexion |
| `sante2@suivisante.mg` | SANTE | Contrôle médical | Dossiers assignés, contrôle/validation/rejet, KPI | Validé — sondes (`/api/dossiers`, `/api/sante/actes-assure?assureId=…`) ; `/api/kpis`, `/api/appels-fonds`, `/api/reporting` refusés ; KPI alimenté |
| `utilisateur@suivisante.mg` | SANTE | Contrôle médical | Compte historique du seed de base — vérification assuré, contrôle médical | Validé — connexion |
| `dg@suivisante.mg` | DIRECTION_GENERALE | Direction générale | Tableau de bord direction : KPI collaborateurs (périmètre global), alertes, exports | Validé — sondes (`/api/kpi/performance`, `/api/kpi/alertes`) ; `/api/dossiers`, `/api/utilisateurs` refusés |
| `rs-accueil@suivisante.mg` | RESPONSABLE_SERVICE (ACCUEIL) | Chef de service — Accueil | KPI collaborateurs bornés au service ACCUEIL (périmètre forcé serveur via `serviceResponsable`) | Validé — connexion |
| `rs-technique@suivisante.mg` | RESPONSABLE_SERVICE (TECHNIQUE) | Chef de service — Technique | KPI collaborateurs bornés au service TECHNIQUE, Ma Performance | Validé — sondes (`/api/kpi/performance`, `/api/kpi/ma-performance`) ; `/api/dossiers`, `/api/utilisateurs` refusés |
| `rs-controle-medical@suivisante.mg` | RESPONSABLE_SERVICE (CONTROLE_MEDICAL) | Chef de service — Contrôle médical | KPI collaborateurs bornés au service CONTROLE_MEDICAL | Validé — connexion |
| `rs-comptabilite@suivisante.mg` | RESPONSABLE_SERVICE (COMPTABILITE) | Chef de service — Comptabilité | KPI collaborateurs bornés au service COMPTABILITE | Validé — connexion |

### Comptes externes (mot de passe à la création : `Contact@2026`)

| Compte | Rôle | Service | Usage (modules testés) | Statut de validation |
|---|---|---|---|---|
| `contact.sanlam@sanlam.mg` | CONTACT_ENTREPRISE | Société SANLAM (liaison par contact déclaré) | Portail entreprise : assurés, dossiers, contrats de SA société | Validé — sondes ; `/api/societes` renvoie SA société seule (isolation vérifiée) |
| `contact.telma@telma.mg` | CONTACT_ENTREPRISE | Société TELMA (liaison par e-mail du contact principal) | Isolation via `Societe.emailContactPrincipal` | Validé — connexion |
| `j.rakotoarison@jirama.mg` | CONTACT_ENTREPRISE | Société JIRAMA (liaison par e-mail général de la société) | Isolation via `Societe.email` | Validé — connexion |
| `contact.airtel@airtel.mg` | CONTACT_ENTREPRISE | Société AIRTEL (liaison par contact déclaré) | Portail entreprise, périmètre SA société | Validé — connexion |
| `contact.bni@bni.mg` | CONTACT_ENTREPRISE | Société BNI (liaison par contact déclaré) | Portail entreprise, périmètre SA société | Validé — connexion |
| `portail.sanlam@suivisante.mg` | PORTAIL_CLIENT | Assuré SANLAM (assuré dédié portant l'e-mail) | Portail assuré : ses dossiers, ses ayants droit, son barème | Validé — sondes ; `/api/dossiers` limité à UNE société (isolation vérifiée) |
| `portail.telma@suivisante.mg` | PORTAIL_CLIENT | Assuré TELMA | Portail assuré, périmètre propre | Validé — connexion + isolation : périmètre distinct de sanlam |
| `portail.jirama@suivisante.mg` | PORTAIL_CLIENT | Assuré JIRAMA | Portail assuré, périmètre propre | Validé — connexion |
| `portail.airtel@suivisante.mg` | PORTAIL_CLIENT | Assuré AIRTEL | Portail assuré, périmètre propre | Validé — connexion |
| `portail.bni@suivisante.mg` | PORTAIL_CLIENT | Assuré BNI | Portail assuré, périmètre propre | Validé — connexion |
| `contact@clinique-saintemarie.mg` | PRESTATAIRE | Prestataire — Clinique Sainte Marie (liaison par e-mail de facturation) | Portail prestataire : ses dossiers, ses sociétés conventionnées, ses factures | Validé — sondes (`/api/portail-prestataire`, `/api/profil`) ; `/api/dossiers`, `/api/societes`, `/api/utilisateurs` refusés |
| `facturation@hopital-principal.mg` | PRESTATAIRE | Prestataire — Hôpital Principal HJ Anosy | Portail prestataire, périmètre propre | Validé — connexion |

> Les 19 comptes « Validé — connexion » partagent la logique serveur de leur
> rôle avec un compte sondé du même rôle (même matrice `matchPermission`,
> testée unitairement pour les 10 rôles — `src/lib/comptes-demo.test.ts`).
> Aucun rôle du catalogue n'est dépourvu de couverture de permissions.

## 4. Données réelles associées (aucun tableau vide)

Le seed associe à chaque profil des données issues du jeu métier :

- **Étapes de traitement KPI** (`EtapeTraitement`, source `MIGRATION`) posées
  sur les dossiers SANS étape existante, en rotation déterministe entre les
  collaborateurs de chaque service (1 accueil, 5 techniques, 3 santé,
  4 comptabilité/finance) — chaque collaborateur du circuit a des étapes
  nominatives : KPI individuels (`/api/kpi/ma-performance`) alimentés ;
- **Retours pour correction** (~10 %) et **suspensions** (~12 %, motif
  obligatoire) pour exercer les indicateurs de qualité, dans le même format
  que le circuit applicatif ;
- **Assignation contrôle médical** (`Dossier.gestionnaireControleMedicalId`)
  sur les dossiers hospitalisation/accouchement/règlement prestataire, avec
  un gestionnaire `CONTROLE_MEDICAL` créé au référentiel s'il manque ;
- **Liaisons portails** : un assuré dédié par société cliente (e-mail = compte
  PORTAIL_CLIENT), une liaison CONTACT_ENTREPRISE par les 3 sources
  (`EntrepriseContact`, `Societe.emailContactPrincipal`, `Societe.email`),
  une fiche Prestataire portant l'e-mail de facturation du compte PRESTATAIRE
  + conventions prestataire↔société ;
- **Référentiel KPI** : objectifs de délai par service (ACCUEIL 30 min,
  TECHNIQUE 240, CONTROLE_MEDICAL 240, COMPTABILITE 120) et seuils d'alerte
  GLOBAL (4 types) — valeurs de démonstration identiques à
  `scripts/backfill-kpi.ts` ;
- Les KPI sont **calculés** par le module (`src/lib/kpi-performance.ts`) à
  partir de ces étapes réelles : aucune valeur artificielle n'est stockée.

## 5. Vérifications (tests)

| Niveau | Couverture | Commande |
|---|---|---|
| Unitaires (21 tests) | Invariants du catalogue (rôles du référentiel, e-mails uniques, `serviceResponsable` réservé) + matrice de permissions serveur par rôle (`matchPermission`, fail-closed) | `npx vitest run src/lib/comptes-demo.test.ts` |
| E2E réels (86 vérifications) | Connexion NextAuth des 31 comptes, sondes autorisé/refusé, isolation portails, KPI alimentés, cycle actif (désactivation→révocation), redirections | `BASE=http://localhost:3000 node scripts/test-comptes-demo-e2e.mjs` |

## 6. Affichage sur la page de connexion

Le bloc « Comptes de démonstration » de la page `/login` est **généré depuis le
catalogue** (`src/lib/comptes-demo.ts`) — aucune liste en dur : l'affichage ne
peut pas diverger des comptes réellement créés par le seed (contrôle de
cohérence : `npx tsx scripts/verifier-sync-comptes-demo.ts`).

- **Garde d'environnement** : le bloc (identifiants + mots de passe + boutons
  de copie) ne s'affiche QUE si `NEXT_PUBLIC_ENV_DEMO=OUI` (variable de build,
  `.env.example`). Sur tout autre environnement — production comprise — le
  bloc ne rend rien : aucun identifiant ni mot de passe affiché.
- **Boutons de copie** : chaque carte propose la copie de l'identifiant et du
  mot de passe (Clipboard API avec repli `execCommand`), plus un bouton de
  copie du mot de passe par groupe ; le clic sur la carte pré-remplit le
  formulaire comme auparavant.
- **Tests** : `src/app/login/page.test.tsx` vérifie le masquage hors démo,
  l'affichage synchronisé (31 comptes), le pré-remplissage et les copies.

## 7. Points d'attention

- **Rate limiting du login** : la politique par défaut limite à 30 tentatives
  par IP / 15 minutes (`LOGIN_IP_LIMIT`, `src/lib/login-policy.ts`). Les tests
  E2E (36+ connexions depuis 127.0.0.1) doivent lancer le serveur avec
  `LOGIN_IP_LIMIT=200 LOGIN_EMAIL_LIMIT=50 LOGIN_PAIR_LIMIT=50` (dev/test
  uniquement) — sinon les logins au-delà du 30e sont refusés (401) sans rapport
  avec les comptes eux-mêmes.
- **Tests d'intégration PostgreSQL** (`*.int.test.ts`) : conçus pour une base
  de recette DÉDIÉE. Le scénario « changement d'objectif de délai » ferme la
  version en vigueur d'un service ; sur la base de démonstration, relancer
  `SEED_DEMO=OUI npx tsx prisma/seed-demo.ts` ensuite (le seed recrée
  l'objectif manquant — auto-réparation).
- **Production** : aucun compte de démonstration ne doit exister en production
  avec un mot de passe faible. Le seed exige `SEED_DEMO=OUI` et n'écrase jamais
  les mots de passe existants ; la matrice de permissions serveur reste
  identique dans tous les environnements.
