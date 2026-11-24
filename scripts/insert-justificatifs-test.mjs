/**
 * Insère des justificatifs de test (data URI) dans la base locale pour
 * valider scripts/migrate-justificatifs-vers-blob.mjs :
 * 2 lignes valides (PDF, PNG) + 1 ligne volontairement corrompue.
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

// Un dossier réel du seed
const dossier = await db.dossier.findFirst({ select: { id: true, numeroDossier: true } });
if (!dossier) { console.error('Aucun dossier (seed requis)'); process.exit(1); }

const pdf = Buffer.from('%PDF-1.4 test justificatif');
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const corrompu = Buffer.from('<html>pas un vrai fichier</html>');

const rows = [
  { nomFichier: 'facture-historique.pdf', type: 'FACTURE', mime: 'application/pdf', data: pdf },
  { nomFichier: 'ordonnance-scan.png', type: 'ORDONNANCE', mime: 'image/png', data: png },
  { nomFichier: 'piece-corrompue.pdf', type: 'AUTRE', mime: 'application/pdf', data: corrompu },
];

for (const r of rows) {
  await db.justificatif.create({
    data: {
      dossierId: dossier.id,
      type: r.type,
      nomFichier: r.nomFichier,
      chemin: `data:${r.mime};base64,${r.data.toString('base64')}`,
      tailleKo: Math.max(1, Math.round(r.data.length / 1024)),
      uploadedBy: null,
    },
  });
}
console.log(`3 justificatifs de test insérés sur le dossier ${dossier.numeroDossier}`);
await db.$disconnect();
