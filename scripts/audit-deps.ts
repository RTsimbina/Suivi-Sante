/**
 * Audit des dépendances inutilisées et composants UI morts.
 * Usage: npx tsx scripts/audit-deps.ts
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

// ── Collecter tous les fichiers sources ────────────────────────────────────
function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx|js|jsx|css|mjs)$/.test(name)) acc.push(p);
  }
  return acc;
}

const files = [
  ...walk(SRC),
  ...walk(join(ROOT, 'scripts')).filter((f) => !f.includes('audit-deps')),
  'postcss.config.mjs',
  'eslint.config.mjs',
  'next.config.ts',
  'vitest.config.ts',
].filter((f) => {
  try { statSync(f); return true; } catch { return false; }
});

const contents = new Map<string, string>();
for (const f of files) {
  try { contents.set(f, readFileSync(f, 'utf8')); } catch { /* ignore */ }
}

const allCode = [...contents.values()].join('\n');

// ── 1. Dépendances inutilisées ─────────────────────────────────────────────
console.log('=== DEPENDANCES ===');
const used: string[] = [];
const unused: string[] = [];
for (const dep of Object.keys(pkg.dependencies)) {
  // Import direct: "from 'dep'" | "import('dep')" | require('dep') | "from 'dep/sous'"
  const bare = dep.split('/').slice(0, dep.startsWith('@') ? 2 : 1).join('/');
  const re = new RegExp(
    `from ['"]${bare.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}(/|['"])|import\\(['"]${bare.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}|require\\(['"]${bare.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}`,
  );
  if (re.test(allCode)) used.push(dep);
  else unused.push(dep);
}
console.log('UTILISÉES  (' + used.length + '):', used.join(', '));
console.log('\nINUTILISÉES (' + unused.length + '):');
unused.forEach((d) => console.log('  -', d));

// ── 2. Composants UI jamais importés ───────────────────────────────────────
console.log('\n=== COMPOSANTS UI ===');
const uiDir = join(SRC, 'components', 'ui');
const uiFiles = readdirSync(uiDir).filter((f) => f.endsWith('.tsx') && !f.includes('.test.'));
// Consommateurs = tout fichier src/ HORS du dossier ui lui-même (vues, app, lib…)
const consumers = [...contents.entries()]
  .filter(([f]) => f.startsWith(SRC) && !f.startsWith(uiDir))
  .map(([, c]) => c)
  .join('\n');
// Ensemble de référence = consommateurs + les autres composants ui (dépendances internes)
const uiAndConsumers = consumers + '\n' + [...contents.entries()]
  .filter(([f]) => f.startsWith(uiDir))
  .map(([f, c]) => (f.endsWith('.tsx') ? c : '')) // ne compter que le code, pas les self-imports
  .join('\n');

const dead: string[] = [];
const alive: string[] = [];
for (const f of uiFiles) {
  const base = f.replace(/\.tsx$/, '');
  // importé par les vues/pages/lib OU par un autre composant ui (ex: toaster -> toast)
  const re = new RegExp(`['"]@/components/ui/${base}['"]`);
  if (re.test(uiAndConsumers)) alive.push(f);
  else dead.push(f);
}
console.log('VIVANTS  (' + alive.length + '):', alive.join(', '));
console.log('\nMORTS (' + dead.length + '):');
dead.forEach((d) => console.log('  -', d));

// ── 3. Croisement: radix des composants morts ──────────────────────────────
console.log('\n=== RADIX REFERENCES PAR COMPOSANTS MORTS UNIQUEMENT ===');
for (const d of dead) {
  const code = readFileSync(join(uiDir, d), 'utf8');
  const radix = [...code.matchAll(/from ['"](@radix-ui\/[a-z-]+)['"]/g)].map((m) => m[1]);
  if (radix.length) console.log(`  ${d}: ${[...new Set(radix)].join(', ')}`);
}
