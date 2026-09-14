# Workflows GitHub Actions — Suivi Santé

> Documentation complète des 4 workflows du dépôt : le CI classique (tests) et
> les 3 workflows d'exploitation ajoutés autour du service de messagerie et de
> la disponibilité applicative. Le détail du service de messagerie lui-même
> (file d'attente, retries, anti-abus) est documenté dans [MESSAGERIE.md](./MESSAGERIE.md).

---

## Vue d'ensemble

| Workflow | Fichier | Déclenchement | Rôle |
|---|---|---|---|
| CI | `.github/workflows/ci.yml` | push / PR sur `main` | Vitest + TypeScript + build à chaque changement |
| Mail Queue Processor | `.github/workflows/mail-process.yml` | cron quotidien 17:00 UTC + manuel | Traite la file d'attente des e-mails (filet de secours au cron Vercel) |
| Healthcheck | `.github/workflows/healthcheck.yml` | cron toutes les 30 min + manuel | Sondage `/api/health`, ouvre/ferme automatiquement des issues `[Incident]` |
| Mail Test Send | `.github/workflows/mail-test-send.yml` | manuel uniquement | Envoie un e-mail de test avec paramétrage interactif (destinataire, template) |

Les trois workflows d'exploitation partagent le même garde-fou : si les secrets
ne sont pas encore configurés, ils ne plantent pas inutilement (warning + skip)
— sauf Mail Test Send, action volontairement manuelle, qui échoue dur pour
forcer l'opérateur à corriger la configuration.

## Secrets GitHub requis

À créer dans **Settings → Secrets and variables → Actions → New repository secret** :

| Secret | Rôle | Valeur |
|---|---|---|
| `VERCEL_APP_URL` | URL publique de l'application, **sans** `/` final | ex. `https://suivi-sante.vercel.app` |
| `CRON_SECRET` | Secret partagé des crons (header `Authorization: Bearer`), **identique** à la variable Vercel `CRON_SECRET` | générer : `openssl rand -hex 32` |
| `MAIL_API_KEY` | Clé machine pour `/api/mail/send`, **identique** à la variable Vercel `MAIL_API_KEY` | générer : `openssl rand -hex 32` |

Génération d'un secret (à faire **une seule fois par secret**, les deux canaux
GitHub et Vercel doivent porter la même valeur) :

```bash
openssl rand -hex 32
```

Ces secrets sont vérifiés en durée constante côté application
(`src/lib/mail/api-auth.ts`) ; jamais commités, jamais affichés dans les logs
(GitHub les masque automatiquement).

---

## §1 — Mail Queue Processor (`mail-process.yml`)

### Rôle

Traiter la file d'attente des e-mails (`CourrielSortant`) en appelant
`POST /api/mail/process` avec `{"purge": false}`. L'endpoint, côté application,
effectue dans l'ordre :

1. **Récupération des orphelins** — messages restés `EN_COURS` > 15 min
   (instance crashée à mi-chemin) → remis en `EN_ATTENTE` ;
2. **Claim atomique** — `SELECT … FOR UPDATE SKIP LOCKED` réclame jusqu'à
   20 messages sans collision, même si plusieurs traitements tournent ;
3. **Livraison SMTP** — chaque message est remis au relais configuré
   (Brevo, Resend…) via `src/lib/mail/delivery.ts` ;
4. **Mise à jour du statut** — succès → `ENVOYE` + messageId ; erreur
   temporaire → `EN_ATTENTE` + backoff (1 min → 5 min → 30 min → 2 h → 6 h) ;
   erreur permanente (auth, destinataire invalide) → `ECHEC` ;
5. **Journalisation** — chaque transition est enregistrée dans
   `CourrielEvenement` (timeline consultable via `GET /api/mail?evenements=<id>`).

### Comportement du workflow

| Propriété | Valeur |
|---|---|
| Fréquence | cron `0 17 * * *` — une fois par jour à 17:00 UTC (20:00 à Antananarivo, UTC+3) |
| Déclenchement manuel | oui (`workflow_dispatch`) |
| Runtime / timeout | `ubuntu-latest`, 3 minutes |
| Concurrence | groupe `mail-process`, `cancel-in-progress: false` — jamais deux traitements simultanés, jamais d'interruption à mi-chemin |
| Endpoint | `POST /api/mail/process`, timeout curl 60 s (maxDuration de la route côté Vercel) |
| Critère d'échec | code HTTP ≠ 200 → `::error::` + exit 1 |

Le workflow extrait ensuite les compteurs JSON de la réponse
(`orphelinsRecuperes`, `envoyes`, `retriesProgrammes`, `echecsDefinitifs`) et
génère un tableau dans l'onglet **Summary** de l'exécution.

### Pourquoi deux crons (Vercel + GitHub) ?

