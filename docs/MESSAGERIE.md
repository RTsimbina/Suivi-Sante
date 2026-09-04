# Service de messagerie centralisé — Suivi Santé

> Objectif : permettre à la plateforme d'envoyer des e-mails vers **n'importe quelle
> adresse** — Gmail, Yahoo, Outlook ou domaine professionnel — via un service d'envoi
> centralisé, sécurisé, limité en volume et entièrement traçable.

---

## 1. Architecture cible

```
┌──────────────────────────────┐
│        LA PLATEFORME         │
│                              │
│  Utilisateurs / Applications │
│  (routes API, cron, portail) │
└──────────────┬───────────────┘
               │  POST /api/mail/send
               │  (session NextAuth ou clé API Bearer)
               ▼
┌──────────────────────────────┐
│        MAIL SERVICE          │
│  src/lib/mail/               │
│                              │
│  1. Authentification  → api-auth.ts + authorize.ts (rôles) + proxy.ts
│  2. Validation        → validate.ts    (syntaxe RFC, CRLF, MX)
│  3. Rate Limiting     → rate-limit.ts  (par destinataire + global)
│  4. Anti-abus         → anti-abuse.ts  (domaines jetables, tailles)
│  5. File d'attente    → queue.ts       (table CourrielSortant, retry)
│  6. Génération du msg → templates.ts   (layout commun, échappement)
│  7. Logs et suivi     → table CourrielSortant + GET /api/mail
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│     MOTEUR DE LIVRAISON      │
│  delivery.ts                 │
│  SMTP + DNS/MX + Retry       │
│  (backoff 1 min → 6 h)       │
└──────────────┬───────────────┘
               │ remise au relais SMTP du domaine d'envoi
       ┌───────┼────────┐
       ▼       ▼        ▼
     Gmail   Yahoo    Outlook
```

**Point clé** : la plateforme n'envoie jamais directement à Gmail/Yahoo via leurs API.
Le service remet le message à **son relais SMTP** (fournisseur spécialisé ou serveur de
messagerie du domaine), qui identifie le serveur du destinataire grâce au **DNS/MX**,
puis négocie la remise finale via SMTP. C'est exactement le rôle du moteur de livraison
(`delivery.ts`), qui délègue la dernière partie au relais.

Tout le code du service vit dans `src/lib/mail/` :

| Module | Rôle |
|---|---|
| `index.ts` | Façade unique : `envoyerCourriel()` — TOUS les envois y passent |
| `api-auth.ts` | Clé API machine (`MAIL_API_KEY` / `CRON_SECRET`), comparaison en durée constante |
| `validate.ts` | Syntaxe RFC 5322, longueur, injection CRLF, normalisation anti-contournement, vérification DNS/MX avec cache |
| `anti-abuse.ts` | Domaines jetables, liste noire/blanche, plafonds taille & destinataires |
| `rate-limit.ts` | Fenêtre glissante 1 h : plafond par destinataire normalisé + plafond global (comptage en base, fiable en serverless) |
| `queue.ts` | File persistante, claim atomique `FOR UPDATE SKIP LOCKED`, retry avec backoff exponentiel, orphelins, purge, statistiques |
| `templates.ts` | Layout HTML commun, échappement systématique, version texte alternée |
| `delivery.ts` | Envoi SMTP via nodemailer, timeouts bornés, classification temporaire/permanente des erreurs |
| `mail.test.ts` | 52 tests unitaires (vitest) |

---

## 2. Étape 1 — Créer ton domaine d'envoi (identité d'expéditeur)

Il est préférable que la plateforme envoie les e-mails depuis un domaine que la
plateforme contrôle :

```
notifications@maplateforme.com
support@maplateforme.com
noreply@maplateforme.com
```

⚠️ **N'envoyez jamais** en production via `monservice@gmail.com` : Gmail réécrit le
champ `From` (SPF du domaine non contrôlé), la délivrabilité est mauvaise et les
quotas d'envoi sont faibles. Une adresse Gmail ne peut servir que pour des tests.

L'objectif est d'avoir une **véritable identité d'expéditeur** :

```
                maplateforme.com
                       │
       ┌───────────────┼───────────────┐
       ▼               ▼               ▼
   SPF record      DKIM record      DMARC record
```

Ces trois mécanismes sont **essentiels** pour que Gmail, Yahoo et Outlook puissent
vérifier que la plateforme est autorisée à envoyer des e-mails au nom du domaine :

