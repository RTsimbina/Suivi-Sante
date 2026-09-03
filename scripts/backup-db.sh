#!/usr/bin/env bash
#
# backup-db.sh — Sauvegarde de la base de données avant migration/déploiement
#
# Usage :
#   DATABASE_URL="postgresql://..." bash scripts/backup-db.sh
#
# Variables d'environnement (toutes optionnelles) :
#   BACKUP_DIR   répertoire de destination (défaut : backups/)
#   FORMAT       custom (défaut, compressé, restaurable via pg_restore) | sql
#   KEEP         nombre de sauvegardes conservées (défaut : 10, 0 = ne jamais purger)
#
# La sauvegarde est vérifiée (lisibilité + taille non nulle) avant d'être déclarée OK.
set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-backups}"
FORMAT="${FORMAT:-custom}"
KEEP="${KEEP:-10}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERREUR : DATABASE_URL n'est pas défini."
  echo "Usage : DATABASE_URL=\"postgresql://...\" bash scripts/backup-db.sh"
  exit 1
fi

# ── pg_dump disponible ? ────────────────────────────────────────────────
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERREUR : pg_dump est introuvable. Installez les outils client PostgreSQL :"
  echo "  • Debian/Ubuntu : sudo apt-get install -y postgresql-client"
  echo "  • macOS (Homebrew) : brew install libpq && brew link --force libpq"
  echo "  • Windows : https://www.postgresql.org/download/windows/ (binaires client)"
  echo "  • Neon : utilisez une connexion DIRECTE (sans -pooler dans l'hôte)"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
EXT="dump"; [ "$FORMAT" = "sql" ] && EXT="sql"
FILE="$BACKUP_DIR/suivi-sante-$STAMP.$EXT"

echo "── Sauvegarde de la base ($(echo "$DATABASE_URL" | sed -E 's#//[^@]+@#//***@#'))"
echo "   Format : $FORMAT"
STARTED=$(date +%s)

DUMP_ARGS=(--no-owner --no-privileges)
if [ "$FORMAT" = "custom" ]; then
  DUMP_ARGS+=(-Fc)
else
  DUMP_ARGS+=(--clean --if-exists)
fi

if ! pg_dump "${DUMP_ARGS[@]}" -f "$FILE" "$DATABASE_URL"; then
  rm -f "$FILE"
  echo "ERREUR : la sauvegarde a échoué (détails ci-dessus). Aucune migration ne doit être lancée."
  exit 1
fi

# ── Vérification d'intégrité ────────────────────────────────────────────
if [ ! -s "$FILE" ]; then
  echo "ERREUR : le fichier de sauvegarde est vide ($FILE). Sauvegarde supprimée."
  rm -f "$FILE"
  exit 1
fi

if [ "$FORMAT" = "custom" ]; then
  if ! pg_restore --list "$FILE" >/dev/null 2>&1; then
    echo "ERREUR : le fichier de sauvegarde est illisible (pg_restore --list a échoué)."
    exit 1
  fi
else
  if ! grep -q "PostgreSQL database dump" "$FILE"; then
    echo "ERREUR : le fichier ne ressemble pas à un dump SQL valide."
    exit 1
  fi
fi

DURATION=$(( $(date +%s) - STARTED ))
SIZE_HUMAN=$(du -h "$FILE" | cut -f1)
OBJECTS=$(pg_restore --list "$FILE" 2>/dev/null | grep -c -E "^[0-9]+;" || true)

echo "OK : sauvegarde créée et vérifiée"
echo "   Fichier : $FILE"
echo "   Taille  : $SIZE_HUMAN${OBJECTS:+   Objets : $OBJECTS}   Durée : ${DURATION}s"

# ── Rétention : garder les KEEP sauvegardes les plus récentes ───────────
if [ "$KEEP" -gt 0 ]; then
  # NB : « || true » indispensable — si un des globs (*.sql) ne matche rien,
  # ls renvoie un code non nul qui, combiné à pipefail + set -e, tuerait le script.
  ALL_BACKUPS="$(ls -1t "$BACKUP_DIR"/suivi-sante-*.dump "$BACKUP_DIR"/suivi-sante-*.sql 2>/dev/null || true)"
  PURGED=0
  if [ -n "$ALL_BACKUPS" ]; then
    while IFS= read -r old; do
      [ -f "$old" ] || continue
      rm -f "$old"
      PURGED=$((PURGED + 1))
    done <<< "$(echo "$ALL_BACKUPS" | tail -n +$((KEEP + 1)))"
  fi
  if [ "$PURGED" -gt 0 ]; then
    echo "   Rétention : $PURGED ancienne(s) sauvegarde(s) supprimée(s) (KEEP=$KEEP)"
  fi
fi

echo ""
echo "Conservez ce fichier jusqu'à validation des tests post-déploiement."
echo "Restauration d'urgence : bash scripts/restore-db.sh \"$FILE\""
