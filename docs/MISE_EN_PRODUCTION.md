# Mise en production — Suivi Santé

Procédure opérationnelle pas à pas. Elle s'appuie sur les outils livrés dans
`scripts/` et complète `docs/checklist-deploiement.md` (checklist de
fonctionnement) et `docs/checklist-migrations.md` (côté base).

> Règle d'or : **aucun redémarrage sans préflight, aucune migration sans
> sauvegarde vérifiée, aucun déploiement déclaré bon sans vérification
> post-déploiement.**

## Outils disponibles

| Script | Rôle |
|---|---|
| `scripts/preflight-production.mjs` | Valide la configuration AVANT tout redémarrage (refus bloquant, secrets masqués) |
| `scripts/backup-db.sh` | Sauvegarde PostgreSQL vérifiée (SHA-256 + rétention + alerte échec) |
| `scripts/restore-db.sh` | Restauration d'urgence (vérifie l'empreinte AVANT d'écraser) |
| `scripts/cron-backup.sh` | Sauvegarde quotidienne programmée (verrou, journal, copie hors site) |
| `scripts/test-backup-restore.mjs` | Test complet sauvegarde→restauration sur PG isolés (aucune base réelle) |
| `scripts/verif-post-deploiement.mjs` | Contrôles HTTP réels après déploiement (auth, gate cron, HTTPS) |
| `scripts/migrate-justificatifs-vers-blob.mjs` | Migration progressive des justificatifs vers Blob privé |
| `scripts/deploy-production.sh` | Pipeline de déploiement (sauvegarde obligatoire avant migration) |

## Étape 0 — Pré-requis

- Accès au tableau de bord **Vercel** (projets recette et production) et à la
  console **Neon** (branches recette/production).
- Une **machine d'exploitation** avec `postgresql-client` (pg_dump/pg_restore),
  accès réseau à la base Neon et volume de stockage pour les dumps.
- Définir un secret de session et un secret cron **distincts par
  environnement** (`openssl rand -hex 32`).

## Étape 1 — Variables d'environnement dans Vercel

À saisir dans **Settings → Environment Variables**, par environnement, sans
jamais mélanger les valeurs. Aucun secret ne doit apparaître dans `.env.example`
ni dans les journaux.

| Variable | Exigence production |
|---|---|
| `NEXTAUTH_URL` | URL publique HTTPS exacte du domaine servi, sans `/` final |
| `NEXTAUTH_SECRET` | ≥ 32 caractères, propre à l'environnement |
| `DATABASE_URL` | Base Neon du même environnement (`sslmode=require`) |
| `CRON_SECRET` | ≥ 24 caractères — les 3 crons de `vercel.json` en dépendent |
| `NODE_ENV` | `production` |
| `BLOB_READ_WRITE_TOKEN` | Facultatif : à définir seulement après création du store (étape 2) ; sinon repli base |
| `RESEND_API_KEY` **ou** `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` | Transport courrier ; relais d'un domaine contrôlé + SPF/DKIM/DMARC |
| `TELEGRAM_BOT_TOKEN` | Seulement si l'intégration est activée |
| `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` | **Ne pas définir** — aucun code ne les lit (auth par identifiants) |

## Étape 2 — Store Vercel Blob (facultatif mais recommandé)

1. Créer le store Blob lié au projet (onglet Storage de Vercel).
2. Récupérer `BLOB_READ_WRITE_TOKEN` et le définir dans Vercel.
3. Effet : les **nouveaux** justificatifs partent en stockage objet **privé**
   (lecture par URL signée courte durée) ; les anciens restent lisibles en base.
4. Ne jamais rendre ce token obligatoire tant que la migration des anciens
   justificatifs n'est pas terminée.

## Étape 3 — Preflight (avant tout redémarrage)

```bash
node scripts/preflight-production.mjs --env-file <fichier d'env de l'environnement>
```