| Enregistrement | Rôle | Exemple (zone DNS `maplateforme.com`) |
|---|---|---|
| **SPF** | Liste les serveurs autorisés à envoyer pour le domaine | `maplateforme.com. TXT "v=spf1 include:_spf.fournisseur-smtp.com -all"` |
| **DKIM** | Signature cryptographique du message, vérifiée par le destinataire | `smtp._domainkey.maplateforme.com. CNAME dkim.fournisseur-smtp.com` (sélecteur fourni par le relais) |
| **DMARC** | Politique d'alignement + rapports d'abus | `_dmarc.maplateforme.com. TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@maplateforme.com; fo=1"` |

### Procédure recommandée

1. **Choisir un relais SMTP spécialisé** (Brevo, SMTP2GO, Mailgun, Amazon SES,
   Postmark…) — la remise finale à Gmail/Yahoo/Outlook est déléguée à ce fournisseur.
2. **Enregistrer le domaine** (`maplateforme.com`) dans la console du fournisseur.
3. **Publier les enregistrements** SPF / DKIM / DMARC fournis dans la zone DNS.
   - Démarrer avec `p=none` sur DMARC le temps des tests, puis durcir vers
     `p=quarantine` et enfin `p=reject`.
4. **Créer les adresses d'expédition** : `notifications@`, `noreply@`, `support@`.
5. **Configurer le relais** dans la plateforme (page Configuration → stocké chiffré
   AES-256-GCM dans `ConfigurationEmail`, ou variables d'environnement) :

```
SMTP_HOST=smtp-votre-fournisseur.com
SMTP_PORT=587            # STARTTLS (ou 465 = TLS implicite)
SMTP_USER=votre-utilisateur
SMTP_PASS=votre-mot-de-passe
SMTP_FROM=notifications@maplateforme.com
```

6. **Vérifier** : page Configuration → test SMTP, puis vérifier l'en-tête reçu dans
   la boîte Gmail (onglet « Original ») : `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.

> 💡 Astuce : `mail-tester.com` donne une note de délivrabilité et montre quel
> enregistrement manque. `dig TXT maplateforme.com` / `dig TXT _dmarc.maplateforme.com`
> vérifient la propagation DNS.

---

## 3. Cycle de vie d'un message (file d'attente)

```
EN_ATTENTE ──claim atomique──► EN_COURS ──2xx SMTP──► ENVOYE     (messageId + date)
    ▲                            │
    │   4xx / 552 / réseau       │
    └──── retry + backoff ◄──────┤   délais : 1 min → 5 min → 30 min → 2 h → 6 h
                                 │
                                 └──5xx auth/destinataire──► ECHEC   (pas de retry inutile)
```

- **Claim atomique** : `SELECT … FOR UPDATE SKIP LOCKED` — deux instances serverless
  ne peuvent jamais traiter le même message (zéro envoi en double).
- **Orphelins** : un message bloqué EN_COURS > 15 min (crash d'instance) est
  automatiquement remis EN_ATTENTE.
- **Purge** : ENVOYE purgés après 90 jours, ECHEC après 180 jours.
- **Suivi** : chaque ligne `CourrielSortant` est un log (tentatives, erreur,
  Message-ID, source, catégorie).

---

## 4. API du service

### `POST /api/mail/send` — demander un envoi

Authentification : **session NextAuth** (rôles ADMINISTRATEUR, ACCUEIL, TECHNIQUE,
COMPTABILITE) **ou** `Authorization: Bearer $MAIL_API_KEY` (appel machine).

```bash
# Via session (navigateur) — e-mail simple
curl -X POST https://votre-domaine/api/mail/send \
  -H "Content-Type: application/json" \
  --cookie "next-auth.session-token=..." \
  -d '{
    "destinataires": ["comptable@entreprise.mg"],
    "sujet": "Relance dossier 2026-114",
    "texte": "Merci de vérifier le dossier 2026-114.",
    "categorie": "NOTIFICATION"
  }'

# Via clé API — avec template et livraison immédiate
curl -X POST https://votre-domaine/api/mail/send \
  -H "Authorization: Bearer $MAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "destinataires": ["admin@maplateforme.com"],
    "template": "test",
    "traiter": true
  }'
