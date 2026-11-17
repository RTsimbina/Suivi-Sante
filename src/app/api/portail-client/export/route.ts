/**
 * /api/portail-client/export — Export des dossiers AUTORISÉS (P2-02C/D).
 *
 * Périmètre et filtres IDENTIQUES à la lecture (src/lib/portail-client-scope.ts) :
 *   - PORTAIL_CLIENT  → dossiers de toute la famille de l'assuré ;
 *   - CONTACT_ENTREPRISE → dossiers de la société uniquement ;
 *   - mêmes filtres : période (dateReception), search, statut.
 *
 * FORMATS :
 *   ?format=csv   → CSV prêt pour tableur (UTF-8 + BOM, échappement complet,
 *                   ANTI-INJECTION de formules : toute valeur commençant par
 *                   = + - @ ou tab est préfixée d'une apostrophe) ;
 *   ?format=json  → JSON complet (source de vérité pour le PDF jsPDF client).
 *
 * CONFIDENTIALITÉ (P2-03) : AUCUNE colonne NSS — les bénéficiaires sont
 * identifiés par nom/prénom ; l'export hérite de la politique de masquage
 * (le NSS ne quitte jamais le serveur, ni pour la lecture, ni pour l'export).
 *
 * PERFORMANCE (P2-02E) : traitement PAR LOTS (findMany skip/take de 1000)
 * jusqu'à MAX_EXPORT_DOSSIERS (10 000) — jamais tout en mémoire, cap raisonnable
 * et explicite (l'en-tête de réponse X-Export-Tronque l'indique).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { db } from '@/lib/db';
import { enNombre } from '@/lib/money';
import { verifierSessionUtilisateur } from '@/lib/session-revocation';
import {
  resoudreAssureParEmail,
  resoudreSocieteIdParEmailContact,
} from '@/lib/portail-client-scope';
import { plageDepuisParams, filtreDateChamp } from '@/lib/periodes';
import type { Prisma } from '@prisma/client';

const LOT = 1000;
const MAX_EXPORT_DOSSIERS = 10_000;

const COLONNES = [
  'numeroDossier', 'beneficiaire', 'typeDossier', 'statut', 'dateReception', 'dateSoins',
  'montantReclame', 'montantValide', 'montantPaye', 'partPatient', 'datePaiement',
  'referencePaiement', 'motifRejet', 'assureNom',
] as const;

/** Anti-injection CSV : neutralise les débuts de formule (=, +, -, @, tab). */
function neutraliserFormule(valeur: string): string {
  if (/^[=+\-@\t\r]/.test(valeur)) return `'${valeur}`;
  return valeur;
}

