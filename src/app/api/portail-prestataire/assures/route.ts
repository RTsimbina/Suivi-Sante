import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { masquerNss } from '@/lib/portail-prestataire';
import {
  resoudreIdentitePortailPrestataire,
  estPrestataire,
} from '@/lib/portail-prestataire-server';

// ─── GET : Assurés consultables par le prestataire connecté ────────────────
// Deux portées, TOUTES restreintes côté serveur au périmètre du prestataire :
//
//   scope=clients   — assurés des sociétés clientes dont la convention est
//                     ACTIVE (pour connaître le barème applicable à l'acte
//                     d'un assuré qui se présente, cf. Prestataire → Société
//                     cliente → Barème). Données MINIMALES : identité,
//                     type de bénéficiaire, NSS masqué, société. Aucun
//                     contact, aucune donnée médicale.
//   scope=mes-actes — assurés ayant déjà des actes chez ce prestataire
//                     (alimente le filtre « assuré » de la vue Actes).
//
// Un ?societeId= fourni par le navigateur ne peut que RESTREINDRE
// (intersection avec les conventions du prestataire) — jamais élargir.

export async function GET(request: NextRequest) {
  try {
    const resolution = await resoudreIdentitePortailPrestataire(request);
    if (!resolution.ok) return resolution.response;
    if (!estPrestataire(resolution.identite)) {
      return NextResponse.json(
        { erreur: 'Mode administrateur : utilisez un compte prestataire.' },
        { status: 403 }
      );
    }
    const prestataireId = resolution.identite.prestataireId;

    const params = new URL(request.url).searchParams;
    const scope = params.get('scope') || 'clients';
    const search = (params.get('search') || '').trim();
    const societeIdFiltre = params.get('societeId') || '';

    // Sociétés du prestataire selon la portée demandée.
    const conventions = await db.prestataireSociete.findMany({
      where: { prestataireId, ...(scope === 'clients' ? { actif: true } : {}) },
      select: { societeId: true },
    });
    const societeIds = conventions.map(c => c.societeId);

    if (societeIds.length === 0) {
      return NextResponse.json({ assures: [] });
    }

    // Intersection : un societeId fourni qui n'est PAS une société du
    // prestataire aboutit à une liste vide (jamais aux assurés d'autrui).
    const societeIdsFinales = societeIdFiltre
      ? (societeIds.includes(societeIdFiltre) ? [societeIdFiltre] : [])
      : societeIds;
    if (societeIdsFinales.length === 0) {
      return NextResponse.json({ assures: [] });
    }

    if (scope === 'mes-actes') {
      // Assurés distincts ayant des actes chez ce prestataire.
      const lignes = await db.dossier.findMany({
        where: {
          prestataireId,
          assureId: { not: null },
          societeId: { in: societeIdsFinales },
          ...(search
            ? { beneficiaire: { contains: search, mode: 'insensitive' } }
            : {}),
        },
        select: { assureId: true, beneficiaire: true },
        distinct: ['assureId'],
        orderBy: { beneficiaire: 'asc' },
        take: 100,
      });
      return NextResponse.json({
        assures: lignes.map(l => ({
          assureId: l.assureId,
          nom: l.beneficiaire,
        })),
      });
    }

    // scope=clients : assurés des sociétés clientes actives (données minimales).
    const assures = await db.assure.findMany({
      where: {
        societeId: { in: societeIdsFinales },
        ...(search
          ? {
              OR: [
                { nom: { contains: search, mode: 'insensitive' } },
                { prenom: { contains: search, mode: 'insensitive' } },
                { nSS: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        id: true, nom: true, prenom: true, nSS: true,
        typeBeneficiaire: true, actif: true, societeId: true,
        societe: { select: { id: true, nom: true } },
      },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      take: 20,
    });

    return NextResponse.json({
      assures: assures.map(a => ({
        id: a.id,
        nom: a.nom,
        prenom: a.prenom,
        nSSMasque: masquerNss(a.nSS),
        typeBeneficiaire: a.typeBeneficiaire,
        actif: a.actif,
        societe: a.societe,
      })),
    });
  } catch (error) {
    console.error('[PORTAIL PRESTATAIRE] Erreur assurés :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors du chargement des assurés.' },
      { status: 500 }
    );
  }
}