```

Corps accepté (validation Zod) :

| Champ | Type | Notes |
|---|---|---|
| `destinataires` | `string[]` (1–50) | obligatoire, validé RFC + MX |
| `cc`, `bcc` | `string[]` | max 25 chacun |
| `sujet` | `string` ≤ 255 | requis si pas de template, préfixe ajouté |
| `texte`, `html` | `string` | corps brut ; texte déduit du html si absent |
| `template` | `reinitialisation-mdp` \| `notification` \| `test` | contenu généré et échappé |
| `donnees` | `object` | données du template |
| `piecesJointes` | `[{nom, contenuBase64, contentType}]` | max 5, ~9 Mo base64 |
| `fromPersonnalise` | `"Nom <adresse>"` | adresse doit être valide |
| `replyTo` | `string` | adresse de réponse |
| `categorie` | `string` | suivi : `RAPPORT_MENSUEL`, `RAPPORT_PDF`, `RESET_MDP`… |
| `priorite` | `1`–`9` | 1 = urgente (ordre de traitement) |
| `traiter` | `boolean` | livraison immédiate (défaut : file + processeur) |

Réponses : `202` accepté (`{ok, id, statut, livraison?}`) · `400` invalide ·
`401/403` non authentifié · `422` rejeté anti-abus/MX · `429` quota atteint.

### `GET /api/mail` — logs et suivi (ADMINISTRATEUR)

```bash
curl "https://votre-domaine/api/mail?statut=ECHEC&limite=50"
# → { stats: { enAttente, enCours, envoyes24h, echecs24h, parStatut }, envois: [...] }
```

### `POST /api/mail/process` — traiter la file

Canaux : session ADMINISTRATEUR/TECHNIQUE, `Bearer $MAIL_API_KEY`, ou
`Bearer $CRON_SECRET` (Vercel Cron — configuré quotidiennement dans `vercel.json`).

```bash
curl -X POST https://votre-domaine/api/mail/process \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" -d '{"purge": true}'
```

Actions : récupération des orphelins → traitement de la file (20 messages max par
appel) → purge optionnelle du journal.

---

## 5. Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `MAIL_API_KEY` | — | clé API machine (`openssl rand -hex 32`) pour `/api/mail/send` et `/api/mail/process` |
| `MAIL_SUBJECT_PREFIX` | `Suivi Santé` | préfixe `[Préfixe]` ajouté aux sujets |
| `MAIL_MX_CHECK` | `true` | vérification DNS/MX des domaines destinataires à l'admission |
| `MAIL_MAX_PER_RECIPIENT_HOUR` | `10` | plafond/heure par destinataire (normalisé) |
| `MAIL_MAX_GLOBAL_HOUR` | `300` | plafond/heure toute plateforme confondue |
| `MAIL_MAX_RECIPIENTS` | `25` | destinataires max par message |
| `MAIL_MAX_BODY_KB` | `512` | taille max du corps texte+html |
| `MAIL_MAX_ATTACHMENTS` / `MAIL_MAX_ATTACHMENTS_KB` | `5` / `8192` | pièces jointes |
| `MAIL_BLOCKED_DOMAINS` | — | liste noire additionnelle (virgules) |
| `MAIL_ALLOWED_DOMAINS` | — | si définie, seuls ces domaines sont acceptés |
| `MAIL_CONTACT` | `support@suivisante.mg` | adresse de contact dans le pied des e-mails |
| `CRON_SECRET` | — | secret Vercel Cron (aussi accepté par le service mail) |

Configuration SMTP relais : voir §2 (page Configuration ou `SMTP_*`).

---

## 6. Centralisation — qui envoie quoi désormais

| Cas d'usage | Avant | Après |
|---|---|---|
| Réinitialisation de mot de passe | envoi SMTP direct (route publique) | file `RESET_MDP`, priorité 1, livraison immédiate, retry si SMTP momentanément en panne |
| Rapport mensuel (cron + manuel) | envoi direct | file `RAPPORT_MENSUEL`, retry automatique, suivi par société |
| Rapport PDF (`/api/reporting/rapport`) | envoi direct + pièce jointe | file `RAPPORT_PDF` avec pièce jointe base64 |
| E-mail de test (Configuration) | envoi direct | file `TEST`, livraison immédiate + résultat dans la réponse |

`envoyerEmail()` dans `src/lib/email.ts` est **déprécié** : tout nouvel envoi doit
passer par `envoyerCourriel()` (`src/lib/mail/index.ts`), seul point de sortie
autorisé — c'est ce qui garantit validation, quotas, retries et traçabilité partout.

---

## 7. Extension — recevoir sur son propre domaine (plus tard)

Ce document couvre l'**envoi**. Pour la **réception** (`reception@maplateforme.com`
dans la boîte « Réception courriels » de la plateforme), il faudra en plus :

1. Enregistrements **MX** pointant vers le serveur de réception (ou service comme
   Cloudflare Email Routing → webhook).
2. Un pont e-mail → API (`POST /api/reception/courriels`) authentifié.

C'est une évolution indépendante ; le service d'envoi présenté ici n'y touche pas.
