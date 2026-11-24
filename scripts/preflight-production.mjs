/**
 * preflight-production.mjs — Contrôle de configuration AVANT déploiement
 * (mission « mise en production » : aucun redémarrage sans vérification).
 *
 * Vérifie, SANS JAMAIS afficher de valeur secrète (masque 4 premiers + longueur) :
 *   - NEXTAUTH_URL       : présent en production, HTTPS (sauf recette explicite),
 *                          pas de localhost, pas de barre oblique finale ;
 *   - NEXTAUTH_SECRET    : présent, fort (≥ 32 caractères), pas de valeur d'exemple ;
 *   - DATABASE_URL       : présent, schéma PostgreSQL, pas de localhost en
 *                          production, sslmode=require recommandé (Neon) ;
 *   - CRON_SECRET        : requis en production (les 3 crons de vercel.json
 *                          dépendent du gate Bearer), ≥ 24 caractères ;
 *   - BLOB_READ_WRITE_TOKEN : facultatif (repli base conservé) ; format
 *                          vercel_blob_rw_… si présent ;
 *   - GOOGLE_CLIENT_ID/SECRET : AVERTISSEMENT si définies (aucun code ne les lit) ;
 *   - TELEGRAM_BOT_TOKEN : facultatif, format si présent ;
 *   - courrier           : RESEND_API_KEY ou triplet SMTP complet si MAIL attendu ;
 *   - NODE_ENV           : production pour un déploiement de production.
 *
 * Usage :
 *   node scripts/preflight-production.mjs --env-file .env.production.local
 *   node scripts/preflight-production.mjs --recette        # tolère HTTP/non-prod
 *   node scripts/preflight-production.mjs                  # lit l'environnement courant
 * Sortie : 0 si tout est prêt, 1 si au moins une erreur bloquante.
 */
import { readFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const RECETTE = args.includes('--recette');
const envIdx = args.indexOf('--env-file');
let vars = { ...process.env };
if (envIdx >= 0) {
  const file = args[envIdx + 1];
  if (!file || !existsSync(file)) {
    console.error(`ERREUR : fichier d'environnement introuvable : ${file}`);
    process.exit(1);
  }
  const analyse = {};
  for (const ligne of readFileSync(file, 'utf8').split('\n')) {
    const m = ligne.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    analyse[m[1]] = v;
  }
  vars = { ...process.env, ...analyse };
}

// Défaut : exigences PRODUCTION (HTTPS, secrets forts, CRON_SECRET requis).
// --recette relaxe : HTTP toléré, absence de CRON_SECRET/courrier tolérée.
const PROD = !RECETTE;
const erreurs = [], avertissements = [], ok = [];

function masquer(v) { return v ? `${v.slice(0, 4)}…(${v.length} car.)` : '(absent)'; }
function valeurExemple(v) {
  if (!v) return false;
  const base = v.toLowerCase();
  return base.includes('changeme') || base.includes('votre-') || base.includes('example')
    || base.includes('exemple') || /^(.)\1{11,}$/.test(v) || ['secret', 'changeme', '123456'].includes(base);
}

// ── NEXTAUTH_URL ─────────────────────────────────────────────────────────────
const nextauthUrl = vars.NEXTAUTH_URL;
if (!nextauthUrl) {
  erreurs.push('NEXTAUTH_URL absente — sessions, callbacks et liens de réinitialisation cassés.');
} else {
  if (PROD && !nextauthUrl.startsWith('https://')) {
    erreurs.push(`NEXTAUTH_URL doit être HTTPS en production (masqué : ${nextauthUrl.replace(/\/\/[^/]+/, '//***')}).`);
  } else if (!nextauthUrl.startsWith('http://') && !nextauthUrl.startsWith('https://')) {
    erreurs.push('NEXTAUTH_URL doit commencer par https:// (ou http:// en recette).');
  } else ok.push(`NEXTAUTH_URL schéma ${nextauthUrl.startsWith('https') ? 'HTTPS' : 'HTTP (recette)'}`);
  if (nextauthUrl.endsWith('/')) erreurs.push('NEXTAUTH_URL ne doit pas finir par « / » (callbacks doublés).');
  if (/localhost|127\.0\.0\.1/.test(nextauthUrl) && PROD) erreurs.push('NEXTAUTH_URL pointe sur localhost en production.');
}

// ── NEXTAUTH_SECRET ──────────────────────────────────────────────────────────
const secret = vars.NEXTAUTH_SECRET;
if (!secret) erreurs.push('NEXTAUTH_SECRET absente — aucune session signée possible.');
else if (secret.length < 32) erreurs.push(`NEXTAUTH_SECRET trop faible (${secret.length} caractères, minimum 32).`);
else if (valeurExemple(secret)) erreurs.push('NEXTAUTH_SECRET ressemble à une valeur d\'exemple.');
else ok.push('NEXTAUTH_SECRET présente et suffisamment longue');

// ── DATABASE_URL ─────────────────────────────────────────────────────────────
const dbUrl = vars.DATABASE_URL;
if (!dbUrl) erreurs.push('DATABASE_URL absente.');
else {
  if (!/^postgres(ql)?:\/\//.test(dbUrl)) erreurs.push('DATABASE_URL n\'est pas une URL PostgreSQL.');
  else {
    ok.push('DATABASE_URL PostgreSQL présente');
    if (/localhost|127\.0\.0\.1/.test(dbUrl) && PROD) erreurs.push('DATABASE_URL pointe sur localhost en production.');
    if (!/sslmode=require/.test(dbUrl) && PROD) avertissements.push('DATABASE_URL sans sslmode=require (recommandé pour Neon).');
  }
}

// ── CRON_SECRET ──────────────────────────────────────────────────────────────
const cronSecret = vars.CRON_SECRET;
if (!cronSecret && PROD) erreurs.push('CRON_SECRET absente en production — les 3 crons (vercel.json) échoueraient en 401.');
else if (cronSecret && cronSecret.length < 24) erreurs.push(`CRON_SECRET trop faible (${cronSecret.length} caractères, minimum 24).`);
else if (cronSecret && valeurExemple(cronSecret)) erreurs.push('CRON_SECRET ressemble à une valeur d\'exemple.');
else if (cronSecret) ok.push('CRON_SECRET présente et robuste');

// ── BLOB_READ_WRITE_TOKEN (facultatif — repli base conservé) ────────────────
const blob = vars.BLOB_READ_WRITE_TOKEN;
if (!blob) avertissements.push('BLOB_READ_WRITE_TOKEN absente — justificatifs en repli BASE (fonctionnel et sécurisé).');
else if (!blob.startsWith('vercel_blob_rw_')) erreurs.push('BLOB_READ_WRITE_TOKEN ne respecte pas le format vercel_blob_rw_…');
else ok.push('BLOB_READ_WRITE_TOKEN présente — stockage objet PRIVÉ actif');

// ── Variables mortes ─────────────────────────────────────────────────────────
if (vars.GOOGLE_CLIENT_ID || vars.GOOGLE_CLIENT_SECRET) {
  avertissements.push('GOOGLE_CLIENT_ID/SECRET définies mais AUCUN code ne les lit (auth par identifiants) — à retirer.');
}

// ── Telegram / courrier ──────────────────────────────────────────────────────
const tg = vars.TELEGRAM_BOT_TOKEN;
if (tg && !/^\d+:[A-Za-z0-9_-]{30,}$/.test(tg)) erreurs.push('TELEGRAM_BOT_TOKEN ne respecte pas le format <id>:<clé>.');
else if (tg) ok.push('TELEGRAM_BOT_TOKEN présente (intégration activée)');
else if (PROD) avertissements.push('TELEGRAM_BOT_TOKEN absente — intégration Telegram désactivée (attendu si non utilisée).');

const resend = vars.RESEND_API_KEY;
const smtpComplet = vars.SMTP_HOST && vars.SMTP_USER && vars.SMTP_PASS;
if (!resend && !smtpComplet && PROD) avertissements.push('Aucun transport de courrier complet (RESEND_API_KEY ou SMTP_HOST/USER/PASS) — envois indisponibles.');
else ok.push(`Courrier : ${resend ? 'Resend' : 'SMTP'} configuré`);

// ── NODE_ENV ─────────────────────────────────────────────────────────────────
if (PROD && vars.NODE_ENV !== 'production') avertissements.push('NODE_ENV ≠ production pour un déploiement de production (cookies __Secure- désactivés).');
else if (vars.NODE_ENV === 'production') ok.push('NODE_ENV=production');

// ── Rapport ──────────────────────────────────────────────────────────────────
console.log('═══════════════ PREFLIGHT CONFIGURATION (valeurs masquées) ═══════════════');
for (const v of ok) console.log(`  [OK]          ${v}`);
for (const v of avertissements) console.log(`  [AVERTISSMT]  ${v}`);
for (const v of erreurs) console.log(`  [BLOQUANT]    ${v}`);
console.log(`\nSecrets vérifiés : NEXTAUTH_SECRET=${masquer(secret)}  CRON_SECRET=${masquer(cronSecret)}  BLOB=${masquer(blob)}`);
console.log(erreurs.length ? `\nRÉSULTAT : DÉPLOIEMENT REFUSÉ — ${erreurs.length} erreur(s) bloquante(s).` : '\nRÉSULTAT : CONFIGURATION PRÊTE POUR LE DÉPLOIEMENT.');
process.exit(erreurs.length ? 1 : 0);
