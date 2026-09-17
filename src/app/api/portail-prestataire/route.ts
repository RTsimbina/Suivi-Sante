import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { enNombre, versDecimal } from '@/lib/money';
import { plageDepuisParams, filtreDateChamp } from '@/lib/periodes';
import { getPrestationLabel } from '@/lib/prestations';
import { TYPE_LABELS as TYPES_PRESTATAIRE_LABELS } from '@/components/suivisante/prestataires/types';
import { soldeFacture } from '@/lib/portail-prestataire';
import {
  resoudreIdentitePortailPrestataire,
  estPrestataire,
} from '@/lib/portail-prestataire-server';
import type { Prisma } from '@prisma/client';

// ─── GET : Données du portail prestataire ──────────────────────────────────
// Renvoie le profil du prestataire connecté, ses sociétés clientes
// (conventions), ses indicateurs de la période sélectionnée et ses derniers
// actes. TOUTES les données sont filtrées côté serveur par le prestataireId
// résolu depuis le JWT — aucune donnée d'un autre prestataire n'est accessible,
// même en manipulant l'URL, les ids ou les paramètres.

const LIMITE_FACTURES_KPI = 2000;

export async function GET(request: NextRequest) {
  try {
    const resolution = await resoudreIdentitePortailPrestataire(request);
    if (!resolution.ok) return resolution.response;

    // Mode administrateur : démonstration sans données prestataire.
    if (!estPrestataire(resolution.identite)) {
      return NextResponse.json({
        type: 'ADMINISTRATEUR',
        message: 'Mode administrateur. Utilisez un compte prestataire pour tester le portail.',
      });
    }

    const prestataireId = resolution.identite.prestataireId;

    // Filtre de période réutilisable (date de référence : Dossier.dateReception),
    // appliqué APRÈS la résolution du périmètre : l'isolation est garantie.
    const plage = plageDepuisParams(new URL(request.url).searchParams);

    // Profil du prestataire (référentiel global — fiche lue pour soi-même).
    const prestataire = await db.prestataire.findUnique({
      where: { id: prestataireId },
      select: {
        id: true, nom: true, type: true, telephone: true, email: true,
        adresse: true, nif: true, stat: true, statutJuridique: true,
        statut: true, actif: true,
      },
    });
    if (!prestataire) {
      return NextResponse.json({ erreur: 'Prestataire introuvable.' }, { status: 404 });
    }

    // Sociétés clientes (conventions) — toutes, avec leur état actif/inactif :
    // l'historique reste visible, les conventions inactives sont marquées
    // (les actes y sont refusés automatiquement par le plateau technique).
    const conventions = await db.prestataireSociete.findMany({
      where: { prestataireId },
      include: { societe: { select: { id: true, nom: true } } },
      orderBy: { societe: { nom: 'asc' } },
    });

    // ─── Indicateurs de la période ──────────────────────────────────────────
    // Actes (vue médicale) : tous les dossiers du prestataire.
    const whereActes: Prisma.DossierWhereInput = { prestataireId };
    Object.assign(whereActes, filtreDateChamp('dateReception', plage));

    const [actesRealises, assureDistintcs, actesParSociete] = await Promise.all([
      db.dossier.count({ where: whereActes }),
      db.dossier.findMany({
        where: { ...whereActes, assureId: { not: null } },
        select: { assureId: true },
        distinct: ['assureId'],
      }),
      db.dossier.groupBy({
        by: ['societeId'],
        where: whereActes,
        _count: { _all: true },
      }),
    ]);

    // Factures (vue financière) : dossiers de règlement prestataire —
    // c'est le prestataire qui est payé directement. Les dossiers
    // REMBOURSEMENT_ASSURE sont réglés à l'assuré (vue Actes uniquement).
    const whereFactures: Prisma.DossierWhereInput = {
      prestataireId,
      categorieDossier: 'REGLEMENT_PRESTATAIRE',
    };
    Object.assign(whereFactures, filtreDateChamp('dateReception', plage));

    const factures = await db.dossier.findMany({
      where: whereFactures,
      select: {
        statut: true,
        montantReclame: true,
        montantValide: true,
        montantPaye: true,
      },
      take: LIMITE_FACTURES_KPI,
    });

    let montantFacture = 0;
    let montantRegule = 0;
    let montantRestant = 0;
    let facturesEmises = 0;
    let facturesEnAttente = 0;
    let facturesRegles = 0;
    for (const f of factures) {
      facturesEmises += 1;
      if (f.statut !== 'PAYE' && f.statut !== 'REJETE') facturesEnAttente += 1;
      if (f.statut === 'PAYE') facturesRegles += 1;
      montantFacture += enNombre(versDecimal(f.montantReclame)) ?? 0;
      montantRegule += enNombre(versDecimal(f.montantPaye)) ?? 0;
      montantRestant += enNombre(soldeFacture(f)) ?? 0;
    }

    // Derniers actes (aperçu tableau de bord, même périmètre + période).
    const derniersActes = await db.dossier.findMany({
      where: whereActes,
      include: {
        societe: { select: { id: true, nom: true } },
        assure: { select: { id: true, nom: true, prenom: true, typeBeneficiaire: true } },
      },
      orderBy: { dateReception: 'desc' },
      take: 8,
    });

    const nbActesParSociete = new Map<string, number>();
    for (const g of actesParSociete) {
      if (g.societeId) nbActesParSociete.set(g.societeId, g._count._all);
    }

    return NextResponse.json({
      type: 'PRESTATAIRE',
      prestataire: {
        ...prestataire,
        typeLabel: TYPES_PRESTATAIRE_LABELS[prestataire.type] ?? prestataire.type,
      },
      societes: conventions.map(c => ({
        idLien: c.id,
        societeId: c.societe.id,
        nom: c.societe.nom,
        conventionActive: c.actif,
        dateLiaison: c.createdAt,
        nbActes: nbActesParSociete.get(c.societe.id) ?? 0,
      })),
      kpis: {
        actesRealises,
        assuresPrisEnCharge: assureDistintcs.length,
        facturesEmises,
        facturesEnAttente,
        facturesRegles,
        montantFacture: Math.round(montantFacture * 100) / 100,
        montantRegule: Math.round(montantRegule * 100) / 100,
        montantRestant: Math.round(montantRestant * 100) / 100,
      },
      derniersActes: derniersActes.map(d => ({
        id: d.id,
        numeroDossier: d.numeroDossier,
        typeDossier: d.typeDossier,
        typeLabel: getPrestationLabel(d.typeDossier),
        statut: d.statut,
        beneficiaire: d.beneficiaire,
        dateReception: d.dateReception,
        montantReclame: enNombre(versDecimal(d.montantReclame)) ?? 0,
        montantPaye: enNombre(versDecimal(d.montantPaye)) ?? 0,
        societe: d.societe,
        assure: d.assure ? {
          nom: d.assure.nom,
          prenom: d.assure.prenom,
          typeBeneficiaire: d.assure.typeBeneficiaire,
        } : null,
      })),
    });
  } catch (error) {
    console.error('[PORTAIL PRESTATAIRE] Erreur :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors du chargement des données.' },
      { status: 500 }
    );
  }
}
