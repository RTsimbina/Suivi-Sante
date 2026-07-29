import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { getUserIdFromRequest } from '@/lib/audit-log';

// ─── POST : Synchroniser les liens prestataire-société depuis les dossiers existants ──
// Crée les liens manquants dans PrestataireSociete à partir des dossiers.
// Les liens créés sont automatiquement "actif: true".

export async function POST(request: Request) {
  try {
    const authError = await checkAuth(request as any);
    if (authError) return authError;

    const userId = getUserIdFromRequest(request as any);

    // Récupérer toutes les paires uniques (societeId, prestataireId) depuis les dossiers
    const uniquePairs = await db.dossier.groupBy({
      by: ['societeId', 'prestataireId'],
      where: { prestataireId: { not: null } },
    });

    if (uniquePairs.length === 0) {
      return NextResponse.json({
        message: 'Aucun dossier avec prestataire trouvé. Aucune synchronisation nécessaire.',
        created: 0, total: 0,
      });
    }

    // Récupérer les liens existants
    const existingLinks = await db.prestataireSociete.findMany({
      select: { prestataireId: true, societeId: true },
    });
    const existingSet = new Set(
      existingLinks.map(l => `${l.prestataireId}::${l.societeId}`)
    );

    // Filtrer les paires qui n'ont pas encore de lien
    const toCreate = uniquePairs.filter(
      p => !existingSet.has(`${p.prestataireId}::${p.societeId}`)
    );

    if (toCreate.length === 0) {
      return NextResponse.json({
        message: 'Tous les liens sont déjà à jour.',
        created: 0, total: uniquePairs.length,
      });
    }

    // Créer les liens manquants (par batch de 50)
    let created = 0;
    const BATCH_SIZE = 50;
    for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
      const batch = toCreate.slice(i, i + BATCH_SIZE);
      const result = await db.prestataireSociete.createMany({
        data: batch.map(p => ({
          prestataireId: p.prestataireId!,
          societeId: p.societeId,
          actif: true,
        })),
        skipDuplicates: true,
      });
      created += result.count;
    }

    // Log audit
    if (userId) {
      await db.historiqueParametre.create({
        data: {
          entite: 'PrestataireSociete',
          entiteId: 'SYNC',
          champ: 'SYNCHRONISATION',
          nouvelleValeur: `${created} liens créés depuis ${uniquePairs.length} dossiers`,
          modifiePar: userId,
        },
      });
    }

    return NextResponse.json({
      message: `Synchronisation terminée : ${created} lien(s) créé(s) sur ${uniquePairs.length} paire(s) trouvée(s) dans les dossiers.`,
      created,
      total: uniquePairs.length,
    });
  } catch (error) {
    console.error('Erreur synchronisation prestataire-société :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la synchronisation.' },
      { status: 500 }
    );
  }
}
