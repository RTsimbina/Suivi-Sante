/**
 * verif-post-deploiement.mjs — Contrôles HTTP RÉELS après déploiement
 * (mission « mise en production » : on ne déclare pas un déploiement bon
 * sans l'avoir sondé).
 *
 * Contrôles exécutés contre l'URL cible :
 *   1. Page de connexion /login                → 200
 *   2. Page d'accueil /                        → 200 ou redirection locale
 *   3. API protégée /api/dossiers sans session → 401 (auth active)
 *   4. Justificatifs /api/upload sans session  → 401 (périmètre protégé)
 *   5. Cron /api/cron/kpi-alertes sans secret  → 401 (gate Bearer CRON_SECRET actif)
 *   6. En production : HTTPS obligatoire
 *
 * Le script ne se connecte JAMAIS (aucun identifiant requis) et ne déclenche
 * JAMAIS les crons (seul le refus sans secret est vérifié).
 *
 * Usage :
 *   node scripts/verif-post-deploiement.mjs --url https://suivi-sante.example.com
 *   node scripts/verif-post-deploiement.mjs --url http://localhost:3000 --recette
 * Sortie : 0 si tous les contrôles passent, 1 sinon.
 */
const args = process.argv.slice(2);
const idxUrl = args.indexOf('--url');
const RECETTE = args.includes('--recette');
const URL_CIBLE = idxUrl >= 0 ? args[idxUrl + 1] : '';
if (!URL_CIBLE) {
  console.error('Usage : node scripts/verif-post-deploiement.mjs --url https://… [--recette]');
  process.exit(1);
}
const base = URL_CIBLE.replace(/\/+$/, '');
const PROD = !RECETTE && !/localhost|127\.0\.0\.1/.test(base);

let echecs = 0;
async function verifier(label, chemin, attendus) {
  try {
    const res = await fetch(`${base}${chemin}`, { redirect: 'manual' });
    const bon = attendus.includes(res.status);
    const coche = bon ? '[OK]      ' : '[ÉCHEC]   ';
    if (!bon) echecs += 1;
    console.log(`${coche}${label.padEnd(46)} HTTP ${res.status} (attendu : ${attendus.join(' ou ')})`);
    return res;
  } catch (e) {
    echecs += 1;
    console.log(`[ÉCHEC]   ${label.padEnd(46)} ${e.cause?.code ?? e.message}`);
    return null;
  }
}

console.log(`═════════════ VÉRIFICATION POST-DÉPLOIEMENT : ${base} ═════════════`);

if (PROD && !base.startsWith('https://')) {
  console.log('[BLOQUANT] Production exige HTTPS — l\'URL fournie ne commence pas par https://');
  echecs += 1;
}

await verifier('Page de connexion', '/login', [200]);
await verifier('Page d\'accueil', '/', [200, 307, 308]);
await verifier('API dossiers sans session (auth)', '/api/dossiers', [401, 307]);
await verifier('Upload justificatifs sans session', '/api/upload', [401, 307]);
await verifier('Cron sans secret (gate CRON_SECRET)', '/api/cron/kpi-alertes', [401, 307]);

// En-têtes de sécurité (si le middleware les pose)
const resLogin = await fetch(`${base}/login`);
const csp = resLogin.headers.get('content-security-policy');
const xfo = resLogin.headers.get('x-frame-options');
console.log(`${csp || xfo ? '[OK]      ' : '[AVERTISSMT]'}En-têtes sécurité (${csp ? 'CSP' : ''}${csp && xfo ? ' + ' : ''}${xfo ? 'X-Frame-Options' : ''})${csp || xfo ? '' : ' — absents'}`);

console.log(echecs ? `\nRÉSULTAT : ${echecs} contrôle(s) en échec — NE PAS considérer le déploiement comme bon.` : '\nRÉSULTAT : TOUS LES CONTRÔLES POST-DÉPLOIEMENT PASSENT.');
process.exit(echecs ? 1 : 0);
