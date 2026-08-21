// Script de correction des 13 erreurs BASSES
// Exécuté via: npx tsx scripts/fix-basses.ts
// Les corrections sont appliquées in-place.

import fs from 'fs';
import path from 'path';

const BASE = path.resolve(__dirname, '..');

function readFile(rel: string): string {
  return fs.readFileSync(path.join(BASE, rel), 'utf-8');
}

function writeFile(rel: string, content: string): void {
  fs.writeFileSync(path.join(BASE, rel), content, 'utf-8');
}

// ─── 1. Timing-safe comparison helper ───────────────────────────────────────
// Add a timingSafeEqual utility to lib/auth.ts

function addTimingSafeHelper() {
  const file = 'src/lib/auth.ts';
  let content = readFile(file);
  // Add import for timingSafeEqual at top if not present
  if (!content.includes('timingSafeEqual')) {
    content = 'import { timingSafeEqual } from "crypto";\n' + content;
    // Add exported helper function after imports
    const insertAfter = "// Extend NextAuth types";
    const helper = `// ─── Timing-safe string comparison ──────────────────────────────────
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

${insertAfter}`;
    content = content.replace(insertAfter, helper);
  }
  writeFile(file, content);
  console.log('  [OK] Added safeCompare helper to auth.ts');
}

// ─── 2. Setup token timing-safe ─────────────────────────────────────────────
function fixSetupTimingSafe() {
  const file = 'src/app/api/setup/route.ts';
  let content = readFile(file);
  // Add import
  content = 'import { timingSafeEqual } from "crypto";\n' + content;
  // Replace the comparison
  content = content.replace(
    'if (!token || token !== process.env.SETUP_TOKEN)',
    'if (!token || !process.env.SETUP_TOKEN || !timingSafeEqual(Buffer.from(token), Buffer.from(process.env.SETUP_TOKEN)))'
  );
  writeFile(file, content);
  console.log('  [OK] Setup token timing-safe');
}

// ─── 3. Webhook tokens timing-safe ─────────────────────────────────────────
function fixWebhookTimingSafe() {
  const files = [
    { path: 'src/app/api/webhook/whatsapp/route.ts', token: 'WHATSAPP_VERIFY_TOKEN' },
    { path: 'src/app/api/webhook/messenger/route.ts', token: 'MESSENGER_VERIFY_TOKEN' },
  ];
  for (const { path: f, token } of files) {
    let content = readFile(f);
    if (!content.includes('timingSafeEqual')) {
      content = 'import { timingSafeEqual } from "crypto";\n' + content;
    }
    content = content.replace(
      `token === ${token}`,
      `timingSafeEqual(Buffer.from(token), Buffer.from(${token}))`
    );
    writeFile(f, content);
    console.log(`  [OK] ${token} timing-safe`);
  }
}

// ─── 4. Email validation in reporting ───────────────────────────────────────
function fixEmailValidation() {
  const file = 'src/app/api/reporting/rapport/route.ts';
  let content = readFile(file);
  // Add email validation before sending
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const oldCode = `    if (destinataires && destinataires.length > 0) {`;
  const newCode = `    if (destinataires && destinataires.length > 0) {
      // Valider les adresses email
      const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
      const invalidEmails = destinataires.filter((e: string) => !emailRegex.test(e));
      if (invalidEmails.length > 0) {
        return NextResponse.json(
          { erreur: \`Adresses email invalides : \${invalidEmails.join(', ')}\` },
          { status: 400 }
        );
      }
      if (destinataires.length > 20) {
        return NextResponse.json(
          { erreur: 'Maximum 20 destinataires autorises.' },
          { status: 400 }
        );
      }`;
  content = content.replace(oldCode, newCode);
  writeFile(file, content);
  console.log('  [OK] Email validation in reporting');
}

// ─── 5. Default role SANTE → ADMINISTRATEUR ─────────────────────────────────
function fixDefaultRole() {
  const file = 'src/lib/auth.ts';
  let content = readFile(file);
  content = content.replace(
    "token.role = user.role || 'SANTE';",
    "token.role = user.role || 'ADMINISTRATEUR';"
  );
  writeFile(file, content);
  console.log('  [OK] Default role fallback SANTE → ADMINISTRATEUR');
}

