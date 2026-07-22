import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';

export async function POST(request: NextRequest) {
  // Vérification auth
  const authError = await checkAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { identifiant } = body as { identifiant?: string };

    if (!identifiant || identifiant.trim().length === 0) {
      return Response.json(
        { erreur: "Veuillez fournir un identifiant (N° SS, nom ou email de l'assuré)." },
        { status: 400 }
      );
    }

    const query = identifiant.trim();

    // ── 1. Trouver l'assuré par NSS, nom, ou email ──
    const assure = await db.assure.findFirst({
      where: {
        OR: [
          { id: { equals: query } },
          { nSS: { equals: query, mode: 'insensitive' } },
          { nom: { contains: query, mode: 'insensitive' } },
          { prenom: { contains: query, mode: 'insensitive' } },
          { email: { equals: query, mode: 'insensitive' } },
          { telephone: { contains: query } },
        ],
      },
      include: { societe: true },
    });

    if (!assure) {
      return Response.json(
        { erreur: `Aucun assuré trouvé pour l'identifiant "${query}".` },
        { status: 404 }
      );
    }

    // ── 2. Vérifier que l'assuré est actif ──
    const estActif = assure.actif;

    // ── 3. Récupérer les barèmes de la société ──
    const baremes = await db.bareme.findMany({
      where: { societeId: assure.societeId, active: true },
    });

    // Plafond annuel global = somme de tous les plafonds de prestation
    const plafondAnnuelGlobal = baremes.reduce((sum, b) => sum + b.plafond, 0);

    // ── 4. Calculer la consommation annuelle de l'assuré ──
    const debutAnnee = new Date(new Date().getFullYear(), 0, 1);
    const finAnnee = new Date(new Date().getFullYear(), 11, 31, 23, 59, 59);

    const dossiersAnnee = await db.dossier.findMany({
      where: {
        assureId: assure.id,
        dateReception: { gte: debutAnnee, lte: finAnnee },
        statut: { not: 'REJETE' },
      },
      include: { prestataire: { select: { nom: true, type: true } } },
      orderBy: { dateReception: 'desc' },
    });

    // Montant total consommé (montantPaye si payé, sinon montantValide, sinon montantReclame)
    const totalConsomme = dossiersAnnee.reduce((sum, d) => {
      return sum + (d.montantPaye ?? d.montantValide ?? d.montantReclame);
    }, 0);

    // Taux de consommation global
    const tauxConsommationGlobal = plafondAnnuelGlobal > 0
      ? (totalConsomme / plafondAnnuelGlobal) * 100
      : 0;

    // ── 5. Consommation par type d'acte ──
    const consommationParActe: Record<string, {
      consomme: number;
      plafond: number;
      tauxCouverture: number;
      nbActes: number;
      description: string;
    }> = {};

    for (const b of baremes) {
      const dossiersType = dossiersAnnee.filter(d => d.typeDossier === b.prestation);
      const consomme = dossiersType.reduce((s, d) => s + (d.montantPaye ?? d.montantValide ?? d.montantReclame), 0);
      consommationParActe[b.prestation] = {
        consomme,
        plafond: b.plafond,
        tauxCouverture: b.tauxCouverture,
        nbActes: dossiersType.length,
        description: b.description || '',
      };
    }

    // ── 6. Alerte plafond global 70% / 100% ──
    const alertes: { type: 'info' | 'warning' | 'danger'; message: string; code: string }[] = [];

    if (!estActif) {
      alertes.push({
        type: 'danger',
        message: "L'assuré est INACTIF. Aucune prise en charge ne peut être effectuée.",
        code: 'ASSURE_INACTIF',
      });
    }

    if (tauxConsommationGlobal >= 100) {
      alertes.push({
        type: 'danger',
        message: `Plafond annuel global ATTEINT à ${tauxConsommationGlobal.toFixed(1)}%. Toute nouvelle demande sera rejetée automatiquement.`,
        code: 'PLAFOND_GLOBAL_ATTEINT',
      });
    } else if (tauxConsommationGlobal >= 70) {
      alertes.push({
        type: 'warning',
        message: `Plafond annuel global à ${tauxConsommationGlobal.toFixed(1)}% (seuil d'alerte 70%). Approbation spéciale requise pour les nouveaux actes.`,
        code: 'PLAFOND_GLOBAL_70',
      });
    }

    // Alerte par type d'acte
    for (const [prestation, data] of Object.entries(consommationParActe)) {
      const taux = data.plafond > 0 ? (data.consomme / data.plafond) * 100 : 0;
      if (taux >= 100) {
        alertes.push({
          type: 'danger',
          message: `Plafond ${prestation} ATTEINT (${taux.toFixed(1)}%). Aucun nouvel acte de ce type ne peut être pris en charge.`,
          code: `PLAFOND_ACTE_ATTEINT_${prestation}`,
        });
      } else if (taux >= 70) {
        alertes.push({
          type: 'warning',
          message: `Plafond ${prestation} à ${taux.toFixed(1)}%. Attention avant validation.`,
          code: `PLAFOND_ACTE_70_${prestation}`,
        });
      }
    }

    // ── 7. Calcul du reliquat global ──
    const reliquatGlobal = Math.max(0, plafondAnnuelGlobal - totalConsomme);

    // ── 8. Retourner le résultat complet ──
    return Response.json({
      assure: {
        id: assure.id,
        nom: assure.nom,
        prenom: assure.prenom,
        nSS: assure.nSS,
        dateNaissance: assure.dateNaissance,
        sexe: assure.sexe,
        telephone: assure.telephone,
        email: assure.email,
        adresse: assure.adresse,
        actif: assure.actif,
      },
      societe: {
        id: assure.societe.id,
        nom: assure.societe.nom,
      },
      plafonds: {
        annuelGlobal: plafondAnnuelGlobal,
        totalConsomme,
        reliquatGlobal,
        tauxConsommationGlobal: Math.round(tauxConsommationGlobal * 100) / 100,
        seuil70: plafondAnnuelGlobal * 0.7,
        seuil100: plafondAnnuelGlobal,
      },
      consommationParActe,
      dossiersRecent: dossiersAnnee.slice(0, 20).map(d => ({
        id: d.id,
        numeroDossier: d.numeroDossier,
        typeDossier: d.typeDossier,
        dateReception: d.dateReception,
        montantReclame: d.montantReclame,
        montantValide: d.montantValide,
        montantPaye: d.montantPaye,
        statut: d.statut,
        prestataire: d.prestataire?.nom || d.prestataireLegacy || null,
      })),
      alertes,
    });
  } catch (error) {
    console.error('[SANTÉ] Erreur vérification assuré:', error);
    return Response.json(
      { erreur: "Une erreur est survenue lors de la vérification de l'assuré." },
      { status: 500 }
    );
  } finally {
    await db.$disconnect();
  }
}

// GET : recherche rapide d'assurés pour l'autocomplétion
export async function GET(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;

  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q') || '';

  if (q.length < 2) {
    return Response.json({ resultats: [] });
  }

  try {
    const resultats = await db.assure.findMany({
      where: {
        OR: [
          { id: { contains: q } },
          { nSS: { contains: q, mode: 'insensitive' } },
          { nom: { contains: q, mode: 'insensitive' } },
          { prenom: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        nom: true,
        prenom: true,
        nSS: true,
        actif: true,
        societe: { select: { nom: true } },
      },
      take: 10,
    });

    return Response.json({ resultats });
  } catch {
    return Response.json({ resultats: [] });
  } finally {
    await db.$disconnect();
  }
}