`vercel.json` programme déjà `/api/mail/process` à 05:00 UTC. Le workflow
GitHub ajoute un **filet de secours décalé** (17:00 UTC) : si le cron Vercel a
été raté (déploiement en cours, instance endormie, incident plateforme), les
messages en attente partent quand même le jour même. Les deux horaires sont
volontairement éloignés pour ne jamais se percuter.

### Coût et escalier de fréquence

Consommation actuelle : **~15 min/mois** (1 run/jour × ~30 s). Le cron peut
être resserré si le volume d'e-mails augmente :

| Cron | Fréquence | Consommation mensuelle |
|---|---|---|
| `0 17 * * *` (actuel) | 1×/jour | ~15 min/mois |
| `0 */12 * * *` | 2×/jour | ~30 min/mois |
| `0 */6 * * *` | 4×/jour | ~60 min/mois |
| `*/30 * * * *` | 48×/jour | ~720 min/mois |
| `0,10,20,30,40,50 * * * *` | 6×/heure | ~2 160 min/mois |

> Un traitement plus fréquent réduit la latence de livraison, mais le flag
> `traiter: true` de `POST /api/mail/send` déclenche déjà une livraison
> immédiate pour les messages interactifs : le cron n'est qu'un rattrapage.
> Inutile de le descendre sous 30 min dans la plupart des cas.

---

## §2 — Healthcheck (`healthcheck.yml`)

### Rôle

Surveiller la disponibilité de l'application vue de l'extérieur en sondant
`GET /api/health` toutes les 30 minutes, et **ouvrir / fermer automatiquement
des issues GitHub** en cas d'incident. L'endpoint public vérifie deux niveaux :

- l'application répond (le runner a reçu une réponse HTTP) ;
- la base de données est joignable (ping `SELECT 1` — 503 si KO).

Aucune information sensible n'est exposée (pas de version, pas de stack, pas
de détail d'erreur) : la route est publique par conception.

### Comportement du workflow

