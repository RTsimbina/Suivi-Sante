/**
 * migrate-justificatifs-vers-blob.mjs — Migration PROGRESSIVE des
 * justificatifs historiques (data URI en base) vers le stockage objet
 * Vercel Blob (accès PRIVÉ).
 *
 * Garanties de sécurité des données :
 *   - AUCUNE écriture en mode par défaut (dry-run) : inventaire + vérification
 *     d'intégrité de chaque justificatif historique (décodage + magic bytes) ;
 *   - --apply : la valeur d'origine de chaque ligne est sauvegardée dans un
 *     journal JSONL local AVANT toute mise à jour (aucune suppression de la
 *     donnée d'origine sans trace) ;
 *   - la mise à jour n'a lieu qu'APRÈS re-téléchargement du blob et
 *     vérification du hachage SHA-256 du contenu (octet pour octet) ;
 *   - en cas d'échec, la ligne est laissée INTACTE (repli data URI) ;
 *   - --limit N : migration par lots progressifs, relançable sans risque
 *     (les lignes déjà en blob sont ignorées).
 *
 * Usage :
 *   node scripts/migrate-justificatifs-vers-blob.mjs                    # dry-run
 *   node scripts/migrate-justificatifs-vers-blob.mjs --apply --limit 50
 *
 * Variables : DATABASE_URL (base cible), BLOB_READ_WRITE_TOKEN (requis pour --apply).
 */
import { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const racine = `${ici}/..`;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const limitIdx = args.indexOf('--limit');
const LIMITE = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) || 0 : 0;

const db = new PrismaClient();

// Même neutralisation que src/lib/storage.ts (nomFichierSecurise) — le module
// applicatif est en TypeScript avec alias, non importable depuis ce script.
function nomFichierSecurise(nomFichier) {
  const segment = nomFichier.split(/[\\/]+/).pop() ?? '';
  const epure = segment
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/["'`;*?<>|:#$&!{}[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.{2,}/g, '.');
  if (!epure || epure === '.') return 'justificatif';
  if (epure.length <= 120) return epure;
  const idx = epure.lastIndexOf('.');
  const ext = idx >= 0 ? epure.slice(idx).toLowerCase() : '';
  return epure.slice(0, 120 - ext.length) + ext;
}

// Magic bytes identiques à detecterTypeReel (src/lib/storage.ts)
function typeReel(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'application/pdf';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function putPrive(cle, buffer, mimeType) {
  const { put } = await import('@vercel/blob');
  const blob = await put(cle, buffer, {
    contentType: mimeType,
    access: 'private',
    addRandomSuffix: false,
  });
  return blob.url;
}

async function lirePrive(url) {
  const { getDownloadUrl } = await import('@vercel/blob');
  const res = await fetch(getDownloadUrl(url));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const total = await db.justificatif.count();
  const dataUri = await db.justificatif.count({ where: { chemin: { startsWith: 'data:' } } });
  const blob = total - dataUri;
  console.log(`JUSTIFICATIFS total=${total} deja_blob=${blob} data_uri=${dataUri}`);

  if (APPLY && !process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('ERREUR : --apply exige BLOB_READ_WRITE_TOKEN. Aucune modification effectuée.');
    process.exit(1);
  }
  if (APPLY) {
    console.log(`MODE : APPLY (limite ${LIMITE || 'aucune'}) — journal des origines : backups/migration-justificatifs/`);
    mkdirSync(`${racine}/backups/migration-justificatifs`, { recursive: true });
  } else {
    console.log('MODE : DRY-RUN (aucune écriture) — ajoutez --apply [--limit N] pour migrer.');
  }

  const rows = await db.justificatif.findMany({
    where: { chemin: { startsWith: 'data:' } },
    orderBy: { createdAt: 'asc' },
    ...(LIMITE ? { take: LIMITE } : {}),
    select: { id: true, dossierId: true, nomFichier: true, chemin: true, type: true, tailleKo: true },
  });

  let ok = 0, integriteKO = 0, migres = 0, echecs = 0;
  const journal = `${racine}/backups/migration-justificatifs/${new Date().toISOString().slice(0, 10)}.jsonl`;

  for (const row of rows) {
    const m = row.chemin.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) {
      console.error(`  [KO] ${row.id} : data URI malformé`);
      integriteKO += 1;
      continue;
    }
    const bytes = Buffer.from(m[2], 'base64');
    const typeDetecte = typeReel(bytes);
    if (!typeDetecte || typeDetecte !== m[1]) {
      console.error(`  [KO] ${row.id} (${row.nomFichier}) : contenu ${typeDetecte ?? 'inconnu'} ≠ déclaré ${m[1]} — reste en data URI, NE PAS migrer`);
      integriteKO += 1;
      continue;
    }
    ok += 1;
    const empreinte = sha256(bytes);
    console.log(`  [OK] ${row.id} ${row.nomFichier} ${(bytes.length / 1024).toFixed(0)} Ko sha256=${empreinte.slice(0, 12)}…`);

    if (!APPLY) continue;

    try {
      const cle = `justificatifs/${row.dossierId}/${randomUUID()}-${nomFichierSecurise(row.nomFichier)}`;
      const url = await putPrive(cle, bytes, m[1]);
      // Vérification AVANT mise à jour : le blob doit redonner EXACTEMENT les octets
      const relu = await lirePrive(url);
      if (sha256(relu) !== empreinte) throw new Error('SHA-256 divergent après upload');
      // Journal d'origine (restauration manuelle possible si besoin)
      appendFileSync(journal, JSON.stringify({
        sauvegardeLe: new Date().toISOString(),
        id: row.id,
        ancienChemin: row.chemin,
      }) + '\n');
      await db.justificatif.update({ where: { id: row.id }, data: { chemin: url } });
      migres += 1;
      console.log(`       → migré vers blob privé (vérifié)`);
    } catch (e) {
      echecs += 1;
      console.error(`       → ÉCHEC (${e.message}) — ligne INTACTE (data URI conservé)`);
    }
  }

  console.log(`\nRÉSUMÉ : vérifiés_ok=${ok} intégrité_ko=${integriteKO} migrés=${migres} échecs=${echecs}`);
  if (integriteKO > 0 || echecs > 0) process.exit(1);
}

main()
  .catch(e => { console.error('ERREUR FATALE :', e); process.exit(1); })
  .finally(() => db.$disconnect());
