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

1. **Choisir un relais SMTP spécialisé** — **Resend (recommandé pour Vercel)**,
   Brevo, SMTP2GO, Mailgun, Amazon SES, Postmark… — la remise finale à
   Gmail/Yahoo/Outlook est déléguée à ce fournisseur, qui gère aussi la réputation
   IP et le traitement des bounces.
2. **Enregistrer le domaine** (`maplateforme.com`) dans la console du fournisseur.
3. **Publier les enregistrements** SPF / DKIM / DMARC fournis dans la zone DNS.
   - Démarrer avec `p=none` sur DMARC le temps des tests, puis durcir vers
     `p=quarantine` et enfin `p=reject`.
4. **Créer les adresses d'expédition** : `notifications@`, `noreply@`, `support@`.
5. **Configurer le relais** dans la plateforme (page Configuration → stocké chiffré
   AES-256-GCM dans `ConfigurationEmail`, ou variables d'environnement) :

```
SMTP_HOST=smtp-votre-fournisseur.com
SMTP_PORT=587            # STARTTLS — jamais 25 (bloqué par Vercel), 465 déconseillé en serverless
SMTP_USER=votre-utilisateur
SMTP_PASS=votre-mot-de-passe
SMTP_FROM=notifications@maplateforme.com
```

6. **Vérifier** : page Configuration → test SMTP, puis vérifier l'en-tête reçu dans
   la boîte Gmail (onglet « Original ») : `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.

### Relais recommandé : Resend (déploiement Vercel)

Resend est le choix de référence pour Suivi-Sante sur Vercel : SMTP simple en
STARTTLS port 587, délivrabilité gérée (infrastructure Amazon SES), 3 000 e-mails/mois
gratuits, logs par message dans le dashboard. **Aucune modification de code** : le
moteur de livraison (`delivery.ts`) parle déjà SMTP à un relais — Resend n'est qu'un
jeu de variables d'environnement.

**Étape 1 — Compte et domaine**

1. Créer un compte sur [resend.com](https://resend.com), puis générer une clé API
   (Dashboard → API Keys → `re_…`). Cette clé sert à la fois de `SMTP_PASS` (usage
   SMTP de la plateforme) et de clé API (usage HTTP, ex. d'autres outils).
2. Dashboard → **Domains → Add domain** → saisir le domaine d'expédition, idéalement
   un sous-domaine dédié (ex. `mail.maplateforme.com`) pour isoler la réputation.
3. Publier dans la zone DNS les 3 enregistrements **exactement comme fournis par
   Resend** (ne jamais recopier un exemple générique) — structure type :

| Type | Nom (sous le domaine) | Valeur (type) | Rôle |
|---|---|---|---|
| TXT | (racine) | `v=spf1 include:amazonses.com ~all` | SPF — serveurs d'émission autorisés |
| CNAME | `resend._domainkey` | `xxxx.dkim.amazonses.com` | DKIM — clé publique, sélecteur `resend` |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@maplateforme.com` | DMARC — commencer en observation |

4. Attendre la propagation (5 min à 24 h) puis cliquer **Verify** dans Resend.
   Tant que le domaine n'est pas vérifié, Resend reste en **mode test** : il ne
   délivre qu'vers l'adresse du compte lui-même.

**Étape 2 — Variables d'environnement (Vercel / .env)**

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=587                        # STARTTLS — Vercel bloque le port 25
SMTP_USER=resend                     # littéral : toujours « resend »
SMTP_PASS=re_xxxxxxxxxxxxxxxxxxxxxx  # clé API Resend
SMTP_FROM=noreply@mail.maplateforme.com
MAIL_FROM_EMAIL=noreply@mail.maplateforme.com   # domaine lu par /api/mail/dns-check
MAIL_DKIM_SELECTOR=resend            # Resend publie la clé sur « resend », pas « mail »
MAIL_CONTACT=support@maplateforme.com
```

**Étape 3 — Quotas : rester sous la limite gratuite**

Le plan gratuit Resend autorise **100 e-mails/jour** (3 000/mois). Le plafond
applicatif `MAIL_MAX_GLOBAL_HOUR` (défaut 300/h) cale les rafales, pas le plafond
journalier du relais : au-delà de 100/jour, Resend rejette en erreur SMTP temporaire,
que la file absorbe par backoff (1 min → 6 h) avant passage en ECHEC. Recommandations :

- `MAIL_MAX_GLOBAL_HOUR=80` borne le débit horaire et laisse la marge au quota
  journalier (les rapports mensuels volumineux partent étalés par la file) ;
- surveiller les quotas sur le dashboard Resend (Logs → bounces / rate limited) ;
- si le volume croît, passer au plan payant Resend plutôt que de durcir les retries.

**Pièges Resend à connaître**

| Piège | Effet observable | Parade |
|---|---|---|
| Sélecteur DKIM non aligné | dns-check affiche DKIM `ABSENT` à tort | `MAIL_DKIM_SELECTOR=resend` |
| Domaine non Verify | rejet de tout destinataire externe (mode test) | publier les DNS + Verify dans Resend |
| `SMTP_FROM` hors domaine vérifié | rejet 403 du relais | expéditeur sur le domaine vérifié |
| Port 25 ou 465 depuis Vercel | connexion rejetée/bloquée | `SMTP_PORT=587` uniquement |
| > 100 e-mails/jour (gratuit) | erreurs SMTP temporaires en série | file + backoff absorbent ; ajuster `MAIL_MAX_GLOBAL_HOUR` |

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

### Timeline d'un message — `GET /api/mail?evenements=<id>`

Chaque transition de statut est journalisée dans la table `CourrielEvenement`
(rôle de la table `email_events` du plan, §10) : `MISE_EN_FILE`, `EN_COURS`,
`ENVOYE`, `RETRY`, `ECHEC`, `RECUPERE` — horodatés, avec le Message-ID ou
l'erreur SMTP associée. La journalisation est « best-effort » : une panne du
journal n'interrompt jamais un envoi.

```bash
curl "https://votre-domaine/api/mail?evenements=clxxx..."
# → { evenements: [ { type: "MISE_EN_FILE", createdAt, message }, { type: "EN_COURS" }, { type: "ENVOYE", message: "Message-ID : <...>" } ] }
```

La purge d'un message (ENVOYE > 90 j / ECHEC > 180 j) supprime automatiquement
son historique d'événements (cascade PostgreSQL).

### `GET /api/mail/dns-check` — statut SPF / DKIM / DMARC (ADMINISTRATEUR)

Interroge le DNS public pour vérifier que le domaine d'expédition publie bien
les enregistrements d'authentification attendus par Gmail / Yahoo / Outlook
(plan §18-20). Le domaine est déduit de `MAIL_FROM_EMAIL` ou de l'expéditeur
configuré ; le sélecteur DKIM vient de `MAIL_DKIM_SELECTOR` (défaut `mail`).

```bash
curl "https://votre-domaine/api/mail/dns-check"
# → {
#     "domaine": "votre-domaine.com", "selecteurDkim": "mail",
#     "spf":   { "statut": "PASS", "enregistrement": "v=spf1 include:... ~all" },
#     "dkim":  { "statut": "PASS", "enregistrement": "v=DKIM1; k=rsa; p=..." },
#     "dmarc": { "statut": "PASS", "enregistrement": "v=DMARC1; p=none; rua=..." },
#     "notes": [ ... ]
#   }
```

Statuts possibles par enregistrement : `PASS` (publié), `ABSENT` (à publier —
les valeurs exactes sont fournies par votre relais), `ERREUR` (résolution DNS).
Les avertissements (SPF sans `~all`, DMARC en `p=none`, absence de `rua=`)
guident la montée en sévérité progressive recommandée au plan : commencer en
observation (`p=none`), puis `p=quarantine`, enfin `p=reject`.

La même vérification est disponible en un clic dans la page **Configuration →
Service de messagerie centralisé** (bouton « Revérifier »), avec un e-mail de
test (`POST /api/mail/send`, template `test`) pour valider la réception réelle :
Gmail → ⋮ → *Afficher l'original* → `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.

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
| `MAIL_FROM_EMAIL` | — | adresse From lue par `/api/mail/dns-check` (défaut : expéditeur du relais configuré) |
| `MAIL_DKIM_SELECTOR` | `mail` | sélecteur DKIM vérifié par le dns-check — `resend` avec Resend, `mail`/`brevo1`… selon le relais |
| `CRON_SECRET` | — | secret Vercel Cron (aussi accepté par le service mail) |

Configuration SMTP relais : voir §2 (page Configuration ou `SMTP_*`). Avec
Resend : `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=587`, `SMTP_USER=resend`,
`SMTP_PASS=re_…`, `MAIL_DKIM_SELECTOR=resend`.

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

Deux voies éprouvées pour le pont de réception, sans toucher au service d'envoi :

| Voie | Principe | Effort |
|---|---|---|
| **Cloudflare Email Routing** (Email Worker) | Cloudflare reçoit (MX gratuit) et POSTe le message brut à `POST /api/reception/courriels` | Faible |
| **Récepteur autonome sur Workers** (ex. projet open-source `cloud-mail`) | boîte de réception complète (multi-domaines, pièces jointes R2, webhooks Telegram/HTTP) qui relaie ensuite vers la plateforme | Moyen — aligner la signature du webhook du récepteur avec `src/lib/webhook-verify.ts` avant production |

C'est une évolution indépendante ; le service d'envoi présenté ici n'y touche pas.
