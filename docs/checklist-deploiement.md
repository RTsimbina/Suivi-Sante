# Checklist de tests avant mise en production — Suivi Santé

> À exécuter **après chaque déploiement** (recette puis production) et après toute migration.
> Cochez chaque point ; toute case décochée = déploiement à ne pas considérer comme validé.

## 0. Configuration production (Vercel + Resend) — avant le premier déploiement mail

> Détail complet de la procédure Resend : voir `docs/MESSAGERIE.md` §2.

### 0.1 Variables d'environnement Vercel (Project → Settings → Environment Variables)

- [ ] `DATABASE_URL` — chaîne PostgreSQL production (poolé, sslmode=require)
- [ ] `NEXTAUTH_URL` — URL publique de l'application
- [ ] `NEXTAUTH_SECRET` — secret de signature des sessions
- [ ] `RESEND_API_KEY` — clé API Resend (`re_…`, Dashboard Resend → API Keys, « full access »)
- [ ] `MAIL_FROM_EMAIL` — expéditeur (`noreply@<domaine-vérifié>`, **jamais** gmail.com)
- [ ] `MAIL_API_KEY` — jeton d'appel machine de `/api/mail/process` (Bearer)
- [ ] `CRON_SECRET` — même valeur que le secret GitHub (workflow `mail-process.yml` + Vercel Cron)
- [ ] Optionnel : `MAIL_TRANSPORT=auto` (défaut), plafonds `MAIL_MAX_*`, `EMAIL_RAPPORT_DESTINATAIRE`

### 0.2 Domaine d'expédition Resend (mode production)

- [ ] Domaine ajouté dans Resend → Domains
- [ ] 3 enregistrements DNS publiés chez le registrar : SPF (TXT), DKIM (`resend._domainkey`, TXT), DMARC (TXT)
- [ ] Statut du domaine dans Resend → **Verified** (attendre la propagation, puis « Verify »)
- [ ] Contrôle applicatif : page Configuration → vérification messagerie (`verifierResend()`), et `GET /api/mail/dns-check` → SPF/DKIM/DMARC OK

### 0.3 Réglages Vercel qui cassent les appels automatisés

- [ ] **Attack Challenge Mode désactivé** (Project → Settings → Deployment Protection) — sinon les workflows GitHub (`mail-process.yml`, `healthcheck.yml`) et Vercel Cron reçoivent une page HTML de challenge 429 au lieu de l'API
- [ ] Vercel Cron actif (`vercel.json`) et `CRON_ENABLED` non désactivé

### 0.4 Validation bout-en-bout du mail

- [ ] Workflow GitHub `mail-test-send.yml` déclenché manuellement → e-mail de test reçu sur la boîte visée
- [ ] Un message réel passe par la file : statuts visibles dans la vue Messagerie (en file → envoyé, messageId Resend)
- [ ] En cas d'échec : message d'erreur interprété dans les logs (`interpreterErreurResend`), rien ne part en silence

## 1. Authentification et accès

- [ ] **Connexion** avec un compte valide (chaque rôle concerné) → accès à l'application
- [ ] **Connexion refusée** avec mot de passe incorrect → message d'erreur, pas d'accès
- [ ] **Limitation de connexion** : 5 échecs sur un même compte → compteur d'échecs atomique, blocage temporaire (verrouillage) puis déblocage après la fenêtre
- [ ] **Changement de mot de passe** (menu profil) → ancien requis, nouveau ≥ 8 caractères avec lettres et chiffres, reconnexion nécessaire
- [ ] **Mot de passe oublié / réinitialisation** → flux complet fonctionnel
- [ ] **Déconnexion** → retour à l'écran de connexion, session invalide (bouton retour = refusé)
- [ ] **Rôles** : un compte non-administrateur n'accède pas aux écrans d'administration (utilisateurs, technique, configuration) — ni par l'interface, ni par appel direct aux API (réponse 401/403)

## 2. Données (CRUD et consultation)

Pour chaque entité principale — sociétés, assurés/bénéficiaires, prestataires, dossiers, contrats, courriels :