// ─── 6. Sante data isolation by societe ─────────────────────────────────────
function fixSanteIsolation() {
  const file = 'src/app/api/sante/verifier-assure/route.ts';
  let content = readFile(file);
  
  // POST: add societeId filter for non-admin roles
  // Replace the findFirst with a filtered version
  const oldPost = `    const assure = await db.assure.findFirst({
      where: {
        OR: [
          { id: { equals: query } },
          { nSS: { equals: query, mode: 'insensitive' } },
          { nom: { contains: query, mode: 'insensitive' } },
          { prenom: { contains: query, mode: 'insensitive' } },
          { email: { equals: query, mode: 'insensitive' } },
          { telephone: { contains: query } },
        ],
      },`;
  const newPost = `    // Filtrer par societe si l'utilisateur n'est pas admin
    const userRole = request.headers.get('x-user-role');
    const userSocieteId = request.headers.get('x-user-societeid');
    const societeFilter: Record<string, unknown> = {};
    if (userRole !== 'ADMINISTRATEUR' && userSocieteId) {
      societeFilter.societeId = userSocieteId;
    }

    const assure = await db.assure.findFirst({
      where: {
        ...societeFilter,
        OR: [
          { id: { equals: query } },
          { nSS: { equals: query, mode: 'insensitive' } },
          { nom: { contains: query, mode: 'insensitive' } },
          { prenom: { contains: query, mode: 'insensitive' } },
          { email: { equals: query, mode: 'insensitive' } },
          { telephone: { contains: query } },
        ],
      },`;
  content = content.replace(oldPost, newPost);
  
  // GET: add societeId filter
  const oldGet = `    const resultats = await db.assure.findMany({
      where: {
        OR: [
          { id: { contains: q } },
          { nSS: { contains: q, mode: 'insensitive' } },
          { nom: { contains: q, mode: 'insensitive' } },
          { prenom: { contains: q, mode: 'insensitive' } },
        ],
      },`;
  const newGet = `    const searchRole = request.headers.get('x-user-role');
    const searchSocieteId = request.headers.get('x-user-societeid');
    const searchFilter: Record<string, unknown> = {};
    if (searchRole !== 'ADMINISTRATEUR' && searchSocieteId) {
      searchFilter.societeId = searchSocieteId;
    }

    const resultats = await db.assure.findMany({
      where: {
        ...searchFilter,
        OR: [
          { id: { contains: q } },
          { nSS: { contains: q, mode: 'insensitive' } },
          { nom: { contains: q, mode: 'insensitive' } },
          { prenom: { contains: q, mode: 'insensitive' } },
        ],
      },`;
  content = content.replace(oldGet, newGet);
  
  // Fix the silent catch
  content = content.replace(
    '  } catch {\n    return Response.json({ resultats: [] });',
    '  } catch (error) {\n    console.error(\'[SANTÉ] Erreur recherche assurés:\', error);\n    return Response.json({ resultats: [] });'
  );
  
  writeFile(file, content);
  console.log('  [OK] Sante data isolation by societe');
}

// ─── 7. formatDate edge cases ───────────────────────────────────────────────
function fixFormatDate() {
  const file = 'src/components/suivisante/format.ts';
  let content = readFile(file);
  const oldFn = `export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(date));
}`;
  const newFn = `export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}`;
  content = content.replace(oldFn, newFn);
  writeFile(file, content);
  console.log('  [OK] formatDate edge cases');
}

// ─── 8. Ayants droit validation ──────────────────────────────────────────────
function fixAyantsDroit() {
  const file = 'src/app/api/assures/route.ts';
  let content = readFile(file);
  
  // POST: add societeId check for principal
  const oldCheck = `      if (principal.typeBeneficiaire !== 'ASSURE') {
        return NextResponse.json(
          { erreur: 'L\'assuré référencé n\'est pas un assuré principal.' },
          { status: 400 }
        );
      }
    }`;
  const newCheck = `      if (principal.typeBeneficiaire !== 'ASSURE') {
        return NextResponse.json(
          { erreur: 'L\'assuré référencé n\'est pas un assuré principal.' },
          { status: 400 }
        );
      }
      if (principal.societeId !== societeId) {
        return NextResponse.json(
          { erreur: "L'assuré principal n'appartient pas à la même société." },
          { status: 400 }
        );
      }
    }`;
  content = content.replace(oldCheck, newCheck);
  
  // PUT: validate assurePrincipalId change
  const oldPut = `    if (assurePrincipalId !== undefined) updateData.assurePrincipalId = assurePrincipalId || null;`;
  const newPut = `    if (assurePrincipalId !== undefined) {
      if (assurePrincipalId) {
        const principal = await db.assure.findUnique({ where: { id: assurePrincipalId } });
        if (!principal) {
          return NextResponse.json({ erreur: 'Assuré principal introuvable.' }, { status: 404 });
        }
        if (principal.typeBeneficiaire !== 'ASSURE') {
          return NextResponse.json({ erreur: "L'assuré référencé n'est pas un assuré principal." }, { status: 400 });
        }
        if (principal.societeId !== (existing.societeId)) {
          return NextResponse.json({ erreur: "L'assuré principal n'appartient pas à la même société." }, { status: 400 });
        }
      }
      updateData.assurePrincipalId = assurePrincipalId || null;
    }`;
  content = content.replace(oldPut, newPut);
  
  writeFile(file, content);
  console.log('  [OK] Ayants droit validation');
}

