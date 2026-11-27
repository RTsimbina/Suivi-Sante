/**
 * diag-connexion-demo.ts — Diagnostic LECTURE SEULE de la connexion des comptes de démo.
 * ────────────────────────────────────────────────────────────────────────────
 * Reproduit, pour chacun des comptes du catalogue (src/lib/comptes-demo.ts), les
 * contrôles de authorize() (src/lib/auth.ts) directement sur la base :
 *   e-mail trouvé (recherche exacte, comme le login) · doublons / casse · compte actif ·
 *   rôle valide · verrou · mot de passe attendu (bcrypt) · liaison portail.
 * N'écrit RIEN. N'affiche aucun mot de passe ni hash ni URL.
 *
 * Usage : DATABASE_URL=… npx tsx scripts/diag-connexion-demo.ts
 * Sortie : rapport + annotation GitHub « Diagnostic connexion démo ».
 */
import { PrismaClient } from '@prisma/client';
import { compare } from 'bcryptjs';
import { COMPTES_DEMO, emailDemoNormalise } from '../src/lib/comptes-demo';
import { ROLES } from '../src/lib/referentiels';
import { resoudreLiaisonContactEntreprise } from '../src/lib/liaison-externe';
import { resoudreLiaisonPrestataireAvecControle } from '../src/lib/liaison-prestataire';

const db = new PrismaClient();
const MDP = { INTERNE: 'SuiviSante@2026', EXTERNE: 'Contact@2026' } as const;
const lignes: string[] = [];
const log = (l: string) => { lignes.push(l); console.log(l); };

interface Row { id: string; email: string; role: string; actif: boolean; password: string; failedAttempts: number | null; lockoutUntil: Date | null }

async function main() {
  const ep = (process.env.DATABASE_URL ?? '').match(/ep-[a-z0-9-]+/)?.[0] ?? '?';
  const meta = await db.$queryRaw<{ db: string; ro: boolean }[]>`SELECT current_database() AS db, pg_is_in_recovery() AS ro`;
  const total = await db.utilisateur.count();
  log(`Base lue : endpoint ${ep} / base ${meta[0]?.db} / lecture seule=${meta[0]?.ro} / ${total} utilisateurs au total`);

  const resume: Record<string, number> = {};
  for (const c of COMPTES_DEMO) {
    const norm = emailDemoNormalise(c.email);
    const probs: string[] = [];
    let rows: Row[] = [];
    try {
      rows = await db.$queryRaw<Row[]>`
        SELECT id, email, role, actif, password, "failedAttempts", "lockoutUntil"
        FROM "Utilisateur" WHERE lower(trim(email)) = ${norm}`;
    } catch (e) {
      rows = await db.$queryRaw<Row[]>`
        SELECT id, email, role, actif, password, 0 AS "failedAttempts", NULL AS "lockoutUntil"
        FROM "Utilisateur" WHERE lower(trim(email)) = ${norm}`;
      probs.push('colonnes verrou absentes (migration)');
    }
    if (rows.length === 0) {
      probs.push('ABSENT');
    } else {
      const exact = rows.find((r) => r.email === norm);
      if (!exact) probs.push(`E-MAIL NON NORMALISÉ en base ("${rows[0].email}") : le login cherche "${norm}" en recherche exacte`);
      if (rows.length > 1) probs.push(`DOUBLON (${rows.length} lignes)`);
      const u = exact ?? rows[0];
      if (!u.actif) probs.push('INACTIF');
      if (!(ROLES as readonly string[]).includes(u.role)) probs.push(`RÔLE INVALIDE (${u.role})`);
      else if (u.role !== c.role) probs.push(`rôle base=${u.role} ≠ catalogue=${c.role}`);
      if (u.lockoutUntil && u.lockoutUntil.getTime() > Date.now()) probs.push(`VERROUILLÉ jusqu'à ${u.lockoutUntil.toISOString()}`);
      if ((u.failedAttempts ?? 0) > 0) probs.push(`${u.failedAttempts} échec(s) enregistré(s)`);
      const attendu = MDP[c.categorie];
      let mdpOk = false;
      try { mdpOk = await compare(attendu, u.password); } catch { /* hash illisible */ }
      if (!mdpOk) probs.push(`MOT DE PASSE ≠ ${c.categorie === 'INTERNE' ? 'SuiviSante@2026' : 'Contact@2026'}`);
      // Liaison portail (n'empêche pas la connexion mais casse le portail)
      try {
        if (c.role === 'PORTAIL_CLIENT') {
          const a = await db.assure.findFirst({ where: { email: { equals: u.email.trim(), mode: 'insensitive' } }, select: { id: true } });
          if (!a) probs.push('liaison portail : aucun Assure avec cet e-mail');
        } else if (c.role === 'CONTACT_ENTREPRISE') {
          if (!(await resoudreLiaisonContactEntreprise(u.email.trim()))) probs.push('liaison portail : aucune société/contact');
        } else if (c.role === 'PRESTATAIRE') {
          const l = await resoudreLiaisonPrestataireAvecControle(u.email.trim());
          if (l.statut !== 'OK') probs.push(`liaison portail : ${l.statut}`);
        }
      } catch (e) { probs.push(`liaison portail illisible : ${(e as Error).message.slice(0, 80)}`); }
    }
    const bloquants = probs.filter((p) => !/échec\(s\) enregistré|liaison portail/.test(p));
    const verdict = bloquants.length ? '❌' : probs.length ? '⚠️' : '✅';
    resume[verdict] = (resume[verdict] ?? 0) + 1;
    log(`${verdict} ${c.email} [${c.role}]${probs.length ? ' — ' + probs.join(' ; ') : ''}`);
  }
  log(`BILAN : ✅ ${resume['✅'] ?? 0} · ⚠️ ${resume['⚠️'] ?? 0} · ❌ ${resume['❌'] ?? 0} (sur ${COMPTES_DEMO.length})`);
}

main()
  .catch((e) => { log(`ERREUR : ${(e as Error).message.replace(/postgres(ql)?:\/\/\S+/gi, '<url>').slice(0, 400)}`); process.exitCode = 1; })
  .finally(async () => {
    await db.$disconnect();
    const enc = lignes.join('\n').slice(0, 3800).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.log(`::notice title=Diagnostic connexion démo::${enc}`);
  });
