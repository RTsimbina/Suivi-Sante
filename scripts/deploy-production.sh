#!/usr/bin/env bash
#
# deploy-production.sh — Pipeline de déploiement production sécurisé
#
# Usage :
#   PROD_DATABASE_URL="postgresql://..." bash scripts/deploy-production.sh
#
# Variables (optionnelles) :
#   AUTO_APPROVE=1   ne demande pas la confirmation humaine (pour CI/CD, à éviter en prod)
#   SKIP_TESTS=1     ne relance pas les tests automatiques (vitest + tsc)
#   SKIP_BUILD=1     ne lance pas le build applicatif (si déployé ailleurs, ex. Vercel)
#
# Séquence (aucune étape ne modifie la base avant la sauvegarde) :
#   1. Prérequis                 (URL prod explicite, pg_dump, dépendances, git propre)
#   2. Tests automatiques        (vitest + tsc --noEmit)
#   3. État des migrations prod  (prisma migrate status + diff éventuel base↔schéma)
#   4. SAUVEGARDE de la base     (pg_dump vérifié — scripts/backup-db.sh)
#   5. VALIDATION humaine        (affiche les migrations en attente, demande « OUI »)
#   6. prisma migrate deploy     (applique uniquement les migrations en attente)
#   7. Vérification post-migr.   (migrate status)
#   8. Build de l'application    (ne touche JAMAIS à la base — URL factice imposée)
#   9. Rappel des tests de fonctionnement (docs/checklist-deploiement.md)
#
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -z "${PROD_DATABASE_URL:-}" ]; then
  echo "ERREUR : PROD_DATABASE_URL n'est pas défini."
  echo "Le pipeline refuse d'utiliser DATABASE_URL/.env par défaut : la cible production"
  echo "doit être explicite pour éviter tout accident (recette vs production)."
  echo ""
  echo "Usage : PROD_DATABASE_URL=\"postgresql://...\" bash scripts/deploy-production.sh"
  echo "(utilisez la connexion DIRECTE Neon, sans -pooler, pour les migrations)"
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERREUR : pg_dump introuvable — indispensable pour la sauvegarde pré-migration."
  echo "  Debian/Ubuntu : sudo apt-get install -y postgresql-client"
  echo "  macOS : brew install libpq && brew link --force libpq"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "ERREUR : node_modules absent — lancez d'abord 'npm install'."
  exit 1
fi

# Exporte l'URL prod pour les étapes Prisma/sauvegarde uniquement.
export DATABASE_URL="$PROD_DATABASE_URL"

step() { echo ""; echo "══════ Étape $1 : $2 ══════"; }

step "1/9" "Prérequis"
GIT_DIRTY=$(git status --porcelain 2>/dev/null | wc -l || echo "?")
if [ "$GIT_DIRTY" != "0" ]; then
  echo "AVERTISSEMENT : le dépôt contient des modifications non commitées ($GIT_DIRTY fichiers)."
  echo "  Assurez-vous de déployer une version committée et poussée."
else
  echo "OK : dépôt propre ($(git log --oneline -1))"
fi

if [ "${SKIP_TESTS:-0}" != "1" ]; then
  step "2/9" "Tests automatiques (vitest + TypeScript)"
  npm run test
  npx tsc --noEmit
  echo "OK : tests unitaires et compilation TypeScript"
else
  echo "── Étape 2/9 ignorée (SKIP_TESTS=1)"
fi

step "3/9" "État des migrations sur la base de production"
npx prisma migrate status || true

step "4/9" "SAUVEGARDE de la base (obligatoire avant migration)"
bash scripts/backup-db.sh

if [ "${AUTO_APPROVE:-0}" = "1" ]; then
  step "5/9" "Validation (AUTO_APPROVE=1 — sans confirmation humaine)"
else
  step "5/9" "Validation de la migration (confirmation humaine)"
  echo ""
  echo "La sauvegarde est faite. Les migrations listées à l'étape 3/9 (et ci-dessus)"
  echo "vont être appliquées sur la PRODUCTION."
  echo ""
  printf "Taper OUI (en majuscules) pour appliquer les migrations, autre chose pour annuler : "
  read -r ANSWER
  if [ "$ANSWER" != "OUI" ]; then
    echo "Annulé. La base est intacte ; la sauvegarde de l'étape 4 est conservée."
    exit 1
  fi
fi

step "6/9" "Application des migrations (prisma migrate deploy)"
npx prisma migrate deploy

step "7/9" "Vérification post-migration"
npx prisma migrate status

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  step "8/9" "Build de l'application (sans accès à la base)"
  # URL volontairement factice : le build ne doit JAMAIS contacter la base.
  # Si le build échouait avec cette URL, cela révélerait un accès base au build.
  DATABASE_URL="postgresql://build-isolation:5432/no_db?sslmode=disable&connection_limit=1" npm run build
  echo "OK : build réussi sans contacter la base."
else
  echo "── Étape 8/9 ignorée (SKIP_BUILD=1)"
fi

step "9/9" "Tests de fonctionnement (à faire maintenant)"
echo "Déploiement terminé. Exécutez la checklist de fonctionnement :"
echo "  docs/checklist-deploiement.md"
echo ""
echo "  1. Authentification : connexion / déconnexion / mot de passe / rôles"
echo "  2. Données : création / modification / suppression / recherche / filtres"
echo "  3. Finance : plafonds / montants / remboursements / budgets / appels de fonds"
echo "  4. Imports : Excel valide / incorrect / vide / volumineux / colonnes manquantes"
echo ""
echo "En cas de problème : bash scripts/restore-db.sh <sauvegarde de l'étape 4>"