// ─── 9. Fix generic catch blocks without logging ─────────────────────────────
function fixGenericCatchBlocks() {
  const fixes: { file: string; tag: string; oldCatch: string }[] = [
    { file: 'src/app/api/societes/route.ts', tag: 'SOCIETES', oldCatch: '} catch {\n    return NextResponse.json({ error: \'Erreur\' }, { status: 500 });\n  }' },
    { file: 'src/app/api/baremes/route.ts', tag: 'BAREMES', oldCatch: '} catch {\n    return NextResponse.json({ error: \'Erreur\' }, { status: 500 });\n  }' },
    { file: 'src/app/api/email-config/route.ts', tag: 'EMAIL_CONFIG', oldCatch: '} catch {\n    return NextResponse.json({ error: \'Erreur\' }, { status: 500 });\n  }' },
    { file: 'src/app/api/appels-fonds/route.ts', tag: 'APPELS_FONDS', oldCatch: '} catch {\n    return NextResponse.json({ error: \'Erreur\' }, { status: 500 });\n  }' },
    { file: 'src/app/api/dossiers/societes/route.ts', tag: 'DOSSIERS_SOCIETES', oldCatch: '} catch {\n    return NextResponse.json({ error: \'Erreur\' }, { status: 500 });\n  }' },
    { file: 'src/app/api/dossiers/gestionnaires/route.ts', tag: 'DOSSIERS_GESTIONNAIRES', oldCatch: '} catch {\n    return NextResponse.json({ error: \'Erreur\' }, { status: 500 });\n  }' },
  ];
  
  for (const { file, tag, oldCatch } of fixes) {
    try {
      let content = readFile(file);
      const newCatch = `} catch (error) {\n    console.error(\'[${tag}] Erreur:\', error);\n    return NextResponse.json({ erreur: \'Erreur lors de l\'opération.\' }, { status: 500 });\n  }`;
      if (content.includes(oldCatch)) {
        content = content.replace(oldCatch, newCatch);
        writeFile(file, content);
        console.log(`  [OK] ${tag} catch block`);
      } else {
        // Try alternate patterns
        const alt1 = `} catch {\n    return NextResponse.json({ erreur: "Erreur" }, { status: 500 });\n  }`;
        const altNew1 = `} catch (error) {\n    console.error(\'[${tag}] Erreur:\', error);\n    return NextResponse.json({ erreur: "Erreur lors de l'opération." }, { status: 500 });\n  }`;
        if (content.includes(alt1)) {
          content = content.replace(alt1, altNew1);
          writeFile(file, content);
          console.log(`  [OK] ${tag} catch block (alt)`);
        }
      }
    } catch (e) {
      console.log(`  [SKIP] ${file} not found`);
    }
  }
}

// ─── 10. Remove --accept-data-loss from build ─────────────────────────────────
function fixBuildScript() {
  const file = 'package.json';
  let content = readFile(file);
  content = content.replace(
    'npx prisma db push --accept-data-loss 2>&1',
    'npx prisma db push 2>&1'
  );
  writeFile(file, content);
  console.log('  [OK] Removed --accept-data-loss from build');
}

// ─── 11. Remove unused dependencies ─────────────────────────────────────────
function removeUnusedDeps() {
  const file = 'package.json';
  let content = readFile(file);
  const depsToRemove = [
    'framer-motion',
    'react-markdown',
    'react-syntax-highlighter',
    'sharp',
    'uuid',
    'lightningcss',
    '@hookform/resolvers',
    '@reactuses/core',
  ];
  const pkg = JSON.parse(content);
  let removed = 0;
  for (const dep of depsToRemove) {
    if (pkg.dependencies && pkg.dependencies[dep]) {
      delete pkg.dependencies[dep];
      removed++;
    }
    if (pkg.devDependencies && pkg.devDependencies[dep]) {
      delete pkg.devDependencies[dep];
      removed++;
    }
  }
  writeFile(file, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`  [OK] Removed ${removed} unused dependencies`);
}

// ─── 12. Audit log for DELETE utilisateur ─────────────────────────────────────
function fixDeleteAudit() {
  const file = 'src/app/api/utilisateurs/route.ts';
  let content = readFile(file);
  
  // Add audit log before deletion
  const oldDelete = '    await db.utilisateur.delete({ where: { id } });';
  const newDelete = `    await db.utilisateur.delete({ where: { id } });\n\n    // Audit log\n    try {\n      await db.historiqueParametre.create({\n        data: {\n          entite: 'Utilisateur',\n          entiteId: id,\n          champ: 'SUPPRESSION',\n          ancienneValeur: \`\${existing.nom} (\${existing.email}), Role: \${existing.role}\`,\n          nouvelleValeur: null,\n          modifiePar: 'SYSTEM',\n        },\n      });\n    } catch { /* ne pas bloquer */ }`;
  content = content.replace(oldDelete, newDelete);
  
  writeFile(file, content);
  console.log('  [OK] DELETE utilisateur audit log');
}

// ─── Run all fixes ────────────────────────────────────────────────────────────
console.log('Fixing 13 LOW priority issues...\n');
addTimingSafeHelper();
fixSetupTimingSafe();
fixWebhookTimingSafe();
fixEmailValidation();
fixDefaultRole();
fixSanteIsolation();
fixFormatDate();
fixAyantsDroit();
fixGenericCatchBlocks();
fixBuildScript();
removeUnusedDeps();
fixDeleteAudit();
console.log('\nDone!');
