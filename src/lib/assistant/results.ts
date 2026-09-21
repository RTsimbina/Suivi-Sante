import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import type { AssistantResultCore, ResultColonne, ResultKpi } from './types';
import type { PeriodeResolue } from './types';
import { periodeSqlFrag } from './periods';

// ─── Builders de résultats structurés (cœur, sans identité de question) ──────

export function withPeriode(r: AssistantResultCore, periode: PeriodeResolue | null): AssistantResultCore {
  if (!periode) return r;
  return {
    ...r,
    periode: { du: periode.du.toISOString(), au: periode.au.toISOString(), label: periode.label },
  };
}

export function resultatNombre(
  _q: { question: string },
  valeur: number,
  synthese: string,
  periode: PeriodeResolue | null = null
): AssistantResultCore {
  return withPeriode({ type: 'NOMBRE', titre: _q.question, synthese, valeur, unite: 'dossiers', periode: null, date: new Date().toISOString() }, periode);
}

export function resultatMontant(
  _q: { question: string },
  valeur: number,
  synthese: string,
  periode: PeriodeResolue | null = null
): AssistantResultCore {
  return withPeriode({ type: 'MONTANT', titre: _q.question, synthese, valeur, unite: 'Ar', periode: null, date: new Date().toISOString() }, periode);
}

export function resultatVide(_q: { question: string }, periode: PeriodeResolue | null = null): AssistantResultCore {
  return withPeriode(
    {
      type: 'TEXTE',
      titre: _q.question,
      synthese:
        "Aucune donnée correspondant aux critères sélectionnés n'a été trouvée dans la base de la plateforme.",
      periode: null,
      date: new Date().toISOString(),
    },
    periode
  );
}

export function resultatTableau(
  _q: { question: string },
  colonnes: ResultColonne[],
  lignes: Record<string, string | number | null>[],
  totalLignes: number,
  synthese: string,
  periode: PeriodeResolue | null = null
): AssistantResultCore {
  return withPeriode(
    { type: 'TABLEAU', titre: _q.question, colonnes, lignes, totalLignes, synthese, periode: null, date: new Date().toISOString() },
    periode
  );
}

export function resultatListe(
  _q: { question: string },
  colonnes: ResultColonne[],
  lignes: Record<string, string | number | null>[],
  totalLignes: number,
  synthese: string,
  periode: PeriodeResolue | null = null
): AssistantResultCore {
  return withPeriode(
    { type: 'LISTE', titre: _q.question, colonnes, lignes, totalLignes, synthese, periode: null, date: new Date().toISOString() },
    periode
  );
}

export function resultatGraphique(
  _q: { question: string },
  serie: { label: string; valeur: number }[],
  serieNom: string,
  synthese: string,
  periode: PeriodeResolue | null = null
): AssistantResultCore {
  return withPeriode(
    { type: 'GRAPHIQUE', titre: _q.question, serie, serieNom, synthese, periode: null, date: new Date().toISOString() },
    periode
  );
}

export function resultatKpi(
  _q: { question: string },
  kpis: ResultKpi[],
  synthese: string,
  periode: PeriodeResolue | null = null
): AssistantResultCore {
  return withPeriode({ type: 'KPI', titre: _q.question, kpis, synthese, periode: null, date: new Date().toISOString() }, periode);
}

// ─── Helpers de mise en forme ────────────────────────────────────────────────

