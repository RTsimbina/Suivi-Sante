# Rotation des secrets Neon & déblocage des workflows de monitoring

> Procédure officielle du dépôt. Contexte : trois mots de passe Neon ont été
> exposés dans un environnement local (registre de sécurité du cahier des
> charges V2.0) — la rotation est requise. Ce document couvre aussi le
> déblocage de l'« Attack Challenge Mode » Vercel qui maintient les workflows
> de monitoring (healthcheck, mail-process) en HTTP 429.

## 1. Rotation du mot de passe Neon (push-button)

### Prérequis

| Secret GitHub | État | Rôle |
|---|---|---|
| `NEON_API_KEY` | ✅ déjà configuré | appelle l'API Neon (reset du rôle) |
| `GH_SECRETS_WRITER` | ✅ configuré (PAT) | met à jour le secret `DATABASE_URL` du dépôt (GITHUB_TOKEN n'a pas ce droit) |
| `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` | ⚠️ optionnel | met à jour `DATABASE_URL` côté Vercel automatiquement |

Sans `VERCEL_TOKEN`, l'étape Vercel reste manuelle (3 minutes dans le
dashboard) — le workflow l'affiche en actionnable.

### Exécution

GitHub → **Actions → « Rotation secret Neon » → Run workflow** :

1. `confirmer` = **ROTATION** (sans cette valeur exacte le job ne démarre pas) ;
2. `verifier_migrate` = `true` (recommandé) — déclenche « Migration base de
   données » à la fin pour valider la nouvelle connexion.

Le workflow :

- découvre la branche de production et le rôle propriétaire (`neondb_owner`) ;
- **réinitialise le mot de passe** (l'ancien devient invalide immédiatement) ;
- masque la nouvelle URI et le mot de passe dans les logs (`::add-mask::`) ;
- remplace le secret `DATABASE_URL` (URI **directe**, sans `-pooler` — celle
  qu'utilisent `ci.yml` et `migrate.yml` pour les migrations) ;
- met à jour `DATABASE_URL` **pooled** côté Vercel si `VERCEL_TOKEN` existe ;
- rappelle qu'un **redeploy Vercel** est nécessaire pour reprendre le service.

### ⚠️ Ordre et impact

La rotation invalide instantanément l'ancien mot de passe **partout** :

1. L'application Vercel ne peut plus joindre la base tant que ses variables
   n'ont pas la nouvelle URI **et** un redeploy — faire la fenêtre de rotation
   à un moment creux, en une passe.
2. Tout outil local (`psql`, scripts, GUI) utilisant l'ancienne URI doit être
   re-synchronisé à la main (Neon Console → Connection Details).
3. Après le redeploy : vérifier `/api/health` (200) puis le healthcheck
   (le workflow de monitoring doit repasser au vert — cf. §2 pour le 429).

### Fallback 100 % manuel (sans workflow)

1. Neon Console → Project → **Roles** → `neondb_owner` → Reset password
   (copier l'URI directe et l'URI pooled) ;
2. GitHub → Settings → Secrets → mettre à jour `DATABASE_URL` (URI directe) ;
3. Vercel → Settings → Environment Variables → `DATABASE_URL` (URI pooled,
   `?sslmode=require`) → **Redeploy** ;
4. Vérifier : CI verte, migrate OK, `/api/health` 200.

## 2. Attack Challenge Mode Vercel (HTTP 429 « Vercel Security Checkpoint »)

Depuis ~14/09/2026, l'Attack Challenge Mode du pare-feu Vercel répond **à la
place de l'application** aux automatisations externes : healthcheck et
mail-process reçoivent 429 et ouvrent l'issue `[Incident]` (issue #2). Les
workflows sont déjà **bypass-ready** : ils envoient
`x-vercel-protection-bypass` si le secret `VERCEL_PROTECTION_BYPASS` existe
(3 workflows : `healthcheck.yml`, `mail-process.yml`, `mail-test-send.yml`).

**Deux solutions (une suffit)** — action Vercel, côté propriétaire :

- **Option A (recommandée)** : Vercel → projet → *Firewall* → **Attack
  Challenge Mode → Disable**. Les healthchecks repassent au vert au prochain
  run ; l'issue d'incident se ferme automatiquement (le workflow détecte le
  rétablissement). La protection standard (Deployment Protection) reste
  active — l'Attack Challenge Mode est une mesure d'urgence anti-DDoS, pas un
  réglage permanent.
- **Option B** : Vercel → *Settings → Deployment Protection* → générer un
  **Bypass token** → GitHub → Settings → Secrets → créer
  `VERCEL_PROTECTION_BYPASS` avec cette valeur. Les workflows s'en servent
  automatiquement au prochain run (le secret n'existe pas encore à ce jour).

## 3. Checklist de cohérence après rotation

- [ ] Secret GitHub `DATABASE_URL` = URI directe (nouveau mot de passe)
- [ ] Vercel `DATABASE_URL` = URI pooled (nouveau mot de passe) + redeploy fait
- [ ] Run « Migration base de données » : success (connexion validée)
- [ ] CI : success (les tests utilisent `DATABASE_URL`)
- [ ] `/api/health` : 200 depuis l'extérieur
- [ ] Healthcheck : vert (si §2 traité) et issue `[Incident]` fermée
- [ ] Outils locaux re-synchronisés ; anciennes URIs supprimées des fichiers
      locaux, `.env`, historique de shell
- [ ] `GH_SECRETS_WRITER` conservé (rotation future) ou révoqué si inutile :
      Settings → Secrets → Actions → supprimer
