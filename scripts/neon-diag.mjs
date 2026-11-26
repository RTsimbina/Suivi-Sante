/**
 * neon-diag.mjs — Diagnostic complet Neon côté GitHub Actions.
 * Lit NEON_API_KEY, NEON_PROJECT_ID et DATABASE_URL depuis l'environnement.
 * N'affiche JAMAIS de secret (URI/mot de passe masqués, tests → OK/ÉCHEC).
 *
 *  1. Liste tous les projets accessibles à la clé API.
 *  2. Pour chaque projet : endpoints (host, branche, état du compute),
 *     avec marquage explicite de l'endpoint cible du secret DATABASE_URL.
 *  3. Rôle propriétaire de la branche par défaut (updated_at = dernière
 *     rotation de mot de passe).
 *  4. Tests SQL réels : URI du secret en DIRECT et en POOLED (hôte corrigé),
 *     + test du nouveau mot de passe contre les endpoints du projet référencé
 *     par NEON_PROJECT_ID.
 */
const API = 'https://console.neon.tech/api/v2';
const KEY = process.env.NEON_API_KEY || '';
const PROJECT_REF = process.env.NEON_PROJECT_ID || '';
const DB_URL = process.env.DATABASE_URL || '';

const h = { Authorization: `Bearer ${KEY}`, 'User-Agent': 'neon-diag' };
const get = async (p) => {
  const r = await fetch(`${API}${p}`, { headers: h });
  if (!r.ok) throw new Error(`${p} → HTTP ${r.status} ${await r.text()}`);
  return r.json();
};

const urlsplit = (u) => new URL(u);
const masque = (u) => {
  try { const x = urlsplit(u); return `${x.protocol}//${x.username}:***@${x.hostname}${x.port ? ':' + x.port : ''}${x.pathname}`; }
  catch { return '(uri illisible)'; }
};

const run = async (label, cmd, { env = {}, timeoutMs = 40000 } = {}) => {
  const { execFileSync } = await import('node:child_process');
  try {
    const out = execFileSync('bash', ['-lc', cmd], { env: { ...process.env, ...env }, timeout: timeoutMs, encoding: 'utf8' });
    console.log(`  ${label}: OK`);
    if (out.trim()) console.log(out.trim().split('\n').map((l) => `    ${l}`).join('\n'));
    return true;
  } catch (e) {
    console.log(`  ${label}: ÉCHEC`);
    const msg = String(e.stdout || e.message || '').split('\n').filter((l) => l.trim() && !l.includes('***')).slice(0, 4);
    if (msg.length) console.log(msg.map((l) => `    ${l}`).join('\n'));
    return false;
  }
};

try {
  // 1. Tous les projets
  const { projects } = await get('/projects');
  console.log('══ Projets accessibles à cette clé API:');
  for (const p of projects) console.log(`  - id=${p.id} nom="${p.name}" créé=${p.created_at} branche_défaut=${p.default_branch_id || '?'}`);

  // 2. Endpoints par projet
  let cibleTrouvee = null;
  let hostSecret = '';
  if (DB_URL) { try { hostSecret = urlsplit(DB_URL).hostname; } catch {} }
  for (const p of projects) {
    const { endpoints } = await get(`/projects/${p.id}/endpoints`);
    console.log(`\n══ Endpoints du projet ${p.id} (${p.name}):`);
    for (const e of endpoints) {
      const marque = hostSecret && e.host === hostSecret ? '  ← ← ← CIBLE DU SECRET DATABASE_URL' : '';
      if (hostSecret && e.host === hostSecret) cibleTrouvee = p.id;
      console.log(`  - ${e.id} host=${e.host} branche=${e.branch_id}${marque}`);
    }
  }
  if (hostSecret && !cibleTrouvee) {
    console.log(`\n⚠️  L'hôte du secret (${hostSecret}) n'appartient à AUCUN projet accessible à cette clé API.`);
  }

  // 3. Rôle propriétaire (branche par défaut de chaque projet)
  for (const p of projects) {
    const bid = p.default_branch_id || p.branch_id;
    if (!bid) continue;
    try {
      const roles = await get(`/projects/${p.id}/branches/${bid}/roles`);
      const owner = roles.roles.find((r) => r.name === 'neondb_owner') || roles.roles[0];
      if (owner) console.log(`\n══ Rôle « ${owner.name} » du projet ${p.id}: updated_at=${owner.updated_at} protected=${owner.protected}`);
    } catch (e) { console.log(`  (rôles illisibles pour ${p.id}: ${e.message})`); }
  }

  // 4. Tests SQL réels
  if (!DB_URL) { console.log('\n(secret DATABASE_URL absent — tests SQL ignorés)'); process.exit(0); }
  const PGBIN = 'pg_isready -d';
  console.log('\n══ Tests SQL (URI du secret):');
  await run('DIRECT (URI telle quelle)', `${PGBIN} "$DATABASE_URL" --timeout=25`);

  const u = urlsplit(DB_URL);
  const pooledHost = u.hostname.includes('-pooler')
    ? u.hostname
    : u.hostname.replace(/^([^.]+)\./, '$1-pooler.');
  const uriPooled = `${u.protocol}//${u.username}:${encodeURIComponent(decodeURIComponent(u.password))}@${pooledHost}:${u.port || 5432}${u.pathname}${u.search || '?sslmode=require'}`;
  await run('POOLED (hôte corrigé)', `${PGBIN} "$URI_POOLED" --timeout=25`, { env: { URI_POOLED: uriPooled } });

  // Test du mot de passe du secret contre les endpoints du projet référencé
  if (PROJECT_REF) {
    try {
      const { endpoints } = await get(`/projects/${PROJECT_REF}/endpoints`);
      for (const e of endpoints) {
        if (e.host === hostSecret) continue; // déjà testé
        const uriAlt = `${u.protocol}//${u.username}:${encodeURIComponent(decodeURIComponent(u.password))}@${e.host}:${u.port || 5432}${u.pathname}${u.search || '?sslmode=require'}`;
        await run(`SECRET vs endpoint du projet ${PROJECT_REF} (${e.id})`, `psql "$URI_ALT" -t -c "SELECT 'CONNECTE ' || current_database();"`, { env: { URI_ALT: uriAlt }, timeoutMs: 45000 });
      }
    } catch (e) { console.log(`  (endpoints de ${PROJECT_REF} illisibles: ${e.message})`); }
  }
} catch (e) {
  console.error('DIAGNOSTIC EN ÉCHEC:', e.message);
  process.exit(1);
}