| Propriété | Valeur |
|---|---|
| Fréquence | cron `*/30 * * * *` — toutes les 30 minutes |
| Déclenchement manuel | oui |
| Runtime / timeout | `ubuntu-latest`, 2 minutes |
| Endpoint | `GET /api/health`, timeout curl 15 s, corps ignoré (`-o /dev/null`) |
| Panne réseau du runner | curl sans code HTTP → `000` (distingue une panne DNS/réseau d'un vrai 5xx) |
| Critère d'échec | code HTTP ≠ 200 → `::error::` + exit 1 |

Gestion des issues (via le CLI `gh`, permission `issues: write`) :

1. **En cas d'échec** — le workflow cherche une issue ouverte dont le titre
   contient `[Incident] Healthcheck` :
   - aucune → création d'une issue labellisée `incident` + `monitoring`,
     avec l'URL sondée, le code HTTP, le lien du run et les actions à mener
     (Vercel, logs, `DATABASE_URL` / état Neon) ;
   - une déjà ouverte → simple commentaire `Toujours en échec — HTTP <code> à <date>`
     (**jamais de spam d'issues** : une seule issue ouverte par incident).
2. **En cas de retour à la normale** — toutes les issues `[Incident] Healthcheck`
   ouvertes reçoivent un commentaire `✅ Healthcheck restauré — HTTP 200 à <date>`
   puis sont fermées automatiquement.

Timeline d'un incident type :

```text
T+0    : App plante → HTTP 500
T+30   : Healthcheck échoue → issue #42 créée
T+60   : App toujours en panne → commentaire sur issue #42
T+90   : App restaurée → HTTP 200 → issue #42 fermée avec ✅
```

### Coût et ajustement de fréquence

Consommation actuelle : **~240 min/mois** (48 runs × ~30 s). Si le quota du
dépôt (2 000 min/mois en plan gratuit sur dépôt privé ; illimité en public)
devient une contrainte :

| Cron | Fréquence | Consommation mensuelle |
|---|---|---|
| `*/30 * * * *` (actuel) | 48×/jour | ~240 min/mois |
| `0 * * * *` | 1×/heure | ~120 min/mois |
| `0 */2 * * *` | 12×/jour | ~60 min/mois |

### Complémentarité avec la surveillance Vercel

- **Vercel** couvre l'intégrité des déploiements, les alertes plateforme et
  les Runtime Logs — mais ne surveille pas la disponibilité applicative
  complète (notamment la joignabilité de la base).
- **Healthcheck GitHub** couvre le parcours exter complet (DNS → edge →
  runtime → base) et laisse une **traçabilité datée dans les issues**.
- Les deux sont complémentaires : Vercel diagnostique, GitHub alerte et archive.

---

## §3 — Mail Test Send (`mail-test-send.yml`)

### Usage

Envoyer un e-mail de test réel via `POST /api/mail/send` pour vérifier la
chaîne SMTP de bout en bout (authentification, génération de template,
file d'attente, livraison, SPF/DKIM/DMARC). Cas d'usage typiques :

- après un déploiement Vercel → valider que SMTP fonctionne toujours ;
- après un changement de relais (Brevo → Resend) → vérifier la nouvelle chaîne ;
- après une modification DNS (SPF / DKIM / DMARC) → vérifier que Gmail accepte ;
- démo client → envoyer un « notification » formaté pour présenter le rendu.

### Déclenchement et paramètres

Manuel uniquement : onglet **Actions → Mail Test Send → Run workflow**.

| Input | Type | Défaut | Description |
|---|---|---|---|
| `destinataire` | string | `test@example.com` | Adresse e-mail du destinataire |
| `template` | choice | `test` | `test` (message simple) ou `notification` (titre + tableau de lignes + message) |

Le corps JSON est construit avec `"traiter": true` — **livraison immédiate**,
sans attendre le cron — et la catégorie `TEST_GH_ACTIONS` (repérable dans
`GET /api/mail` pour le filtrage). Codes de retour gérés : `202` = succès ;
`400` demande invalide · `401/403` clé refusée · `422` rejet anti-abus ·
`429` quota atteint (les quatre cas font échouer le workflow avec le code visible).

### Procédure de vérification après envoi

1. Vérifier la boîte du destinataire (et les spams).
2. Sur Gmail : **⋮ → Afficher l'original** → vérifier **SPF / DKIM / DMARC = PASS**.
3. Consulter la timeline du message :
   `${VERCEL_APP_URL}/api/mail?evenements=<id message>` (session
   ADMINISTRATEUR requise) — transitions `MISE_EN_FILE → EN_COURS → ENVOYE`
   ou motifs `RETRY` / `ECHEC`.

L'onglet **Summary** du run affiche destinataire, template, ID message et
statut (`ENVOYE` attendu avec `traiter: true`).

---

## Configuration initiale (une seule fois)

1. **Générer les secrets** — deux valeurs distinctes :
   ```bash
   openssl rand -hex 32   # → CRON_SECRET
   openssl rand -hex 32   # → MAIL_API_KEY
   ```
2. **Côté Vercel** — Project Settings → Environment Variables : ajouter
   `CRON_SECRET` et `MAIL_API_KEY` (Production) avec les valeurs générées ;
   vérifier que `VERCEL_APP_URL` est connue (domaine du projet).
3. **Redéployer Vercel** — les variables d'environnement ne prennent effet
   qu'après un nouveau déploiement.
4. **Côté GitHub** — Settings → Secrets and variables → Actions : créer les
   trois secrets (`VERCEL_APP_URL`, `CRON_SECRET`, `MAIL_API_KEY`) avec les
   mêmes valeurs.
5. **Activer et tester** — onglet Actions → activer les workflows si GitHub
   les a mis en pause (bouton *Enable*) → lancer **Mail Test Send** manuellement
   → vérifier réception + résumé → lancer **Healthcheck** et **Mail Queue
   Processor** manuellement pour valider les résumés.

## Désactivation / réactivation

- **Désactiver ponctuellement** : onglet Actions → workflow → **⋯ → Disable
  workflow** (les crons ne se déclenchent plus, l'historique est conservé).
- **Réactiver** : même chemin → **Enable workflow**.
- Désactivation permanente : supprimer le fichier `.yml` correspondant du
  dépôt (le prochain push retire le workflow).
- Les issues `[Incident]` ouvertes ne sont plus fermées automatiquement tant
  que le Healthcheck est désactivé — les fermer à la main si nécessaire.

## Dépannage

| Problème | Causes possibles | Solution |
|---|---|---|
| Le workflow ne se déclenche pas | Fork (crons désactivés), workflow désactivé manuellement, syntaxe cron invalide | Vérifier *Enable workflow* ; valider le cron (5 champs, UTC) ; les crons ne tournent que sur la branche par défaut |
| `401` sur `/api/mail/process` | `CRON_SECRET` désynchronisé entre Vercel et GitHub, ou secret absent | Re-vérifier les deux valeurs (identiques), re-déployer Vercel après changement |
| `500` sur `/api/health` | `DATABASE_URL` incorrecte, base Neon suspendue / quota atteint | Vérifier la variable côté Vercel, l'état du projet Neon, puis relancer Healthcheck manuellement |
| E-mails bloqués en `EN_ATTENTE` | SMTP non configuré côté Vercel, MX du domaine rejeté, rate-limiting du relais | Vérifier la config SMTP (re-sauvegarder), le relais (quota Brevo/Resend), consulter `GET /api/mail` et `CourrielEvenement` |
| Quota GitHub Actions dépassé | Fréquence du Healthcheck trop élevée pour le plan | Réduire la fréquence du healthcheck (§2) ou passer le dépôt en public (gratuit illimité) |
| Issue d'incident non créée en échec | Labels supprimés ou permission manquante | Les labels sont recréés à la volée à chaque échec ; vérifier que `permissions: issues: write` est bien présent dans le workflow |
