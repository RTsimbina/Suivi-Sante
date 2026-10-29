#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Désactivation de l'Attack Challenge Mode Vercel (Firewall) — API officielle
# ─────────────────────────────────────────────────────────────────────────────
# Quand l'ACM est actif, tout trafic non-navigateur (curl, GitHub Actions,
# moniteurs) reçoit un défi HTTP 429 « Vercel Security Checkpoint » au lieu de
# la réponse de l'application : /api/health, les crons mail, etc. échouent.
#
# Ce script bascule l'ACM via l'API Vercel (spécification OpenAPI officielle) :
#   POST https://api.vercel.com/v1/security/attack-mode
#        { "projectId": "...", "attackModeEnabled": false }
#   GET  https://api.vercel.com/v1/security/firewall/config?projectId=...
#
# Usage :
#   export VERCEL_TOKEN=…        # jeton : vercel.com → Settings → Tokens
#   export VERCEL_PROJECT_ID=…   # Vercel → Settings → General → Project ID
#   [export VERCEL_TEAM_ID=…]    # uniquement si le projet vit dans une Team
#   [export VERCEL_APP_URL=…]    # sonde finale /api/health (optionnelle)
#
#   ./scripts/vercel-acm-off.sh            # désactive l'ACM
#   ./scripts/vercel-acm-off.sh statut     # lecture seule (statut courant)
#
# Sécurité : le token n'est JAMAIS affiché (ni en clair, ni tronqué) — il est
# uniquement transmis en en-tête Bearer aux appels api.vercel.com.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

MODE="${1:-desactiver}"

if [ "${MODE}" != "desactiver" ] && [ "${MODE}" != "statut" ]; then
  echo "Usage : $0 [desactiver|statut]   (défaut : desactiver)" >&2
  exit 2
fi

: "${VERCEL_TOKEN:?Variable VERCEL_TOKEN manquante — générer un jeton sur vercel.com → Settings → Tokens}"
: "${VERCEL_PROJECT_ID:?Variable VERCEL_PROJECT_ID manquante — Vercel → Settings → General → Project ID}"

TEAM_Q=""
if [ -n "${VERCEL_TEAM_ID:-}" ]; then
  TEAM_Q="&teamId=${VERCEL_TEAM_ID}"
fi

echo "Token présent (valeur non affichée). Projet : ${VERCEL_PROJECT_ID}"

lire_statut() {
  local fichier="$1"
  local code
  code=$(curl -sS -o "${fichier}" -w '%{http_code}' \
    -H "Authorization: Bearer ${VERCEL_TOKEN}" \
    "https://api.vercel.com/v1/security/firewall/config?projectId=${VERCEL_PROJECT_ID}${TEAM_Q}") || code="000"
  echo "GET /v1/security/firewall/config → HTTP ${code}"
  if [ "${code}" != "200" ]; then
    echo "Erreur : lecture de la configuration impossible. Vérifier le token (portée), le Project ID et le Team ID." >&2
    head -c 400 "${fichier}" 2>/dev/null; echo >&2
    exit 1
  fi
  python3 - "${fichier}" <<'PY'
import json, sys
try:
    cfg = json.load(open(sys.argv[1]))
except Exception as e:
    print(f"Réponse illisible : {e}")
    raise SystemExit(0)
acm = cfg.get('attackModeEnabled')
if acm is None:
    print("Champ attackModeEnabled non exposé par l'API (statut non déterminé).")
elif acm:
    print("Attack Challenge Mode = ACTIF (d'où les 429 « Vercel Security Checkpoint »)")
else:
    print("Attack Challenge Mode = inactif")
until_ = cfg.get('attackModeActiveUntil')
if until_:
    print(f"attackModeActiveUntil = {until_}")
PY
}

echo "── Statut AVANT ──"
lire_statut /tmp/acm_config_avant.json

if [ "${MODE}" = "statut" ]; then
  echo "Lecture seule terminée (aucune modification)."
  exit 0
fi

echo "── Désactivation ──"
code=$(curl -sS -o /tmp/acm_post.json -w '%{http_code}' \
  -X POST \
  -H "Authorization: Bearer ${VERCEL_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\":\"${VERCEL_PROJECT_ID}\",\"attackModeEnabled\":false}" \
  "https://api.vercel.com/v1/security/attack-mode${TEAM_Q}") || code="000"
echo "POST /v1/security/attack-mode → HTTP ${code}"
if [ "${code}" != "200" ] && [ "${code}" != "201" ]; then
  echo "Erreur : désactivation refusée par l'API. Réponse :" >&2
  head -c 500 /tmp/acm_post.json 2>/dev/null; echo >&2
  exit 1
fi
echo "Désactivation acceptée par l'API Vercel."

echo "── Statut APRÈS ──"
sleep 2
lire_statut /tmp/acm_config_apres.json

if [ -n "${VERCEL_APP_URL:-}" ]; then
  echo "── Sonde finale /api/health ──"
  sleep 3
  code=$(curl -sS -o /tmp/acm_health.html -w '%{http_code}' --max-time 15 \
    "${VERCEL_APP_URL}/api/health") || code="000"
  echo "GET ${VERCEL_APP_URL}/api/health → HTTP ${code}"
  if [ "${code}" = "200" ]; then
    echo "OK : l'application répond de nouveau aux sondes non-navigateur."
  elif grep -q "Vercel Security Checkpoint" /tmp/acm_health.html 2>/dev/null; then
    echo "Attention : le défi anti-bot répond encore — réessayer dans quelques instants." >&2
    exit 1
  else
    echo "Attention : HTTP ${code} inattendu — inspecter les logs Vercel si le problème persiste." >&2
  fi
else
  echo "Astuce : définir VERCEL_APP_URL pour une sonde finale automatique de /api/health."
fi

echo "Terminé. Le healthcheck GitHub (cycle de 30 min) confirmera le retour à la normale et fermera l'issue d'incident."