Toute erreur `[BLOQUANT]` interdit le déploiement (HTTPS, force des secrets,
CRON_SECRET, format du token Blob…). Les avertissements sont à arbitrer
explicitement (courrier, Telegram, repli base).

## Étape 4 — Sauvegarde avant migration (obligatoire)

```bash
DATABASE_URL="postgresql://…" bash scripts/backup-db.sh
```

Le dump + son `.sha256` sont écrits dans `backups/`. Copier les deux fichiers
**hors de la base et hors de la machine** (volume externe, stockage objet…).
`deploy-production.sh` exige déjà cette sauvegarde avant les migrations.

## Étape 5 — Déploiement

1. Pousser sur `main` (déploiement Vercel automatique) ou déployer explicitement.
2. Vérifier que les migrations s'appliquent (`npx prisma migrate deploy` via le
   pipeline — jamais de migration destructive sans sauvegarde de l'étape 4).
3. Surveiller les logs Vercel (erreurs au démarrage = rollback, voir plus bas).

## Étape 6 — Vérification post-déploiement

```bash
node scripts/verif-post-deploiement.mjs --url https://<domaine-production>
```

Contrôles : page de connexion 200, API protégées 401 sans session, gate cron
401 sans secret, HTTPS, en-têtes de sécurité. Puis la checklist manuelle
(`docs/checklist-deploiement.md`) : connexion avec un compte réel, ouverture
d'un dossier, ajout + consultation + téléchargement d'un justificatif, journal
d'audit.

## Étape 7 — Programmer la sauvegarde quotidienne

Sur la machine d'exploitation (`crontab -e`) :

```
0 2 * * * DATABASE_URL="postgresql://…" ALERT_WEBHOOK_URL="https://…" \
  COPY_TO_DIR="/srv/backups-hors-site" /srv/suivi-sante/scripts/cron-backup.sh
```

- `COPY_TO_DIR` : copie du dump + empreinte hors de la machine (fortement
  recommandé).
- `ALERT_WEBHOOK_URL` : alerte en cas d'échec (le script de sauvegarde masque
  l'URL de connexion dans le message).
- **Vérifier la sauvegarde** : restaurer périodiquement un dump dans un
  environnement isolé (`restore-db.sh` refuse un dump corrompu) et rejouer
  `node scripts/test-backup-restore.mjs` après chaque évolution majeure.
  Une sauvegarde fournisseur non testée ne compte pas comme une sauvegarde.

## Étape 8 — Migration des justificatifs vers Blob (si le store est adopté)

```bash
node scripts/migrate-justificatifs-vers-blob.mjs              # inventaire + intégrité
node scripts/migrate-justificatifs-vers-blob.mjs --apply --limit 50   # par lots
```

- En recette d'abord, puis en production **après** sa sauvegarde (étape 4).
- Le script ne met à jour une ligne qu'après re-téléchargement du blob et
  vérification SHA-256 ; l'origine est journalisée ; en cas d'échec la ligne
  reste intacte.

## Rollback

1. **Application** : redéployer la version précédente depuis Vercel
   (Deployments → Redeploy) — le code est versionné sur `main`.
2. **Base** : ne restaurer qu'en dernier recours, après avoir stoppé
   l'application et sauvegardé l'état actuel :
   `DATABASE_URL="…" bash scripts/restore-db.sh backups/suivi-sante-XXXX.dump`
   (confirmation par nom de base, empreinte vérifiée avant exécution).
3. Rejouer l'étape 6 après toute restauration.

## Critères de « prêt pour la production »

- Preflight vert sur la configuration de production.
- Sauvegarde vérifiable : dump récent + empreinte + **test de restauration
  effectif** dans un environnement isolé.
- Vérification post-déploiement sans échec + checklist fonctionnelle.
- Justificatifs historiques accessibles (data URI ou Blob privé) — jamais de
  suppression avant confirmation de migration.