export function round2(n: number | null | undefined): number {
  if (n === null || n === undefined || isNaN(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function fmtAr(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(round2(n)) + ' Ar';
}

export function fmtNb(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n);
}

// ─── Libellés métier (sources réelles de la plateforme) ──────────────────────

export const STATUT_LABELS: Record<string, string> = {
  RECU: 'Reçu',
  EN_ANALYSE: 'En analyse',
  VALIDE: 'Validé',
  EN_COMPTABILITE: 'En comptabilité',
  EN_PAIEMENT: 'En paiement',
  PAYE: 'Payé',
  REJETE: 'Rejeté',
};

export function statutLabel(s: string): string {
  return STATUT_LABELS[s] ?? s;
}

/** Statuts « non clôturés » (dossier encore en cours de traitement) */
export const STATUTS_EN_COURS = ['RECU', 'EN_ANALYSE', 'VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT'];

/** Statuts « en attente » au sens accueil/contrôle (RECU + EN_ANALYSE) */
export const STATUTS_ATTENTE = ['RECU', 'EN_ANALYSE'];

/** Colonnes standards des listes de dossiers */
export const COLONNES_DOSSIER: ResultColonne[] = [
  { key: 'numero', label: 'N° dossier', type: 'texte' },
  { key: 'beneficiaire', label: 'Bénéficiaire', type: 'texte' },
  { key: 'type', label: 'Acte', type: 'texte' },
  { key: 'statut', label: 'Statut', type: 'statut' },
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'montant', label: 'Montant réclamé', type: 'montant' },
];

/** Colonnes standards des tableaux par société */
export const COLONNES_SOCIETE: ResultColonne[] = [
  { key: 'societe', label: 'Société', type: 'texte' },
  { key: 'nb', label: 'Nb dossiers', type: 'nombre' },
  { key: 'montant', label: 'Montant réclamé', type: 'montant' },
  { key: 'paye', label: 'Montant payé', type: 'montant' },
];

// ─── Requêtes partagées ──────────────────────────────────────────────────────

export const LIMITE_LISTE = 15;

/**
 * Sérialise une liste de dossiers pour affichage LISTE/TABLEAU.
 * Le périmètre (scope) doit être appliqué dans le `where` par l'appelant.
 */
export async function lignesDossiers(
  where: Record<string, unknown>,
  orderBy: 'dateReception' | 'createdAt' | 'updatedAt' | 'datePaiement' = 'dateReception',
  take = LIMITE_LISTE
) {
  const [total, dossiers] = await Promise.all([
    db.dossier.count({ where: where as Prisma.DossierWhereInput }),
    db.dossier.findMany({
      where: where as Prisma.DossierWhereInput,
      orderBy: { [orderBy]: 'desc' },
      take,
      select: {
        numeroDossier: true,
        beneficiaire: true,
        typeDossier: true,
        statut: true,
        dateReception: true,
        montantReclame: true,
      },
    }),
  ]);
  const lignes = dossiers.map((d) => ({
    numero: d.numeroDossier,
    beneficiaire: d.beneficiaire,
    type: d.typeDossier,
    statut: statutLabel(d.statut),
    date: d.dateReception.toISOString(),
    montant: round2(d.montantReclame),
  }));
  return { total, lignes };
}

// ─── Séries mensuelles (SQL brut paramétré, périmètre forcé) ─────────────────

export interface SerieOptions {
  /** Champ de date pour l'axe temporel (liste blanche via periodeSqlFrag) */
  champDate: string;
  /** Champ de somme optionnel (sinon COUNT) */
  champSomme?: 'montantReclame' | 'montantPaye' | 'montantValide' | 'solde';
  periode: PeriodeResolue;
  /** Filtres supplémentaires (fragments Prisma sûrs) */
  filtres?: Prisma.Sql[];
}

/**
 * Série mensuelle COUNT ou SUM sur la table Dossier.
 * Les fragments de filtre proviennent exclusivement du serveur (scope ou
 * paramètres validés) ; les dates sont liées via Prisma.sql.
 */
export async function serieMensuelle(opts: SerieOptions): Promise<{ label: string; valeur: number }[]> {
  const filtres = opts.filtres && opts.filtres.length > 0
    ? Prisma.join(opts.filtres, ' ')
    : Prisma.empty;
  const agregat = opts.champSomme
    ? opts.champSomme === 'solde'
      ? Prisma.sql`SUM("montantReclame" - COALESCE("montantPaye", 0))`
      : Prisma.sql`SUM("${Prisma.raw(opts.champSomme)}")`
    : Prisma.sql`COUNT(*)`;

  const rows: { mois: string; valeur: bigint | number | null }[] = await db.$queryRaw`
    SELECT TO_CHAR("${Prisma.raw(opts.champDate)}", 'YYYY-MM') AS mois,
           COALESCE(${agregat}, 0) AS valeur
    FROM "Dossier"
    WHERE TRUE
    ${periodeSqlFrag(opts.champDate, opts.periode)}
    ${filtres}
    GROUP BY mois
    ORDER BY mois
  `;

  return rows.map((r) => ({ label: r.mois, valeur: Number(r.valeur ?? 0) }));
}

/**
 * Étend le périmètre d'assuré d'un PORTAIL_CLIENT à sa famille
 * (assuré principal + ayants droit rattachés par assurePrincipalId),
 * conformément au portail client existant.
 */
export async function familleAssureIds(assureId: string): Promise<string[]> {
  const rows = await db.assure.findMany({
    where: { OR: [{ assurePrincipalId: assureId }, { id: assureId }] },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Sociétés clientes autorisées pour un prestataire (liaison PrestataireSociete).
 * Utilisé pour valider le paramètre SOCIETE d'un PORTAIL_PRESTATAIRE.
 */
export async function societesDuPrestataire(prestataireId: string): Promise<string[]> {
  const rows = await db.prestataireSociete.findMany({
    where: { prestataireId },
    select: { societeId: true },
  });
  return rows.map((r) => r.societeId);
}

/**
 * Construit le filtre de périmètre Dossier pour un contexte donné.
 * C'est le seul endroit où le scope est traduit en condition Prisma :
 *   - rôles internes : aucun filtre (comportement plateforme) ;
 *   - CONTACT_ENTREPRISE : societeId forcé ;
 *   - PORTAIL_CLIENT : assureId ∈ famille (résolu côté serveur) ;
 *   - PORTAIL_PRESTATAIRE : prestataireId forcé.
 */
export async function filtresScopeDossier(ctx: AssistantContext): Promise<Record<string, unknown>> {
  switch (ctx.role) {
    case 'CONTACT_ENTREPRISE': {
      if (!ctx.societeId) throw new Error('Société non rattachée');
      return { societeId: ctx.societeId };
    }
    case 'PORTAIL_CLIENT': {
      if (!ctx.assureId) throw new Error('Assuré non rattaché');
      const ids = await familleAssureIds(ctx.assureId);
      return { assureId: { in: ids } };
    }
    case 'PORTAIL_PRESTATAIRE': {
      if (!ctx.prestataireId) throw new Error('Prestataire non rattaché');
      return { prestataireId: ctx.prestataireId };
    }
    default:
      return {};
  }
}

/**
 * Filtre de périmètre en SQL brut (fragment Prisma) — même sémantique que
 * filtresScopeDossier mais pour les requêtes $queryRaw.
 */
export async function filtresScopeSql(ctx: AssistantContext, colonneAssure = 'assureId'): Promise<Prisma.Sql> {
  switch (ctx.role) {
    case 'CONTACT_ENTREPRISE':
      if (!ctx.societeId) throw new Error('Société non rattachée');
      return Prisma.sql`AND "societeId" = ${ctx.societeId}`;
    case 'PORTAIL_CLIENT': {
      if (!ctx.assureId) throw new Error('Assuré non rattaché');
      const ids = await familleAssureIds(ctx.assureId);
      const inList = Prisma.join(ids, ', ');
      return Prisma.sql`AND "${Prisma.raw(colonneAssure)}" IN (${inList})`;
    }
    case 'PORTAIL_PRESTATAIRE':
      if (!ctx.prestataireId) throw new Error('Prestataire non rattaché');
      return Prisma.sql`AND "prestataireId" = ${ctx.prestataireId}`;
    default:
      return Prisma.empty;
  }
}