- [ ] **Création** d'un enregistrement complet → enregistré et affiché dans la liste
- [ ] **Rejet des données invalides** : champs requis vides, `typeBeneficiaire` inconnu, statut inconnu → erreur 400 explicite (validation Zod), rien n'est enregistré
- [ ] **Modification** (y compris via les PATCH de l'application) → champs modifiés correctement, champs inconnus rejetés
- [ ] **Suppression** → confirmation demandée, suppression effective ; suppression d'une société avec assurés/dossiers existants → refusée proprement
- [ ] **Recherche** par nom/référence → résultats pertinents
- [ ] **Filtres** (statut, société, dates) → résultats conformes
- [ ] **Isolation multi-sociétés** : les données d'une société ne sont jamais visibles depuis le contexte d'une autre

## 3. Finance (montants, plafonds, budgets)

- [ ] **Plafonds** : création/modification d'un plafond → valeur > 0 obligatoire ; saisie de 0, négatif, texte → refusée
- [ ] **Montants négatifs refusés partout** : appels de fonds, remboursements, dossiers → erreur 400, aucun impact sur les budgets (correction Zod)
- [ ] **Montants non numériques refusés** ("abc", null, objet) → erreur 400, pas d'erreur serveur 500
- [ ] **Appels de fonds** : création → montant déduit du budget correctement (une seule source de vérité) ; modification → recalcul cohérent
- [ ] **Remboursements** : montant, coefficient de barème (0–1), taux de couverture (0–100) validés ; calcul du reste à charge correct
- [ ] **Budgets** : budgetUtilise cohérent après création/modification/suppression d'appels de fonds
- [ ] **Barèmes** : calcul d'un acte (module santé/simuler) → montants conformes au barème en vigueur

## 4. Imports (Excel/ISA)

- [ ] **Fichier valide** : import d'un Excel conforme → récapitulatif correct, données créées, historique d'import enregistré
- [ ] **Fichier incorrect** (format non Excel, PDF renommé) → rejeté avec message clair, rien importé
- [ ] **Fichier vide** (aucune ligne) → traité proprement (avertissement), pas d'erreur 500
- [ ] **Fichier trop volumineux** (> 15 Mo) → refusé avant traitement
- [ ] **Colonnes manquantes** → rejeté avec indication des colonnes attendues
- [ ] **Valeurs incorrectes** (montants négatifs, dates invalides, types inconnus) → lignes rejetées avec rapport d'erreurs ligne à ligne, lignes valides documentées

## 5. Robustesse générale

- [ ] **JSON malformé** envoyé à une API (curl) → 400 « Données invalides », pas de 500
- [ ] **Champs inconnus** dans un POST/PATCH → ignorés ou rejetés, jamais enregistrés
- [ ] **Webhooks** (Telegram/WhatsApp/Messenger) : signature invalide refusée, limitation par IP active
- [ ] **Redémarrage du service** : les compteurs de limitation survivent (stockage Redis/Postgres partagé)
- [ ] **Journal d'audit** : les actions sensibles (suppression utilisateur, modifications paramétrage) sont tracées

## 6. Après une migration de base (en plus des sections ci-dessus)

> **Depuis le 16/09/2026**, le build Vercel applique automatiquement les migrations en attente
> (`package.json` → `build` : `prisma generate && prisma migrate deploy && next build`).
> Conditions : `DATABASE_URL` doit être définie dans les variables d'environnement Vercel
> (Production **et** Preview) — sans elle, le build échoue explicitement, ce qui est voulu.
> `prisma migrate deploy` est idempotent : sans migration en attente, il ne fait rien.
> En cas de besoin ponctuel, l'application manuelle reste possible :
> `DATABASE_URL="postgres://…" npx prisma migrate deploy`.

- [ ] `npm run db:migrate:status` → « Database schema is up to date! »
- [ ] Toutes les énumérations/statuts affichés correctement (aucun libellé brut)
- [ ] Historiques et tables enrichies (audit journal) remplissent leurs champs
- [ ] Aucune donnée perdue : comptages comparés à l'avant-déploiement (sociétés, assurés, dossiers, remboursements, appels de fonds)

---

**En cas d'anomalie bloquante :** stopper l'application, évaluer, et si nécessaire restaurer la
sauvegarde pré-déploiement (`bash scripts/restore-db.sh <fichier>`) puis revenir à la version
applicative précédente.
