import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

// Endpoint de migration dédié pour ajouter les colonnes manquantes à Societe.
// Ne passe PAS par le modèle Prisma Societe (qui référencerait les colonnes absentes),
// mais utilise une connexion Prisma brute avec $queryRawUnsafe / $executeRawUnsafe.
//
// Usage : GET /api/migrate-societe?token=VOTRE_SETUP_TOKEN
// Supprimer ce fichier après exécution réussie.

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token || token !== process.env.SETUP_TOKEN) {
    return NextResponse.json({ erreur: 'Token invalide.' }, { status: 403 });
  }

  const log: string[] = [];
  const prisma = new PrismaClient({ log: ['error'] });

  try {
    // Vérifier quelles colonnes existent déjà
    const cols = await prisma.$queryRawUnsafe<
      { column_name: string }[]
    >(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'Societe' AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    const existingCols = new Set(cols.map((c) => c.column_name));
    log.push(`Colonnes existantes : [${[...existingCols].join(', ')}]`);

    const migrations: { col: string; sql: string }[] = [
      { col: 'adresse', sql: `ALTER TABLE "Societe" ADD COLUMN "adresse" TEXT` },
      { col: 'telephone', sql: `ALTER TABLE "Societe" ADD COLUMN "telephone" TEXT` },
      { col: 'email', sql: `ALTER TABLE "Societe" ADD COLUMN "email" TEXT` },
      { col: 'nif', sql: `ALTER TABLE "Societe" ADD COLUMN "nif" TEXT` },
      { col: 'contactPrincipal', sql: `ALTER TABLE "Societe" ADD COLUMN "contactPrincipal" TEXT` },
    ];

    for (const m of migrations) {
      if (!existingCols.has(m.col)) {
        try {
          await prisma.$executeRawUnsafe(m.sql);
          log.push(`✅ Colonne "${m.col}" ajoutée`);
        } catch (err: any) {
          log.push(`❌ Erreur ajout "${m.col}": ${err.message?.slice(0, 150)}`);
        }
      } else {
        log.push(`⏭️ Colonne "${m.col}" déjà présente`);
      }
    }

    // Vérifier le résultat final
    const finalCols = await prisma.$queryRawUnsafe<
      { column_name: string }[]
    >(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'Societe' AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    log.push(
      `Résultat final : [${finalCols.map((c) => c.column_name).join(', ')}]`
    );

    return NextResponse.json({ success: true, log });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error('[MIGRATE-SOCIETE] Erreur:', error);
    return NextResponse.json({ success: false, erreur: msg, log }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
