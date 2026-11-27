/**
 * test-comptes-demo-e2e.mjs — Tests END-TO-END RÉELS des comptes de
 * démonstration Suivi Santé (exécuté contre le serveur Next local).
 *
 * Ce que ce script vérifie RÉELLEMENT (pas seulement la présence en base) :
 *   1. Connexion NextAuth (csrf + callback credentials + session) de chacun
 *      des 31 comptes de démonstration, avec le bon rôle dans le jeton ;
 *   2. Accès AUTORISÉ à une route clé du rôle (HTTP 200) ;
 *   3. Accès REFUSÉ côté serveur à des routes interdites (HTTP 403) ;
 *   4. Isolation des données : PORTAIL_CLIENT (2 sociétés ≠), CONTACT_ENTREPRISE,
 *      PRESTATAIRE (dossiers limités à sa fiche) ;
 *   5. KPI individuels : /api/kpi/ma-performance alimenté (étapes réelles) ;
 *   6. Désactivation : compte désactivé → sessions révoquées (401) et login
 *      refusé ; réactivation → de nouveau connectable.
 *
 * Usage : BASE=http://localhost:3000 node test-comptes-demo-e2e.mjs
 */
const BASE = process.env.BASE ?? 'http://localhost:3000';
const PWD_INTERNE = 'SuiviSante@2026';
const PWD_EXTERNE = 'Contact@2026';

const COMPTES = [
  { email: 'admin@suivisante.mg', role: 'ADMINISTRATEUR', cat: 'I' },
  { email: 'accueil@suivisante.mg', role: 'ACCUEIL', cat: 'I' },
  { email: 'technique@suivisante.mg', role: 'TECHNIQUE', cat: 'I' },
  { email: 'technique2@suivisante.mg', role: 'TECHNIQUE', cat: 'I' },
  { email: 'technique3@suivisante.mg', role: 'TECHNIQUE', cat: 'I' },
  { email: 'technique4@suivisante.mg', role: 'TECHNIQUE', cat: 'I' },
  { email: 'technique5@suivisante.mg', role: 'TECHNIQUE', cat: 'I' },
  { email: 'compta@suivisante.mg', role: 'COMPTABILITE', cat: 'I' },
  { email: 'compta2@suivisante.mg', role: 'COMPTABILITE', cat: 'I' },
  { email: 'finance1@suivisante.mg', role: 'COMPTABILITE', cat: 'I' },
  { email: 'finance2@suivisante.mg', role: 'COMPTABILITE', cat: 'I' },
  { email: 'sante@suivisante.mg', role: 'SANTE', cat: 'I' },
  { email: 'sante2@suivisante.mg', role: 'SANTE', cat: 'I' },
  { email: 'utilisateur@suivisante.mg', role: 'SANTE', cat: 'I' },
  { email: 'dg@suivisante.mg', role: 'DIRECTION_GENERALE', cat: 'I' },
  { email: 'rs-accueil@suivisante.mg', role: 'RESPONSABLE_SERVICE', cat: 'I' },
  { email: 'rs-technique@suivisante.mg', role: 'RESPONSABLE_SERVICE', cat: 'I' },
  { email: 'rs-controle-medical@suivisante.mg', role: 'RESPONSABLE_SERVICE', cat: 'I' },
  { email: 'rs-comptabilite@suivisante.mg', role: 'RESPONSABLE_SERVICE', cat: 'I' },
  { email: 'contact.sanlam@sanlam.mg', role: 'CONTACT_ENTREPRISE', cat: 'E' },
  { email: 'contact.telma@telma.mg', role: 'CONTACT_ENTREPRISE', cat: 'E' },
  { email: 'j.rakotoarison@jirama.mg', role: 'CONTACT_ENTREPRISE', cat: 'E' },
  { email: 'contact.airtel@airtel.mg', role: 'CONTACT_ENTREPRISE', cat: 'E' },
  { email: 'contact.bni@bni.mg', role: 'CONTACT_ENTREPRISE', cat: 'E' },
  { email: 'portail.sanlam@suivisante.mg', role: 'PORTAIL_CLIENT', cat: 'E' },
  { email: 'portail.telma@suivisante.mg', role: 'PORTAIL_CLIENT', cat: 'E' },
  { email: 'portail.jirama@suivisante.mg', role: 'PORTAIL_CLIENT', cat: 'E' },
  { email: 'portail.airtel@suivisante.mg', role: 'PORTAIL_CLIENT', cat: 'E' },
  { email: 'portail.bni@suivisante.mg', role: 'PORTAIL_CLIENT', cat: 'E' },
  { email: 'contact@clinique-saintemarie.mg', role: 'PRESTATAIRE', cat: 'E' },
  { email: 'facturation@hopital-principal.mg', role: 'PRESTATAIRE', cat: 'E' },
];

