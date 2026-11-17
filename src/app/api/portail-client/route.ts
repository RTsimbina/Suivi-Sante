import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { db } from '@/lib/db';
import { enNombre } from '@/lib/money';
import { dedupliquerEnVigueur } from '@/lib/baremes-validite';
import { verifierSessionUtilisateur } from '@/lib/session-revocation';
import type { Prisma } from '@prisma/client';
import { plageDepuisParams, filtreDateChamp } from '@/lib/periodes';
import { masquerNss } from '@/lib/nss';
import {
  resoudreAssureParEmail,
  resoudreSocieteIdParEmailContact,
  chargerAssure,
} from '@/lib/portail-client-scope';

// ─── P2-02 : paramètres de pagination / recherche / tri des dossiers ────────
// Tri stable : le second critère `{ id: 'asc' }` garantit un ordre total —
// aucun doublon ni omission entre les pages même à dates égales.
const SORTABLE_DOSSIERS = [
  'numeroDossier', 'statut', 'typeDossier', 'beneficiaire',
  'dateReception', 'dateSoins', 'montantReclame', 'montantValide', 'montantPaye',
] as const;

function paramsPaginationDossiers(url: URL) {
  const params = url.searchParams;
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const limit = Math.min(200, Math.max(5, parseInt(params.get('limit') || '50', 10) || 50));
  const search = (params.get('search') || '').trim().slice(0, 100);
  const sortByRaw = params.get('sortBy') || 'dateReception';
  const sortBy = (SORTABLE_DOSSIERS as readonly string[]).includes(sortByRaw)
    ? (sortByRaw as typeof SORTABLE_DOSSIERS[number])
    : 'dateReception';
  const sortOrder = params.get('sortOrder') === 'asc' ? 'asc' : 'desc';
  const statut = (params.get('statut') || '').trim();
  return { page, limit, search, sortBy, sortOrder, statut };
}

