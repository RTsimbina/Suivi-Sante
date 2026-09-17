import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { enNombre, versDecimal } from '@/lib/money';
import { PARENT_TYPES, PARENT_LABELS } from '@/lib/prestations';
import {
  resoudreIdentitePortailPrestataire,
  estPrestataire,
} from '@/lib/portail-prestataire-server';

// ─── GET : Barèmes applicables du prestataire connecté ─────────────────────
// Chaîne métier : Prestataire → Sociétés clientes (conventions) → Barèmes
// par prestation parente (Bareme { societeId, prestation, active } — même
// résolution que plafond-check.ts / simuler-acte). Pour chaque prestation le
// portail indique :
//   - le taux de couverture (%) et le plafond (montant) ;
//   - les conditions éventuelles (Bareme.description) ;
//   - l'état d'activité du barème (« période de validité » du modèle actuel :
//     un barème inactif n'est plus applicable).
// Les conventions inactives sont marquées : les actes y sont refusés
// automatiquement (PRESTATAIRE_INACTIF côté plafond-check).

export async function GET(request: NextRequest) {
  try {
    const resolution = await resoudreIdentitePortailPrestataire(request);
    if (!resolution.ok) return resolution.response;
    if (!estPrestataire(resolution.identite)) {
      return NextResponse.json(
        { erreur: 'Mode administrateur : sélectionnez un compte prestataire pour consulter ses barèmes.' },
        { status: 403 }
      );
    }
    const prestataireId = resolution.identite.prestataireId;

    // Conventions du prestataire (périmètre serveur : ses sociétés clientes).
    const conventions = await db.prestataireSociete.findMany({
      where: { prestataireId },
      include: { societe: { select: { id: true, nom: true } } },
      orderBy: { societe: { nom: 'asc' } },
    });

    // Barèmes de ses sociétés clientes (un seul appel, regroupé ensuite).
    const societeIds = conventions.map(c => c.societe.id);
    const baremes = societeIds.length
      ? await db.bareme.findMany({ where: { societeId: { in: societeIds } } })
      : [];

    const baremesParSociete = new Map<string, Map<string, (typeof baremes)[number]>>();
    for (const b of baremes) {
      let parSociete = baremesParSociete.get(b.societeId);
      if (!parSociete) {
        parSociete = new Map();
        baremesParSociete.set(b.societeId, parSociete);
      }
      parSociete.set(b.prestation, b);
    }

    return NextResponse.json({
      societes: conventions.map(c => ({
        societeId: c.societe.id,
        nom: c.societe.nom,
        conventionActive: c.actif,
        dateLiaison: c.createdAt,
        baremes: PARENT_TYPES.map(prestation => {
          const bareme = baremesParSociete.get(c.societe.id)?.get(prestation);
          return {
            prestation,
            label: PARENT_LABELS[prestation] ?? prestation,
            configure: !!bareme,
            actif: bareme?.active ?? false,
            tauxCouverture: bareme?.tauxCouverture ?? null,
            plafond: bareme ? enNombre(versDecimal(bareme.plafond)) : null,
            description: bareme?.description ?? null,
          };
        }),
      })),
    });
  } catch (error) {
    console.error('[PORTAIL PRESTATAIRE] Erreur barèmes :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors du chargement des barèmes.' },
      { status: 500 }
    );
  }
}