/** Échappe une valeur pour le CSV (guillemets, séparateurs, retours à la ligne). */
function celluleCsv(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';
  const brut = typeof valeur === 'number' ? String(valeur) : String(valeur);
  const neutralisee = neutraliserFormule(brut);
  if (/[";\n\r]/.test(neutralisee)) {
    return `"${neutralisee.replace(/"/g, '""')}"`;
  }
  return neutralisee;
}

export async function GET(request: NextRequest) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token) {
      return NextResponse.json({ erreur: 'Non authentifié.' }, { status: 401 });
    }

    // P1 Révocation : état réel du compte relu en base.
    const session = await verifierSessionUtilisateur(db, token);
    if (!session.ok) {
      return NextResponse.json({ erreur: session.erreur }, { status: session.statut });
    }

    const role = token.role as string;
    let assureId = token.assureId as string | undefined;
    let societeId = token.societeId as string | undefined;
    const emailToken = ((token.email as string | undefined) ?? '').trim();

    if (!['PORTAIL_CLIENT', 'CONTACT_ENTREPRISE', 'ADMINISTRATEUR'].includes(role)) {
      return NextResponse.json({ erreur: 'Accès refusé.' }, { status: 403 });
    }

    // ─── Résolution du périmètre (identique à la route de consultation) ────
    if (role === 'PORTAIL_CLIENT') {
      if (!assureId && emailToken) {
        const resolu = await resoudreAssureParEmail(emailToken);
        if (resolu) {
          assureId = resolu.id;
          societeId = resolu.societeId ?? societeId;
        }
      }
      if (!assureId) {
        return NextResponse.json(
          { erreur: 'Aucun assuré lié à votre compte. Vérifiez la liaison e-mail.' },
          { status: 403 },
        );
      }
    } else if (role === 'CONTACT_ENTREPRISE') {
      if (!societeId && emailToken) {
        societeId = (await resoudreSocieteIdParEmailContact(emailToken)) ?? undefined;
      }
      if (!societeId) {
        return NextResponse.json(
          { erreur: 'Aucune société liée à votre compte. Vérifiez la liaison e-mail.' },
          { status: 403 },
        );
      }
    } else {
      // ADMINISTRATEUR : mode test sans données personnelles (comme la lecture).
      return NextResponse.json(
        { erreur: 'Utilisez un compte portail pour tester l\'export.' },
        { status: 403 },
      );
    }

    // ─── Filtres identiques à la lecture ─────────────────────────────────────
    const params = new URL(request.url).searchParams;
    const format = params.get('format') === 'json' ? 'json' : 'csv';
    const search = (params.get('search') || '').trim().slice(0, 100);
    const statut = (params.get('statut') || '').trim();
    const plage = plageDepuisParams(params);

    const whereDossiers: Prisma.DossierWhereInput = {};
    if (role === 'PORTAIL_CLIENT' && assureId) {
      // Famille de l'assuré : principal + ayants droit
      const famille = await db.assure.findMany({
        where: { OR: [{ assurePrincipalId: assureId }, { id: assureId }] },
        select: { id: true },
      });
      whereDossiers.assureId = { in: famille.map(a => a.id) };
    } else if (societeId) {
      whereDossiers.societeId = societeId;
    }
    Object.assign(whereDossiers, filtreDateChamp('dateReception', plage));
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

    const nomSociete = societeId
      ? ((await db.societe.findUnique({ where: { id: societeId }, select: { nom: true } }))?.nom ?? '')
      : '';

    // ─── Chargement PAR LOTS (jamais tout en mémoire d'un coup) ──────────────
    const dossiers: {
      numeroDossier: string;
      beneficiaire: string;
      typeDossier: string;
      statut: string;
      dateReception: Date;
      dateSoins: Date | null;
      montantReclame: Prisma.Decimal | number | null;
      montantValide: Prisma.Decimal | number | null;
      montantPaye: Prisma.Decimal | number | null;
      partPatient: Prisma.Decimal | number | null;
      datePaiement: Date | null;
      referencePaiement: string | null;
      motifRejet: string | null;
      assure: { nom: string; prenom: string | null } | null;
    }[] = [];
    for (let skip = 0; skip < MAX_EXPORT_DOSSIERS; skip += LOT) {
      const page = await db.dossier.findMany({
        where: whereDossiers,
        select: {
          numeroDossier: true,
          beneficiaire: true,
          typeDossier: true,
          statut: true,
          dateReception: true,
          dateSoins: true,
          montantReclame: true,
          montantValide: true,
          montantPaye: true,
          partPatient: true,
          datePaiement: true,
          referencePaiement: true,
          motifRejet: true,
          assure: { select: { nom: true, prenom: true } },
        },
        orderBy: [{ dateReception: 'desc' }, { id: 'asc' }],
        skip,
        take: LOT,
      });
      dossiers.push(...page);
      if (page.length < LOT) break;
    }
    const tronque = dossiers.length >= MAX_EXPORT_DOSSIERS;

    if (format === 'json') {
      return NextResponse.json({
        societe: nomSociete,
        genereLe: new Date().toISOString(),
        total: dossiers.length,
        tronque,
        dossiers: dossiers.map(d => ({
          numeroDossier: d.numeroDossier,
          beneficiaire: d.beneficiaire,
          typeDossier: d.typeDossier,
          statut: d.statut,
          dateReception: d.dateReception,
          dateSoins: d.dateSoins,
          montantReclame: enNombre(d.montantReclame) ?? 0,
          montantValide: enNombre(d.montantValide),
          montantPaye: enNombre(d.montantPaye),
          partPatient: enNombre(d.partPatient),
          datePaiement: d.datePaiement,
          referencePaiement: d.referencePaiement,
          motifRejet: d.motifRejet,
          assureNom: d.assure ? `${d.assure.prenom || ''} ${d.assure.nom}`.trim() : '',
        })),
      });
    }

    // ─── CSV (UTF-8 + BOM pour Excel, séparateur ;) ─────────────────────────
    const lignes: string[] = [];
    lignes.push(COLONNES.join(';'));
    for (const d of dossiers) {
      lignes.push([
        celluleCsv(d.numeroDossier),
        celluleCsv(d.beneficiaire),
        celluleCsv(d.typeDossier),
        celluleCsv(d.statut),
        celluleCsv(d.dateReception?.toISOString?.().slice(0, 10) ?? ''),
        celluleCsv(d.dateSoins?.toISOString?.().slice(0, 10) ?? ''),
        celluleCsv(enNombre(d.montantReclame)),
        celluleCsv(enNombre(d.montantValide)),
        celluleCsv(enNombre(d.montantPaye)),
        celluleCsv(enNombre(d.partPatient)),
        celluleCsv(d.datePaiement?.toISOString?.().slice(0, 10) ?? ''),
        celluleCsv(d.referencePaiement),
        celluleCsv(d.motifRejet),
        celluleCsv(d.assure ? `${d.assure.prenom || ''} ${d.assure.nom}`.trim() : ''),
      ].join(';'));
    }
    const csv = '\uFEFF' + lignes.join('\r\n');
    const dateFichier = new Date().toISOString().slice(0, 10);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="dossiers-portail-${dateFichier}.csv"`,
        'X-Export-Total': String(dossiers.length),
        'X-Export-Tronque': String(tronque),
      },
    });
  } catch (error) {
    console.error('[PORTAIL CLIENT EXPORT] Erreur :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la génération de l\'export.' },
      { status: 500 },
    );
  }
}