/** Applique la recherche et le filtre de statut au where des dossiers. */
function filtreDossiersPortail(
  whereDossiers: Prisma.DossierWhereInput,
  search: string,
  statut: string,
): void {
  if (search) {
    whereDossiers.OR = [
      { numeroDossier: { contains: search, mode: 'insensitive' } },
      { beneficiaire: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (statut === 'en-cours') {
    whereDossiers.statut = { notIn: ['PAYE', 'REJETE'] };
  } else if (statut) {
    whereDossiers.statut = statut;
  }
}

type KpisDossiers = {
  totalDossiers: number;
  totalReclame: number;
  totalPaye: number;
  enCours: number;
  rejetes: number;
};

/**
 * P2-02 : KPIs calculés sur l'ENSEMBLE filtré (agrégations Prisma exactes en
 * Decimal) — plus jamais sur la page courante : les totaux sont indépendants
 * de la pagination.
 */
async function kpisDossiersFiltres(
  whereDossiers: Prisma.DossierWhereInput,
): Promise<KpisDossiers> {
  const [total, agg, statutsCounts] = await Promise.all([
    db.dossier.count({ where: whereDossiers }),
    db.dossier.aggregate({
      where: whereDossiers,
      _sum: { montantReclame: true, montantPaye: true },
    }),
    db.dossier.groupBy({ by: ['statut'], where: whereDossiers, _count: true }),
  ]);
  const paye = enNombre(agg._sum.montantPaye) ?? 0;
  const payeCount = statutsCounts.find(s => s.statut === 'PAYE')?._count ?? 0;
  const rejetes = statutsCounts.find(s => s.statut === 'REJETE')?._count ?? 0;
  return {
    totalDossiers: total,
    totalReclame: enNombre(agg._sum.montantReclame) ?? 0,
    totalPaye: paye,
    enCours: total - payeCount - rejetes,
    rejetes,
  };
}

/** Métadonnées de pagination renvoyées au frontend (P2-02B). */
function metaPagination(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    hasNext: page * limit < total,
    hasPrev: page > 1,
  };
}

// ─── GET : Données du portail client ──────────────────────────────────────
// Renvoie les données filtrées selon le rôle externe connecté :
//   - PORTAIL_CLIENT : données de l'assuré (avec ayants droit, contrats, dossiers)
//   - CONTACT_ENTREPRISE : données de la société (assurés, contrats, dossiers)
//   - ADMINISTRATEUR : toutes les données (pour test)
//
// Résolution de secours des identifiants de portail : partagée avec l'export
// via src/lib/portail-client-scope.ts (le JWT fige assureId/societeId pour
// la session ; si la liaison a été créée/corrigée APRÈS la connexion, on
// re-résout DEPUIS LA BASE à partir de l'e-mail authentifié du token).

export async function GET(request: NextRequest) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token) {
      return NextResponse.json({ erreur: 'Non authentifié.' }, { status: 401 });
    }

    // P1 Révocation : état réel du compte relu en base (actif + version).
    const session = await verifierSessionUtilisateur(db, token);
    if (!session.ok) {
      return NextResponse.json({ erreur: session.erreur }, { status: session.statut });
    }

    const role = token.role as string;
    let assureId = token.assureId as string | undefined;
    let societeId = token.societeId as string | undefined;
    const userId = token.id as string;
    const emailToken = (token.email as string | undefined)?.trim() ?? '';

    // Filtre de période réutilisable (date de référence : Dossier.dateReception)
    // Appliqué APRÈS la résolution du périmètre de l'utilisateur : l'isolation est garantie
    // (PORTAIL_CLIENT → sa famille, CONTACT_ENTREPRISE → sa société uniquement).
    // `new URL(request.url)` plutôt que request.nextUrl : tolère les Request standards.
    const plage = plageDepuisParams(new URL(request.url).searchParams);

    // Rôles internes n'ont rien à faire ici
    if (!['PORTAIL_CLIENT', 'CONTACT_ENTREPRISE', 'ADMINISTRATEUR'].includes(role)) {
      return NextResponse.json({ erreur: 'Accès refusé.' }, { status: 403 });
    }

    // ─── Mode PORTAIL_CLIENT : vue assuré ───
    if (role === 'PORTAIL_CLIENT') {
      // Re-résolution par e-mail si le token ne porte pas l'assuré
      // (session ouverte avant la création/correction de la liaison).
      if (!assureId && emailToken) {
        const resolu = await resoudreAssureParEmail(emailToken);
        if (resolu) {
          assureId = resolu.id;
          societeId = resolu.societeId ?? societeId;
        }
      }

      if (!assureId) {
        console.error(
          `[PORTAIL CLIENT] Compte ${emailToken || userId} (rôle ${role}) : aucun Assure en base ` +
          `avec cet e-mail. Vérifiez l'e-mail de l'assuré côté Assurés/Configuration.`
        );
        return NextResponse.json(
          {
            erreur:
              `Aucun assuré lié à votre compte${emailToken ? ` (e-mail recherché : ${emailToken})` : ''}. ` +
              `Vérifiez que l'assuré a exactement cet e-mail dans la base ; une fois corrigé, rechargez cette page.`,
          },
          { status: 403 }
        );
      }

      // Récupérer l'assuré avec sa société
      let assure = await chargerAssure(assureId);

      // Id du token périmé (assuré supprimé puis recréé) → re-résolution par e-mail
      if (!assure && emailToken) {
        const resolu = await resoudreAssureParEmail(emailToken);
        if (resolu && resolu.id !== assureId) {
          assureId = resolu.id;
          societeId = resolu.societeId ?? societeId;
          assure = await chargerAssure(assureId);
        }
      }

      if (!assure) {
        return NextResponse.json({ erreur: 'Assuré introuvable.' }, { status: 404 });
      }

      // Récupérer les ayants droit (conjoint + enfants)
      const ayantsDroit = await db.assure.findMany({
        where: {
          OR: [
            { assurePrincipalId: assureId },
            { id: assureId },
          ],
        },
        include: {
          societe: { select: { id: true, nom: true } },
          _count: { select: { dossiers: true } },
        },
        orderBy: [{ typeBeneficiaire: 'asc' }, { createdAt: 'desc' }],
      });

      // Familles : regrouper par codeFamille ou par assurePrincipalId
      const familleMembers = ayantsDroit.filter(a => a.id !== assureId);
      const principalRecord = ayantsDroit.find(a => a.id === assureId);

      // Récupérer les contrats de la société
      const contrats = await db.contrat.findMany({
        where: {
          societeId: assure.societeId,
          statut: 'ACTIF',
        },
        orderBy: { createdAt: 'desc' },
      });

      // ─── P2-02 : dossiers de la famille PAGINÉS / triés / filtrés ────────
      const { page, limit, search, sortBy, sortOrder, statut } = paramsPaginationDossiers(new URL(request.url));
      const allAssureIds = ayantsDroit.map(a => a.id);
      const whereDossiers: Prisma.DossierWhereInput = { assureId: { in: allAssureIds } };
      Object.assign(whereDossiers, filtreDateChamp('dateReception', plage));
      filtreDossiersPortail(whereDossiers, search, statut);
      const [dossiers, kpis] = await Promise.all([
        db.dossier.findMany({
          where: whereDossiers,
          include: {
            societe: { select: { id: true, nom: true } },
            assure: { select: { id: true, nom: true, prenom: true, typeBeneficiaire: true } },
          },
          // Tri stable : id en second critère (aucun doublon ni omission)
          orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        kpisDossiersFiltres(whereDossiers),
      ]);

      // Récupérer les barèmes EN VIGUEUR de la société (P1 : une version par
      // prestation — les versions historiques restent consultables côté
      // gestion mais ne dupliquent pas les garanties du portail client)
      const toutesVersions = await db.bareme.findMany({
        where: { societeId: assure.societeId, supprime: false },
      });
      const baremes = dedupliquerEnVigueur(toutesVersions, new Date());

      // KPIs + pagination renvoyés : calculés sur l'ensemble filtré (hors page)

      return NextResponse.json({
        type: 'PORTAIL_CLIENT',
        assure: {
          id: assure.id,
          nom: assure.nom,
          prenom: assure.prenom,
          // P2-03 : NSS masqué côté backend — même pour l'assuré lui-même
          // (minimisation des données : le portail n'a pas besoin du NSS
          // complet ; le personnel habilité le consulte via les écrans internes).
          nSS: masquerNss(assure.nSS),
          matricule: assure.matricule,
          typeBeneficiaire: assure.typeBeneficiaire,
          dateNaissance: assure.dateNaissance,
          sexe: assure.sexe,
          dateEffet: assure.dateEffet,
          bareme: assure.bareme,
          telephone: assure.telephone,
          email: assure.email,
          adresse: assure.adresse,
          actif: assure.actif,
          codeFamille: assure.codeFamille,
        },
        societe: assure.societe,
        // P2-03 : la famille était renvoyée BRUTE (objets Prisma complets,
        // NSS et coordonnées compris) — projection minimale des champs
        // affichés par le portail, sans NSS ni coordonnées sensibles.
        famille: familleMembers.map(m => ({
          id: m.id,
          nom: m.nom,
          prenom: m.prenom,
          typeBeneficiaire: m.typeBeneficiaire,
          dateNaissance: m.dateNaissance,
          codeFamille: m.codeFamille,
          actif: m.actif,
          _count: { dossiers: m._count.dossiers },
        })),
        contrats: contrats.map(c => ({
          id: c.id,
          reference: c.reference,
          budgetAnnuel: c.budgetAnnuel,
          budgetUtilise: c.budgetUtilise,
          dateDebut: c.dateDebut,
          dateFin: c.dateFin,
          statut: c.statut,
        })),
        baremes: baremes.map(b => ({
          id: b.id,
          prestation: b.prestation,
          tauxCouverture: b.tauxCouverture,
          plafond: b.plafond,
          description: b.description,
        })),
        dossiers: dossiers.map(d => ({
          id: d.id,
          numeroDossier: d.numeroDossier,
          statut: d.statut,
          typeDossier: d.typeDossier,
          beneficiaire: d.beneficiaire,
          dateReception: d.dateReception,
          dateSoins: d.dateSoins,
          montantReclame: d.montantReclame,
          montantValide: d.montantValide,
          montantPaye: d.montantPaye,
          partPatient: d.partPatient,
          datePaiement: d.datePaiement,
          referencePaiement: d.referencePaiement,
          motifRejet: d.motifRejet,
          assure: d.assure ? {
            nom: d.assure.nom,
            prenom: d.assure.prenom,
            typeBeneficiaire: d.assure.typeBeneficiaire,
          } : null,
        })),
        kpis,
        pagination: metaPagination(page, limit, kpis.totalDossiers),
      });
    }

    // ─── Mode CONTACT_ENTREPRISE : vue entreprise ───
    if (role === 'CONTACT_ENTREPRISE') {
      // Re-résolution par e-mail du contact si le token ne porte pas la société
      if (!societeId && emailToken) {
        societeId = (await resoudreSocieteIdParEmailContact(emailToken)) ?? undefined;
      }

      if (!societeId) {
        console.error(
          `[PORTAIL CLIENT] Compte ${emailToken || userId} (rôle ${role}) : aucune liaison ` +
          `avec cet e-mail (contact déclaré, contact principal ou e-mail société).`
        );
        return NextResponse.json(
          {
            erreur:
              `Aucune société liée à votre compte${emailToken ? ` (e-mail recherché : ${emailToken})` : ''}. ` +
              `Vérifiez que ce compte a l'e-mail du contact principal (Modifier la société) ou d'un contact d'entreprise ; une fois corrigé, rechargez cette page.`,
          },
          { status: 403 }
        );
      }

      const societe = await db.societe.findUnique({
        where: { id: societeId },
      });

      if (!societe) {
        return NextResponse.json({ erreur: 'Société introuvable.' }, { status: 404 });
      }

      // Récupérer les assurés de cette société
      const assures = await db.assure.findMany({
        where: { societeId },
        include: {
          _count: { select: { dossiers: true } },
        },
        orderBy: [{ typeBeneficiaire: 'asc' }, { nom: 'asc' }],
      });

      // Récupérer les contrats
      const contrats = await db.contrat.findMany({
        where: { societeId },
        orderBy: { createdAt: 'desc' },
      });

      // ─── P2-02 : dossiers de la société PAGINÉS / triés / filtrés ────────
      const { page, limit, search, sortBy, sortOrder, statut } = paramsPaginationDossiers(new URL(request.url));
      const whereDossiers: Prisma.DossierWhereInput = { societeId };
      Object.assign(whereDossiers, filtreDateChamp('dateReception', plage));
      filtreDossiersPortail(whereDossiers, search, statut);
      const [dossiers, kpis] = await Promise.all([
        db.dossier.findMany({
          where: whereDossiers,
          include: {
            assure: { select: { id: true, nom: true, prenom: true, typeBeneficiaire: true } },
          },
          // Tri stable : id en second critère (aucun doublon ni omission)
          orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        kpisDossiersFiltres(whereDossiers),
      ]);

      return NextResponse.json({
        type: 'CONTACT_ENTREPRISE',
        societe: {
          id: societe.id,
          nom: societe.nom,
          adresse: societe.adresse,
          telephone: societe.telephone,
          email: societe.email,
        },
        assures: assures.map(a => ({
          id: a.id,
          nom: a.nom,
          prenom: a.prenom,
          // P2-03 : NSS masqué côté backend pour les contacts entreprise
          // (aucun masquage visuel React — la donnée ne quitte pas le serveur).
          nSS: masquerNss(a.nSS),
          matricule: a.matricule,
          typeBeneficiaire: a.typeBeneficiaire,
          dateEffet: a.dateEffet,
          actif: a.actif,
          nbDossiers: a._count.dossiers,
        })),
        contrats: contrats.map(c => ({
          id: c.id,
          reference: c.reference,
          budgetAnnuel: c.budgetAnnuel,
          budgetUtilise: c.budgetUtilise,
          dateDebut: c.dateDebut,
          dateFin: c.dateFin,
          statut: c.statut,
        })),
        dossiers: dossiers.map(d => ({
          id: d.id,
          numeroDossier: d.numeroDossier,
          statut: d.statut,
          typeDossier: d.typeDossier,
          beneficiaire: d.beneficiaire,
          dateReception: d.dateReception,
          dateSoins: d.dateSoins,
          montantReclame: d.montantReclame,
          montantValide: d.montantValide,
          montantPaye: d.montantPaye,
          partPatient: d.partPatient,
          datePaiement: d.datePaiement,
          referencePaiement: d.referencePaiement,
          motifRejet: d.motifRejet,
          assure: d.assure ? {
            nom: d.assure.nom,
            prenom: d.assure.prenom,
            typeBeneficiaire: d.assure.typeBeneficiaire,
          } : null,
        })),
        kpis: {
          ...kpis,
          totalAssures: assures.filter(a => a.typeBeneficiaire === 'ASSURE').length,
          totalAyantsDroit: assures.filter(a => a.typeBeneficiaire !== 'ASSURE').length,
        },
        pagination: metaPagination(page, limit, kpis.totalDossiers),
      });
    }

    // ─── ADMINISTRATEUR : mode test (utiliser assureId/societeId du token si fournis) ───
    return NextResponse.json({
      type: 'ADMINISTRATEUR',
      message: 'Mode administrateur. Utilisez un compte portail pour tester.',
    });
  } catch (error) {
    console.error('[PORTAIL CLIENT] Erreur :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors du chargement des données.' },
      { status: 500 }
    );
  }
}
