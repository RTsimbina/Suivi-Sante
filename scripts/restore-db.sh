#!/usr/bin/env bash
#
# restore-db.sh — Restauration d'urgence d'une sauvegarde (ÉCRASE la base cible)
#
# Usage :
#   DATABASE_URL="postgresql://..." bash scripts/restore-db.sh backups/suivi-sante-XXXX.dump
#
# ⚠️  DANGER : cette commande REMPLACE TOUT le contenu de la base cible
#     (structure et données) par celui de la sauvegarde.
#     À n'utiliser qu'en cas d'incident, après avoir stoppé l'application.
#
# Format détecté automatiquement :
#   .dump → pg_restore (format custom, créé par backup-db.sh par défaut)
#   .sql  → psql
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERREUR : DATABASE_URL n'est pas défini."
  echo "Usage : DATABASE_URL=\"postgresql://...\" bash scripts/restore-db.sh <fichier>"
  exit 1
fi

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "ERREUR : fichier de sauvegarde introuvable : '${FILE}'"
  echo "Usage : DATABASE_URL=\"postgresql://...\" bash scripts/restore-db.sh backups/suivi-sante-XXXX.dump"
  ls -1t backups/ 2>/dev/null | head -5 | sed 's/^/  disponible : /' || true
  exit 1
fi

DB_NAME="$(echo "$DATABASE_URL" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')"
URL_DISPLAY="$(echo "$DATABASE_URL" | sed -E 's#//[^@]+@#//***@#')"

# ── Vérification de l'empreinte de la sauvegarde (mission sauvegardes) ──
# backup-db.sh écrit <fichier>.sha256 à côté du dump. On vérifie AVANT
# toute opération destructive : une sauvegarde corrompue au transfert est
# refusée au lieu d'écraser la base avec du contenu illisible.
if command -v sha256sum >/dev/null 2>&1; then
  if [ -f "$FILE.sha256" ]; then
    echo "── Vérification SHA-256 de la sauvegarde…"
    if (cd "$(dirname "$FILE")" && sha256sum -c "$(basename "$FILE").sha256" >/dev/null 2>&1); then
      echo "   OK : empreinte vérifiée ($(cut -d' ' -f1 "$FILE.sha256"))"
    else
      echo "ERREUR : l'empreinte SHA-256 ne correspond pas — sauvegarde corrompue au transfert."
      echo "        Ne restaurez PAS ce fichier ; utilisez une autre sauvegarde vérifiable."
      exit 1
    fi
  else
    echo "AVERTISSEMENT : pas de fichier $FILE.sha256 — intégrité non vérifiable (sauvegarde antérieure à backup-db.sh durci)."
  fi
fi

echo "════════════════════════════════════════════════════════════"
echo "  RESTAURATION D'URGENCE — OPÉRATION DESTRUCTIVE"
echo "════════════════════════════════════════════════════════════"
echo "  Cible          : $URL_DISPLAY"
echo "  Base           : $DB_NAME"
echo "  Sauvegarde     : $FILE ($(du -h "$FILE" | cut -f1))"
echo ""
echo "  TOUT le contenu actuel de la base sera remplacé définitivement"
echo "  (structure ET données) par celui de la sauvegarde."
echo "  Stoppez l'application avant de continuer."
echo "════════════════════════════════════════════════════════════"
echo ""
printf "Tapez le nom de la base (%s) pour confirmer, autre chose pour annuler : " "$DB_NAME"
read -r ANSWER
if [ "$ANSWER" != "$DB_NAME" ]; then
  echo "Annulé. Aucune modification effectuée."
  exit 1
fi

case "$FILE" in
  *.dump)
    if ! command -v pg_restore >/dev/null 2>&1; then
      echo "ERREUR : pg_restore introuvable (installez postgresql-client)."
      exit 1
    fi
    echo "── Restauration (pg_restore --clean --if-exists)…"
    pg_restore --clean --if-exists --no-owner --no-privileges -d "$DATABASE_URL" "$FILE"
    ;;
  *.sql)
    if ! command -v psql >/dev/null 2>&1; then
      echo "ERREUR : psql introuvable (installez postgresql-client)."
      exit 1
    fi
    echo "── Restauration (psql)…"
    psql "$DATABASE_URL" -f "$FILE"
    ;;
  *)
    echo "ERREUR : extension non reconnue (.dump ou .sql attendu) : $FILE"
    exit 1
    ;;
esac

echo ""
echo "OK : base restaurée depuis $FILE"
echo "Vérifications recommandées :"
echo "  DATABASE_URL=\"$DATABASE_URL\" npx prisma migrate status"
echo "  puis reconnectez l'application et lancez la checklist de fonctionnement"
echo "  (docs/checklist-deploiement.md)."
