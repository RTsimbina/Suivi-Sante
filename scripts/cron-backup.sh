#!/usr/bin/env bash
#
# cron-backup.sh — Sauvegarde quotidienne programmée (mission « mise en production »).
# Enveloppe backup-db.sh avec : verrou anti-recouvrement, journal, copie
# hors site optionnelle, alerte d'échec (déléguée à backup-db.sh via
# ALERT_WEBHOOK_URL), et NE JAMAIS stocker de secret dans le journal.
#
# Installation (machine d'exploitation avec postgresql-client) :
#   crontab -e  puis  :
#   0 2 * * * DATABASE_URL="postgresql://…" ALERT_WEBHOOK_URL="https://…" \
#     COPY_TO_DIR="/srv/backups-hors-site" /srv/suivi-sante/scripts/cron-backup.sh
#
# Variables (env ou fichier .env.cron à côté du script) :
#   DATABASE_URL       requis — base à sauvegarder
#   ALERT_WEBHOOK_URL  optionnel — alerte JSON en cas d'échec
#   COPY_TO_DIR        optionnel — copie du dump + .sha256 hors de la machine
#   BACKUP_DIR         optionnel — défaut backups/
#   KEEP               optionnel — rétention (défaut 10)
set -uo pipefail

cd "$(dirname "$0")/.."

# Fichier d'options optionnel (chmod 600 !) pour éviter les secrets dans crontab
if [ -f "$(dirname "$0")/.env.cron" ]; then
  # shellcheck disable=SC1091
  set -a; . "$(dirname "$0")/.env.cron"; set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "$(date '+%F %T') ERREUR : DATABASE_URL absente (voir en-tête du script)." >> backups/cron-backup.log 2>/dev/null || true
  exit 1
fi

mkdir -p backups
LOCK=/tmp/suivi-sante-backup.lock
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "$(date '+%F %T') Sauvegarde déjà en cours — abandon de ce déclenchement." >> backups/cron-backup.log
  exit 0
fi

echo "$(date '+%F %T') Sauvegarde programmée démarrée" >> backups/cron-backup.log
if bash scripts/backup-db.sh >> backups/cron-backup.log 2>&1; then
  DERNIER="$(ls -1t backups/suivi-sante-*.dump backups/suivi-sante-*.sql 2>/dev/null | head -1)"
  echo "$(date '+%F %T') OK : $DERNIER" >> backups/cron-backup.log
  # Copie hors site (dump + empreinte) — recommandé : une autre machine/volume
  if [ -n "${COPY_TO_DIR:-}" ] && [ -n "$DERNIER" ]; then
    mkdir -p "$COPY_TO_DIR"
    cp -f "$DERNIER" "$DERNIER.sha256" "$COPY_TO_DIR/" 2>/dev/null && \
      echo "$(date '+%F %T') Copie hors site effectuée vers $COPY_TO_DIR" >> backups/cron-backup.log
  fi
  exit 0
else
  echo "$(date '+%F %T') ÉCHEC de la sauvegarde (voir journal + alerte webhook)" >> backups/cron-backup.log
  exit 1
fi