const resultats = [];
function rapport(test, ok, detail) {
  resultats.push([test, ok, detail]);
  console.log(`${ok ? '✅' : '❌'} ${test}${detail ? ' — ' + detail : ''}`);
}

async function login(email, password) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { 'User-Agent': 'e2e-demo/1.0' } });
  const { csrfToken } = await csrfRes.json();
  const cookies = csrfRes.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const body = new URLSearchParams({ csrfToken, email, password, json: 'true' });
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookies, 'User-Agent': 'e2e-demo/1.0' },
    body: body.toString(),
    redirect: 'manual',
  });
  const sessionCookies = loginRes.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const sessionRes = await fetch(`${BASE}/api/auth/session`, {
    headers: { Cookie: sessionCookies, 'User-Agent': 'e2e-demo/1.0' },
  });
  const session = await sessionRes.json().catch(() => ({}));
  return { sessionCookies, session, loginStatus: loginRes.status };
}

async function api(cookie, path, method = 'GET') {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Cookie: cookie, 'User-Agent': 'e2e-demo/1.0' },
    redirect: 'manual',
  });
  let body = null;
  try { body = await res.json(); } catch { /* HTML */ }
  return { status: res.status, body };
}

async function main() {
  console.log(`\n🧪 TESTS E2E RÉELS — ${BASE}\n`);

  // ── 1-2-3 : connexion + autorisé/interdit par compte ──────────────────────
  const sondes = {
    'admin@suivisante.mg': { ok: ['/api/utilisateurs', '/api/kpi/objectifs'], ko: [] },
    'accueil@suivisante.mg': { ok: ['/api/dossiers', '/api/import'], ko: ['/api/utilisateurs', '/api/reporting'] },
    'technique2@suivisante.mg': { ok: ['/api/prestataires', '/api/technique/societes'], ko: ['/api/reporting', '/api/utilisateurs'] },
    'finance1@suivisante.mg': { ok: ['/api/reporting/rapport', '/api/appels-fonds'], ko: ['/api/utilisateurs'] },
    'sante2@suivisante.mg': { ok: ['/api/dossiers'], ko: ['/api/reporting', '/api/kpis', '/api/appels-fonds'] },
    'dg@suivisante.mg': { ok: ['/api/kpi/performance', '/api/kpi/alertes'], ko: ['/api/dossiers', '/api/utilisateurs'] },
    'rs-technique@suivisante.mg': { ok: ['/api/kpi/performance', '/api/kpi/ma-performance'], ko: ['/api/dossiers', '/api/utilisateurs'] },
    'portail.sanlam@suivisante.mg': { ok: ['/api/portail-client', '/api/dossiers'], ko: ['/api/utilisateurs', '/api/societes'] },
    'contact.sanlam@sanlam.mg': { ok: ['/api/portail-client', '/api/societes'], ko: ['/api/utilisateurs'] },
    'contact@clinique-saintemarie.mg': { ok: ['/api/portail-prestataire', '/api/profil'], ko: ['/api/dossiers', '/api/societes', '/api/utilisateurs'] },
  };

  const sessions = new Map();
  for (const c of COMPTES) {
    const { sessionCookies, session, loginStatus } = await login(c.email, c.cat === 'I' ? PWD_INTERNE : PWD_EXTERNE);
    const roleOk = session?.user?.role === c.role && session?.user?.id;
    rapport(`connexion ${c.email} → rôle ${c.role}`, !!roleOk, loginStatus === 200 || loginStatus === 302 ? `login HTTP ${loginStatus}, session rôle=${session?.user?.role ?? 'aucun'}` : `login HTTP ${loginStatus}`);
    if (roleOk) sessions.set(c.email, { cookie: sessionCookies, session });
    await new Promise((r) => setTimeout(r, 120));
  }

  // ── Sondes autorisées / interdites (contrôles SERVEUR réels) ──────────────
  for (const [email, { ok, ko }] of Object.entries(sondes)) {
    const s = sessions.get(email);
    if (!s) { rapport(`sondes ${email}`, false, 'session absente'); continue; }
    for (const path of ok) {
      const { status } = await api(s.cookie, path);
      rapport(`AUTORISÉ ${email.split('@')[0]} → ${path}`, status === 200, `HTTP ${status}`);
    }
    for (const path of ko) {
      const { status } = await api(s.cookie, path);
      rapport(`REFUSÉ ${email.split('@')[0]} → ${path}`, status === 403 || status === 401, `HTTP ${status}`);
    }
  }

  // SANTE : actes-assure — la route exige un assureId réel (400 sinon) :
  // on le résout d'abord via GET /api/assures (rôle SANTE autorisé en GET).
  const sSante2 = sessions.get('sante2@suivisante.mg');
  if (sSante2) {
    const ass = await api(sSante2.cookie, '/api/assures');
    const items = Array.isArray(ass.body) ? ass.body : (ass.body?.assures ?? ass.body?.data ?? ass.body?.items ?? []);
    const assureId = items[0]?.id;
    if (assureId) {
      const actes = await api(sSante2.cookie, `/api/sante/actes-assure?assureId=${encodeURIComponent(String(assureId))}`);
      rapport('AUTORISÉ sante2 → /api/sante/actes-assure?assureId=…', actes.status === 200, `HTTP ${actes.status}`);
    } else {
      rapport('AUTORISÉ sante2 → /api/sante/actes-assure?assureId=…', false, `assureId indisponible (GET /api/assures HTTP ${ass.status})`);
    }
  }

  // ── Isolation PORTAIL_CLIENT : deux sociétés, deux périmètres ─────────────
  async function dossiersPortail(email) {
    const s = sessions.get(email);
    if (!s) return null;
    const { status, body } = await api(s.cookie, '/api/dossiers');
    if (status !== 200) return { status, societeIds: [] };
    const items = Array.isArray(body) ? body : (body?.dossiers ?? body?.data ?? body?.items ?? []);
    const ids = [...new Set(items.map((d) => d.societeId ?? d.societe?.id).filter(Boolean))];
    return { status, societeIds: ids, total: items.length };
  }
  const sanlam = await dossiersPortail('portail.sanlam@suivisante.mg');
  const telma = await dossiersPortail('portail.telma@suivisante.mg');
  rapport('PORTAIL_CLIENT isolation : portail.sanlam ne voit qu\u2019UNE société', !!sanlam && sanlam.societeIds.length <= 1, JSON.stringify(sanlam));
  rapport('PORTAIL_CLIENT isolation : portail.telma ne voit qu\u2019UNE société', !!telma && telma.societeIds.length <= 1, JSON.stringify(telma));
  rapport('PORTAIL_CLIENT isolation : périmètres distincts sanlam ≠ telma', !!sanlam && !!telma && JSON.stringify(sanlam.societeIds) !== JSON.stringify(telma.societeIds));

  // CONTACT_ENTREPRISE : liste sociétés limitée à SA société
  const sSanlam = sessions.get('contact.sanlam@sanlam.mg');
  if (sSanlam) {
    const { status, body } = await api(sSanlam.cookie, '/api/societes');
    const items = Array.isArray(body) ? body : (body?.societes ?? body?.data ?? []);
    rapport('CONTACT_ENTREPRISE isolation : /api/societes = SA société seule', status === 200 && items.length === 1, `HTTP ${status}, ${items.length} société(s)`);
  }

  // PRESTATAIRE : dossiers limités à sa fiche (via portail)
  const sPresta = sessions.get('contact@clinique-saintemarie.mg');
  if (sPresta) {
    const { status, body } = await api(sPresta.cookie, '/api/portail-prestataire');
    rapport('PRESTATAIRE : /api/portail-prestataire OK (identité serveur)', status === 200, `HTTP ${status}`);
  }

  // ── 5. KPI individuels alimentés (étapes réelles du seed) ─────────────────
  for (const email of ['technique2@suivisante.mg', 'finance1@suivisante.mg', 'sante2@suivisante.mg', 'accueil@suivisante.mg']) {
    const s = sessions.get(email);
    if (!s) continue;
    const { status, body } = await api(s.cookie, '/api/kpi/ma-performance');
    const volume = body?.volume ?? body?.kpi?.volume ?? null;
    const aDesDonnees = status === 200 && JSON.stringify(body).length > 200;
    rapport(`KPI ma-performance ${email.split('@')[0]}`, aDesDonnees, `HTTP ${status}, réponse ${JSON.stringify(body).length} o`);
  }

  // ── 6. Désactivation → révocation immédiate + login refusé ────────────────
  const admin = sessions.get('admin@suivisante.mg');
  const cible = sessions.get('technique5@suivisante.mg');
  if (admin && cible) {
    const id = cible.session.user.id;
    // PATCH sur la ROUTE COLLECTION /api/utilisateurs — corps { id, actif }
    // (Zod utilisateurPatchSchema) : la variante /api/utilisateurs/<id>
    // n'existe pas (404 constaté au 1er passage).
    const patch = await fetch(`${BASE}/api/utilisateurs`, {
      method: 'PATCH',
      headers: { Cookie: admin.cookie, 'Content-Type': 'application/json', 'User-Agent': 'e2e-demo/1.0' },
      body: JSON.stringify({ id, actif: false }),
    });
    rapport('admin désactive technique5 (PATCH actif=false)', patch.status === 200, `HTTP ${patch.status}`);
    const sondeApres = await api(cible.cookie, '/api/dossiers');
    rapport('session technique5 révoquée après désactivation', sondeApres.status === 401 || sondeApres.status === 403, `HTTP ${sondeApres.status}`);
    const relogin = await login('technique5@suivisante.mg', PWD_INTERNE);
    rapport('login technique5 refusé (compte désactivé)', !relogin.session?.user?.id, `session=${JSON.stringify(relogin.session?.user?.role ?? null)}`);
    const patch2 = await fetch(`${BASE}/api/utilisateurs`, {
      method: 'PATCH',
      headers: { Cookie: admin.cookie, 'Content-Type': 'application/json', 'User-Agent': 'e2e-demo/1.0' },
      body: JSON.stringify({ id, actif: true }),
    });
    rapport('admin réactive technique5', patch2.status === 200, `HTTP ${patch2.status}`);
    const relogin2 = await login('technique5@suivisante.mg', PWD_INTERNE);
    rapport('login technique5 OK après réactivation', relogin2.session?.user?.role === 'TECHNIQUE');
  }

  // ── Mot de passe erroné refusé ────────────────────────────────────────────
  const mauvais = await login('accueil@suivisante.mg', 'MAUVAIS-mot-de-passe-123');
  rapport('mot de passe erroné refusé', !mauvais.session?.user?.id);

  // ── Middleware : page protégée sans session → 302 /login ──────────────────
  const anonyme = await fetch(`${BASE}/`, { redirect: 'manual', headers: { 'User-Agent': 'e2e-demo/1.0' } });
  rapport('page protégée sans session → redirection /login', anonyme.status === 307 || anonyme.status === 302, `HTTP ${anonyme.status} → ${anonyme.headers.get('location') ?? ''}`);
  const connecte = sessions.get('admin@suivisante.mg');
  if (connecte) {
    const dejaConnecte = await fetch(`${BASE}/login`, { redirect: 'manual', headers: { Cookie: connecte.cookie, 'User-Agent': 'e2e-demo/1.0' } });
    rapport('/login avec session → redirection hors login', dejaConnecte.status === 302 || dejaConnecte.status === 307, `HTTP ${dejaConnecte.status}`);
  }

  // ── Bilan ─────────────────────────────────────────────────────────────────
  const echecs = resultats.filter(([, ok]) => !ok);
  console.log(`\n📊 BILAN : ${resultats.length - echecs.length}/${resultats.length} vérifications OK, ${echecs.length} échec(s)`);
  if (echecs.length) {
    console.log('Échecs :');
    for (const [test, , detail] of echecs) console.log(`  - ${test} (${detail ?? ''})`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error('❌ ERREUR SCRIPT :', e); process.exit(1); });
