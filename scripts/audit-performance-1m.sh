#!/usr/bin/env bash
# audit-performance-1m.sh — Mesures de charge sur le jeu de démonstration
# (1 000 000 dossiers). Mesure les temps de réponse RÉELS des endpoints
# critiques avec une session administrateur réelle (NextAuth credentials).
#
# Pré-requis : application démarrée sur $BASE (build production + DATABASE_URL
# pointant sur la base chargée). Ne modifie AUCUNE donnée (lectures seules,
# sauf la connexion elle-même qui met à jour dernierLogin).
#
# Usage : BASE=http://localhost:3000 ./scripts/audit-performance-1m.sh
set -uo pipefail
BASE=${BASE:-http://localhost:3000}
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT

echo "════ AUDIT DE PERFORMANCE — $BASE ════"

# 1) Jeton CSRF puis connexion avec le compte administrateur de démonstration
CSRF=$(curl -s -c "$JAR" "$BASE/api/auth/csrf" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')
if [ -z "$CSRF" ]; then echo "ÉCHEC : CSRF indisponible (application démarrée ?)"; exit 1; fi
CODE=$(curl -s -b "$JAR" -c "$JAR" -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=admin@suivisante.mg" \
  --data-urlencode "password=SuiviSante@2026" --data-urlencode "json=true")
echo "Connexion admin : HTTP $CODE"

# 2) Mesures (temps total de réponse, code HTTP)
mesure() {
  local label="$1" chemin="$2"
  local res
  res=$(curl -s -b "$JAR" -o /dev/null -w "%{time_total} %{http_code}" "$BASE$chemin")
  printf "%-58s %ss  HTTP %s\n" "$label" "${res% *}" "${res#* }"
}

echo "── Listes et filtres dossiers ──"
mesure "Liste page 1 (défaut)"                 "/api/dossiers?page=1&limit=20"
mesure "Liste page 50 profonde"                "/api/dossiers?page=50&limit=20"
mesure "Filtre statut PAYE"                    "/api/dossiers?statut=PAYE&page=1&limit=20"
mesure "Filtre statut RECU (rare)"             "/api/dossiers?statut=RECU&page=1&limit=20"
mesure "Filtre société (nom exact)"            "/api/dossiers?societe=B%C3%A2timent&page=1&limit=20"
mesure "Recherche bénéficiaire (trigram)"      "/api/dossiers?search=Rakoto&page=1&limit=20"
mesure "Recherche numéro de dossier"           "/api/dossiers?search=DOS-2026-000500&page=1&limit=20"
mesure "Suivi (mode options)"                  "/api/dossiers/suivi?mode=options"
echo "── Tableaux de bord ──"
mesure "KPIs financiers (agrégats 1M)"         "/api/kpis"
mesure "KPI performance GLOBAL (année 2026)"   "/api/kpi/performance?periodeMode=ANNUEL&periodeAnnee=2026"
mesure "KPI performance TECHNIQUE (oct. 2026)" "/api/kpi/performance?periodeMode=MENSUEL&periodeAnnee=2026&periodeIndex=10&service=TECHNIQUE"
mesure "KPI performance ACCUEIL (oct. 2026)"   "/api/kpi/performance?periodeMode=MENSUEL&periodeAnnee=2026&periodeIndex=10&service=ACCUEIL"
mesure "KPI COMPTABILITE (oct. 2026)"          "/api/kpi/performance?periodeMode=MENSUEL&periodeAnnee=2026&periodeIndex=10&service=COMPTABILITE"
mesure "KPI CONTROLE_MEDICAL (oct. 2026)"      "/api/kpi/performance?periodeMode=MENSUEL&periodeAnnee=2026&periodeIndex=10&service=CONTROLE_MEDICAL"
mesure "Alertes KPI"                           "/api/kpi/alertes?periodeMode=ANNUEL&periodeAnnee=2026"
mesure "Référentiel gestionnaires"             "/api/dossiers/gestionnaires"
echo "── Fin de l'audit ──"
