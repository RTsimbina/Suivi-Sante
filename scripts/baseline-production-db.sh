#!/usr/bin/env bash
#
# baseline-production-db.sh
#
# Adopte la nouvelle chaîne de migrations Prisma sur une base de données
# EXISTANTE (créée/maintenue jusqu'ici avec `prisma db push`).
#
# Principe : la base de production correspond déjà au schéma actuel.
# On ne ré-exécute PAS le SQL de la migration baseline (les tables existent),
# on l'enregistre comme "déjà appliquée" via `prisma migrate resolve --applied`.
# Les migrations FUTURES seront, elles, appliquées réellement par
# `prisma migrate deploy` (npm run db:migrate:deploy).
#
# Usage :
#   DATABASE_URL="postgresql://..." npm run db:baseline
#   DATABASE_URL="postgresql://..." FORCE=1 npm run db:baseline   # ignore le contrôle de cohérence
#
set -euo pipefail

cd "$(dirname "$0")/.."

MIGRATION="20260904000000_baseline_postgresql"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERREUR : DATABASE_URL n'est pas défini."
  echo "Usage : DATABASE_URL=\"postgresql://...\" npm run db:baseline"
  exit 1
fi

echo "── 1/3 Contrôle de cohérence base ↔ schéma (prisma migrate diff)"
DRIFT_FILE="$(mktemp)"
# Différences entre l'état RÉEL de la base et le schéma Prisma.
if npx prisma migrate diff \
    --from-url "$DATABASE_URL" \
    --to-schema-datamodel prisma/schema.prisma \
    --script > "$DRIFT_FILE" 2>/dev/null; then
  # Retire les lignes de commentaire pour ne garder que du SQL réel
  if grep -v '^--' "$DRIFT_FILE" | grep -v '^\s*$' | grep -q .; then
    echo "ATTENTION : la base ne correspond pas exactement au schéma Prisma."
    echo "── Différences détectées :"
    cat "$DRIFT_FILE"
    if [ "${FORCE:-0}" != "1" ]; then
      echo ""
      echo "Baseline annulée. Mettez d'abord la base en cohérence (npm run db:push)"
      echo "ou relancez avec FORCE=1 si ces différences sont attendues."
      rm -f "$DRIFT_FILE"
      exit 1
    fi
  else
    echo "OK : la base correspond au schéma Prisma (aucune différence)."
  fi
else
  echo "AVERTISSEMENT : impossible d'exécuter le contrôle de cohérence (base injoignable ?)."
  if [ "${FORCE:-0}" != "1" ]; then
    echo "Baseline annulée. Corrigez DATABASE_URL ou relancez avec FORCE=1 pour forcer."
    rm -f "$DRIFT_FILE"
    exit 1
  fi
fi
rm -f "$DRIFT_FILE"

echo "── 2/3 Enregistrement de la migration ${MIGRATION} comme déjà appliquée"
# Idempotent : si la migration est déjà marquée appliquée, on s'arrête proprement.
STATUS_OUTPUT="$(npx prisma migrate status 2>&1 || true)"
if echo "$STATUS_OUTPUT" | grep -q "have not yet been applied\|have not been applied\|Database schema is empty\|migration table"; then
  npx prisma migrate resolve --applied "$MIGRATION"
else
  echo "La table _prisma_migrations existe déjà et semble à jour — rien à baseliner."
fi

echo "── 3/3 État final des migrations (prisma migrate status)"
npx prisma migrate status

echo ""
echo "Terminé. Désormais :"
echo "  • développement   : npm run db:migrate   (créer/tester une migration)"
echo "  • déploiement     : npm run db:migrate:deploy   (appliquer les migrations en attente)"
