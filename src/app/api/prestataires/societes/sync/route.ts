import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';

/**
 * POST /api/prestataires/societes/sync
 * Synchronise la table PrestataireSociete à partir des dossiers existants.
 * Deux sources :
 *   1. Dossiers avec prestataireId FK → lien direct
 *   2. Dossiers avec prestataireLegacy (nom texte) → match par nom avec la table Prestataire
 */
export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    // Récupérer les liens déjà existants
    const existingLinks = await db.prestataireSociete.findMany({
      select: { prestataireId: true, societeId: true },
    });
    const existingSet = new Set(
      existingLinks.map(l => `${l.prestataireId}|${l.societeId}`)
    );

    let created = 0;

    // ─── Source 1 : Dossiers avec prestataireId FK ────────────────────────────
    const dossiersFK = await db.dossier.findMany({
      where: {
        prestataireId: { not: null },
      },
      select: { prestataireId: true, societeId: true },
      distinct: ['prestataireId', 'societeId'],
    });

    const toCreateFromFK = dossiersFK.filter(
      d => !existingSet.has(`${d.prestataireId!}|${d.societeId}`)
    );

    if (toCreateFromFK.length > 0) {
      const result = await db.prestataireSociete.createMany({
        data: toCreateFromFK.map(d => ({
          prestataireId: d.prestataireId!,
          societeId: d.societeId,
          actif: true,
        })),
        skipDuplicates: true,
      });
      created += result.count;
      // Ajouter les nouveaux au set pour ne pas les recréer via legacy
      for (const d of toCreateFromFK) {
        existingSet.add(`${d.prestataireId!}|${d.societeId}`);
      }
    }

    // ─── Source 2 : Dossiers avec prestataireLegacy (nom texte) ────────────────
    // Dossiers ayant un prestataireLegacy non vide
    const dossiersLegacy = await db.dossier.findMany({
      where: {
        AND: [
          { prestataireLegacy: { not: null } },
          { NOT: { prestataireLegacy: '' } },
        ],
      },
      select: { prestataireLegacy: true, societeId: true },
      distinct: ['prestataireLegacy', 'societeId'],
    });

    if (dossiersLegacy.length > 0) {
      // Récupérer tous les prestataires pour matcher par nom
      const allPrestataires = await db.prestataire.findMany({
        select: { id: true, nom: true },
      });

      // Index par nom normalisé (minuscule, trim)
      const prestaByName = new Map<string, string[]>();
      for (const p of allPrestataires) {
        const key = p.nom.trim().toLowerCase();
        if (!prestaByName.has(key)) prestaByName.set(key, []);
        prestaByName.get(key)!.push(p.id);
      }

      const toCreateFromLegacy: { prestataireId: string; societeId: string }[] = [];

      for (const d of dossiersLegacy) {
        const legacyName = d.prestataireLegacy!.trim().toLowerCase();
        const matchedIds = prestaByName.get(legacyName);
        if (!matchedIds) continue;

        for (const prestaId of matchedIds) {
          if (!existingSet.has(`${prestaId}|${d.societeId}`)) {
            toCreateFromLegacy.push({ prestataireId: prestaId, societeId: d.societeId });
            existingSet.add(`${prestaId}|${d.societeId}`);
          }
        }
      }

      if (toCreateFromLegacy.length > 0) {
        // createMany par batch de 100
        for (let i = 0; i < toCreateFromLegacy.length; i += 100) {
          const batch = toCreateFromLegacy.slice(i, i + 100);
          const result = await db.prestataireSociete.createMany({
            data: batch.map(d => ({
              prestataireId: d.prestataireId,
              societeId: d.societeId,
              actif: true,
            })),
            skipDuplicates: true,
          });
          created += result.count;
        }
      }
    }

    // Compter le total final
    const totalLinks = await db.prestataireSociete.count();

    return NextResponse.json({
      message: `Synchronisation terminée. ${created} lien(s) créé(s), ${totalLinks - created} déjà existant(s). Total: ${totalLinks} lien(s).`,
      created,
      existing: totalLinks - created,
      total: totalLinks,
    });
  } catch (error) {
    console.error('Erreur synchronisation prestataire-société :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la synchronisation.' },
      { status: 500 }
    );
  }
}
