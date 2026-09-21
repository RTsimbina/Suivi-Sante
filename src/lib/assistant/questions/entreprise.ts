import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import type { AssistantContext, ParamValeurs, QuestionDef } from '../types';
import { AssistantError } from '../types';
import { resolvePeriode } from '../periods';
import { extrairePeriode } from '../context';
import {
  resultatNombre, resultatMontant, resultatTableau, resultatListe,
  resultatGraphique, resultatVide,
  round2, fmtAr, fmtNb, statutLabel, serieMensuelle, COLONNES_DOSSIER, LIMITE_LISTE,
} from '../results';
import { scopeSociete } from './scope';

// ─── Catalogue ENTREPRISE CLIENTE (CONTACT_ENTREPRISE) — 20 questions ────────
// Les questions sont limitées aux données de l'entreprise connectée et de
// ses assurés. Le societeId provient EXCLUSIVEMENT du token (serveur).

const T = (question: string) => ({ question });
const P = (params: ParamValeurs) => resolvePeriode(extrairePeriode(params));

async function whereSociete(ctx: AssistantContext, extra: Record<string, unknown> = {}) {
  return { societeId: scopeSociete(ctx), ...extra };
}

export const questionsEntreprise: QuestionDef[] = [
  // ─── Assurés ───────────────────────────────────────────────────────────────
  {
    id: 'ENTREPRISE_TOTAL_ASSURES',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'Nos assurés',
    question: "Combien d'assurés sont rattachés à notre entreprise ?",
    params: [],
    presentation: 'NOMBRE',
    async impl(ctx) {
      const total = await db.assure.count({ where: await whereSociete(ctx) });
      const principaux = await db.assure.count({
        where: await whereSociete(ctx, { typeBeneficiaire: 'ASSURE' }),
      });
      return resultatNombre(T('Assurés de l\u2019entreprise'), total,
        `${fmtNb(total)} assuré(s) rattaché(s), dont ${fmtNb(principaux)} principal/aux (reste : ayants droit).`);
    },
  },
  {
    id: 'ENTREPRISE_ASSURES_ACTIFS',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'Nos assurés',
    question: "Combien d'assurés sont actuellement actifs ?",
    params: [],
    presentation: 'NOMBRE',
    async impl(ctx) {
      const total = await db.assure.count({ where: await whereSociete(ctx, { actif: true }) });
      return resultatNombre(T('Assurés actifs'), total, `${fmtNb(total)} assuré(s) actif(s).`);
    },
  },
  {
    id: 'ENTREPRISE_ASSURES_LISTE',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'Nos assurés',
    question: 'Quels sont les assurés rattachés à notre entreprise ?',
    params: [],
    presentation: 'LISTE',
    async impl(ctx) {
      const where = await whereSociete(ctx);
      const total = await db.assure.count({ where });
      const assures = await db.assure.findMany({
        where,
        orderBy: [{ typeBeneficiaire: 'asc' }, { nom: 'asc' }],
        take: LIMITE_LISTE,
        select: { nom: true, prenom: true, matricule: true, typeBeneficiaire: true, actif: true },
      });
      if (total === 0) return resultatVide(T('Assurés de l\u2019entreprise'));
      return resultatListe(
        T('Assurés rattachés à votre entreprise'),
        [
          { key: 'nom', label: 'Nom', type: 'texte' },
          { key: 'type', label: 'Type', type: 'texte' },
          { key: 'matricule', label: 'Matricule', type: 'texte' },
          { key: 'actif', label: 'Actif', type: 'texte' },
        ],
        assures.map((a) => ({
          nom: [a.nom, a.prenom].filter(Boolean).join(' '),
          type: a.typeBeneficiaire,
          matricule: a.matricule ?? '—',
          actif: a.actif ? 'Oui' : 'Non',
        })),
        total,
        `${fmtNb(total)} assuré(s) au total (${assures.length} affiché(s)).`
      );
    },
  },
  {
    id: 'ENTREPRISE_ASSURES_MULTI_DOSSIERS',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'Nos assurés',
    question: 'Quels assurés ont plusieurs dossiers en cours ?',
    params: [],
    presentation: 'TABLEAU',
    async impl(ctx) {
      const societeId = scopeSociete(ctx);
      const rows = await db.dossier.groupBy({
        by: ['assureId'],
        where: { societeId, statut: { notIn: ['PAYE', 'REJETE'] }, assureId: { not: null } },
        _count: { assureId: true },
        having: { assureId: { _count: { gte: 2 } } },
      });
      if (rows.length === 0) return resultatVide(T('Assurés multi-dossiers'));
      const ids = rows.map((r) => r.assureId!);
      const assures = await db.assure.findMany({
        where: { id: { in: ids } },
        select: { id: true, nom: true, prenom: true, matricule: true },
      });
      const map = new Map(assures.map((a) => [a.id, a]));
      const lignes = rows
        .map((r) => ({
          nom: map.has(r.assureId!)
            ? [map.get(r.assureId!)!.nom, map.get(r.assureId!)!.prenom].filter(Boolean).join(' ')
            : 'Inconnu',
          matricule: map.get(r.assureId!)?.matricule ?? '—',
          nb: r._count.assureId,
        }))
        .sort((a, b) => b.nb - a.nb)
        .slice(0, LIMITE_LISTE);
      return resultatTableau(
        T('Assurés avec plusieurs dossiers en cours'),
        [
          { key: 'nom', label: 'Assuré', type: 'texte' },
          { key: 'matricule', label: 'Matricule', type: 'texte' },
          { key: 'nb', label: 'Dossiers en cours', type: 'nombre' },
        ],
        lignes, lignes.length,
        `${lignes.length} assuré(s) ont plusieurs dossiers en cours simultanément.`);
    },
  },

  // ─── Dossiers ──────────────────────────────────────────────────────────────
  {
    id: 'ENTREPRISE_DOSSIERS_PERIODE',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'Nos dossiers',
    question: 'Combien de dossiers ont été ouverts sur une période donnée ?',
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'NOMBRE',
    async impl(ctx, params) {
      const periode = P(params);
      const where = await whereSociete(ctx, { dateReception: { gte: periode.du, lte: periode.au } });
      const total = await db.dossier.count({ where });
      return resultatNombre(T('Dossiers ouverts sur la période'), total,
        `${fmtNb(total)} dossier(s) ouvert(s) pour votre entreprise — ${periode.label}.`, periode);
    },
  },
  {
    id: 'ENTREPRISE_DOSSIERS_EN_COURS',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'Nos dossiers',
    question: 'Combien de dossiers sont actuellement en cours ?',
    params: [],
    presentation: 'NOMBRE',
    async impl(ctx) {
      const total = await db.dossier.count({
        where: await whereSociete(ctx, { statut: { notIn: ['PAYE', 'REJETE'] } }),
      });
      return resultatNombre(T('Dossiers en cours'), total,
        `${fmtNb(total)} dossier(s) en cours de traitement (non clôturé(s)).`);
    },
  },
  {
    id: 'ENTREPRISE_DOSSIERS_ATTENTE',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'Nos dossiers',
    question: 'Combien de dossiers sont en attente ?',
    params: [],
    presentation: 'NOMBRE',
    async impl(ctx) {
      const total = await db.dossier.count({
        where: await whereSociete(ctx, { statut: { in: ['RECU', 'EN_ANALYSE'] } }),
      });
      return resultatNombre(T('Dossiers en attente'), total,
        `${fmtNb(total)} dossier(s) en attente (Reçu / En analyse).`);
    },
  },
  {
    id: 'ENTREPRISE_DOSSIERS_CLOTURES',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'Nos dossiers',
    question: 'Combien de dossiers sont clôturés ?',
    params: [],
    presentation: 'NOMBRE',
    async impl(ctx) {
      const [payes, rejetes] = await Promise.all([
        db.dossier.count({ where: await whereSociete(ctx, { statut: 'PAYE' }) }),
        db.dossier.count({ where: await whereSociete(ctx, { statut: 'REJETE' }) }),
      ]);
      return resultatNombre(T('Dossiers clôturés'), payes + rejetes,
        `${fmtNb(payes + rejetes)} dossier(s) clôturé(s) : ${fmtNb(payes)} payé(s), ${fmtNb(rejetes)} rejeté(s).`);
    },
  },
  {
    id: 'ENTREPRISE_REPARTITION_STATUT',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'Nos dossiers',
    question: 'Quelle est la répartition des dossiers par statut ?',
    params: [],
    presentation: 'TABLEAU',
    async impl(ctx) {
      const rows = await db.dossier.groupBy({
        by: ['statut'],
        where: await whereSociete(ctx),
        _count: { statut: true },
      });
      const total = rows.reduce((s, r) => s + r._count.statut, 0);
      if (total === 0) return resultatVide(T('Répartition par statut'));
      rows.sort((a, b) => b._count.statut - a._count.statut);
      return resultatTableau(
        T('Répartition de vos dossiers par statut'),
        [
          { key: 'statut', label: 'Statut', type: 'statut' },
          { key: 'nb', label: 'Nombre', type: 'nombre' },
          { key: 'pct', label: 'Part (%)', type: 'nombre' },
        ],
        rows.map((r) => ({
          statut: statutLabel(r.statut),
          nb: r._count.statut,
          pct: Math.round((r._count.statut / total) * 100),
        })),
        rows.length,
        `Répartition de ${fmtNb(total)} dossier(s) de votre entreprise.`);
    },
  },

  // ─── Remboursements & finances ─────────────────────────────────────────────
  {
    id: 'ENTREPRISE_TOTAL_REMBOURSEMENTS',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'Remboursements',
    question: 'Quel est le montant total des remboursements de nos assurés ?',
    params: [],
    presentation: 'MONTANT',
    async impl(ctx) {
      const res = await db.dossier.aggregate({
        where: await whereSociete(ctx, { statut: 'PAYE' }),
        _sum: { montantPaye: true },
        _count: true,
      });
      return resultatMontant(T('Remboursements de vos assurés'), round2(res._sum.montantPaye),
        `${fmtAr(round2(res._sum.montantPaye))} versés au titre de ${fmtNb(res._count)} remboursement(s).`);
    },
  },
  {
    id: 'ENTREPRISE_EVOLUTION_REMBOURSEMENTS',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'Remboursements',
    question: "Quelle est l'évolution des remboursements par mois ?",
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'GRAPHIQUE',
    async impl(ctx, params) {
      const periode = P(params);
      const societeId = scopeSociete(ctx);
      const serie = await serieMensuelle({
        champDate: 'datePaiement',
        champSomme: 'montantPaye',
        periode,
        filtres: [Prisma.sql`AND "societeId" = ${societeId}`],
      });
      const total = serie.reduce((s, p) => s + p.valeur, 0);
      if (total === 0) return resultatVide(T('Évolution des remboursements'), periode);
      return resultatGraphique(T('Évolution des remboursements de vos assurés'), serie, 'Montant payé (Ar)',
        `${fmtAr(total)} remboursés — ${periode.label}.`, periode);
    },
  },
  {
    id: 'ENTREPRISE_PRESTATIONS_PERIODE',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'Remboursements',
    question: 'Combien de prestations ont été réalisées sur une période donnée ?',
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'NOMBRE',
    async impl(ctx, params) {
      const periode = P(params);
      const total = await db.dossier.count({
        where: await whereSociete(ctx, { dateSoins: { gte: periode.du, lte: periode.au } }),
      });
      return resultatNombre(T('Prestations réalisées'), total,
        `${fmtNb(total)} prestation(s) avec date de soins — ${periode.label}.`, periode);
    },
  },
  {
    id: 'ENTREPRISE_TOTAL_PRESTATIONS',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'Remboursements',
    question: 'Quel est le montant total des prestations ?',
    params: [],
    presentation: 'MONTANT',
    async impl(ctx) {
      const res = await db.dossier.aggregate({
        where: await whereSociete(ctx),
        _sum: { montantReclame: true, montantPaye: true },
        _count: true,
      });
      return resultatMontant(T('Montant total des prestations'), round2(res._sum.montantReclame),
        `${fmtAr(round2(res._sum.montantReclame))} réclamés sur ${fmtNb(res._count)} dossier(s) (dont ${fmtAr(round2(res._sum.montantPaye))} déjà remboursés).`);
    },
  },

  // ─── Actes & prestataires ──────────────────────────────────────────────────
  {
    id: 'ENTREPRISE_ACTES_TOP',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'Actes & prestataires',
    question: 'Quels sont les actes médicaux les plus utilisés ?',
    params: [],
    presentation: 'TABLEAU',
    async impl(ctx) {
      const rows = await db.dossier.groupBy({
        by: ['typeDossier'],
        where: await whereSociete(ctx),
        _count: { typeDossier: true },
        _sum: { montantReclame: true },
      });
      if (rows.length === 0) return resultatVide(T('Actes les plus utilisés'));
      const lignes = rows.sort((a, b) => b._count.typeDossier - a._count.typeDossier).slice(0, LIMITE_LISTE);
      return resultatTableau(
        T('Actes médicaux les plus utilisés par vos assurés'),
        [
          { key: 'acte', label: 'Acte', type: 'texte' },
          { key: 'nb', label: 'Nombre', type: 'nombre' },
          { key: 'montant', label: 'Montant réclamé', type: 'montant' },
        ],
        lignes.map((r) => ({ acte: r.typeDossier, nb: r._count.typeDossier, montant: round2(r._sum.montantReclame) })),
        lignes.length,
        `${lignes.length} type(s) d'acte(s) utilisé(s).`
      );
    },
  },
  {
    id: 'ENTREPRISE_PRESTATAIRES_TOP',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'Actes & prestataires',
    question: 'Quels sont les prestataires les plus sollicités par nos assurés ?',
    params: [],
    presentation: 'TABLEAU',
    async impl(ctx) {
      const rows = await db.dossier.groupBy({
        by: ['prestataireId'],
        where: await whereSociete(ctx, { prestataireId: { not: null } }),
        _count: true,
        _sum: { montantReclame: true },
      });
      const ids = rows.map((r) => r.prestataireId!).filter(Boolean);
      if (ids.length === 0) return resultatVide(T('Prestataires les plus sollicités'));
      const prests = await db.prestataire.findMany({ where: { id: { in: ids } }, select: { id: true, nom: true } });
      const noms = new Map(prests.map((p) => [p.id, p.nom]));
      const lignes = rows
        .map((r) => ({ prestataire: noms.get(r.prestataireId!) ?? 'Inconnu', nb: r._count, montant: round2(r._sum.montantReclame) }))
        .sort((a, b) => b.nb - a.nb)
        .slice(0, LIMITE_LISTE);
      return resultatTableau(
        T('Prestataires les plus sollicités par vos assurés'),
        [
          { key: 'prestataire', label: 'Prestataire', type: 'texte' },
          { key: 'nb', label: 'Dossiers', type: 'nombre' },
          { key: 'montant', label: 'Montant réclamé', type: 'montant' },
        ],
        lignes, lignes.length,
        `${lignes.length} prestataire(s) sollicité(s) par vos assurés.`);
    },
  },

  // ─── Facturation (appels de fonds) ─────────────────────────────────────────
  {
    id: 'ENTREPRISE_FACTURES',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'Facturation',
    question: 'Quel est le montant total des factures liées à notre entreprise ?',
    params: [],
    presentation: 'MONTANT',
    note: 'Facturation vers votre entreprise = appels de fonds émis sur vos contrats.',
    async impl(ctx) {
      const societeId = scopeSociete(ctx);
      const res = await db.appelDeFonds.aggregate({
        where: { contrat: { societeId } },
        _sum: { montant: true },
        _count: true,
      });
      return resultatMontant(T('Factures de votre entreprise (appels de fonds)'), round2(res._sum.montant),
        `${fmtAr(round2(res._sum.montant))} d'appels de fonds émis sur vos contrats (${fmtNb(res._count)} au total).`);
    },
  },
  {
    id: 'ENTREPRISE_FACTURES_RESTANT',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'Facturation',
    question: 'Quel est le montant des factures restant à payer ?',
    params: [],
    presentation: 'MONTANT',
    async impl(ctx) {
      const societeId = scopeSociete(ctx);
      const res = await db.appelDeFonds.aggregate({
        where: { contrat: { societeId }, statut: 'EN_ATTENTE' },
        _sum: { montant: true },
        _count: true,
      });
      return resultatMontant(T('Factures restant à payer (appels de fonds en attente)'), round2(res._sum.montant),
        `${fmtAr(round2(res._sum.montant))} restant à régler sur ${fmtNb(res._count)} appel(s) de fonds en attente.`);
    },
  },

  // ─── Contrats ──────────────────────────────────────────────────────────────
  {
    id: 'ENTREPRISE_CONTRATS_ACTIFS',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'Nos contrats',
    question: 'Quels contrats sont actuellement actifs ?',
    params: [],
    presentation: 'LISTE',
    async impl(ctx) {
      const societeId = scopeSociete(ctx);
      const contrats = await db.contrat.findMany({
        where: { societeId, statut: 'ACTIF' },
        orderBy: { dateFin: 'asc' },
        select: { reference: true, budgetAnnuel: true, budgetUtilise: true, dateDebut: true, dateFin: true },
      });
      if (contrats.length === 0) return resultatVide(T('Contrats actifs'));
      return resultatListe(
        T('Contrats actifs de votre entreprise'),
        [
          { key: 'ref', label: 'Référence', type: 'texte' },
          { key: 'budget', label: 'Budget annuel', type: 'montant' },
          { key: 'utilise', label: 'Budget utilisé', type: 'montant' },
          { key: 'fin', label: 'Échéance', type: 'date' },
        ],
        contrats.map((c) => ({
          ref: c.reference,
          budget: Math.round(c.budgetAnnuel * 100) / 100,
          utilise: Math.round(c.budgetUtilise * 100) / 100,
          fin: c.dateFin.toISOString(),
        })),
        contrats.length,
        `${contrats.length} contrat(s) actif(s).`
      );
    },
  },
  {
    id: 'ENTREPRISE_CONTRATS_ECHEANCE',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'Nos contrats',
    question: 'Quels contrats arrivent prochainement à échéance ?',
    params: [],
    presentation: 'LISTE',
    async impl(ctx) {
      const societeId = scopeSociete(ctx);
      const limite = new Date();
      limite.setDate(limite.getDate() + 90);
      limite.setHours(23, 59, 59, 999);
      const contrats = await db.contrat.findMany({
        where: { societeId, statut: 'ACTIF', dateFin: { lte: limite } },
        orderBy: { dateFin: 'asc' },
        select: { reference: true, dateFin: true },
      });
      if (contrats.length === 0) return resultatVide(T('Contrats à échéance prochaine'));
      return resultatListe(
        T('Contrats arrivant à échéance (90 jours)'),
        [
          { key: 'ref', label: 'Référence', type: 'texte' },
          { key: 'fin', label: 'Échéance', type: 'date' },
        ],
        contrats.map((c) => ({ ref: c.reference, fin: c.dateFin.toISOString() })),
        contrats.length,
        `${contrats.length} contrat(s) à échéance dans les 90 prochains jours.`
      );
    },
  },

  // ─── Utilisation ───────────────────────────────────────────────────────────
  {
    id: 'ENTREPRISE_EVOLUTION_UTILISATION',
    role: 'CONTACT_ENTREPRISE',
    categorie: 'Utilisation',
    question: "Quelle est l'évolution de l'utilisation des prestations de nos assurés ?",
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'GRAPHIQUE',
    async impl(ctx, params) {
      const periode = P(params);
      const societeId = scopeSociete(ctx);
      const serie = await serieMensuelle({
        champDate: 'dateReception',
        periode,
        filtres: [Prisma.sql`AND "societeId" = ${societeId}`],
      });
      const total = serie.reduce((s, p) => s + p.valeur, 0);
      if (total === 0) return resultatVide(T('Évolution de l\u2019utilisation'), periode);
      return resultatGraphique(T('Évolution de l\u2019utilisation des prestations'), serie, 'Dossiers reçus',
        `${fmtNb(total)} dossier(s) reçus — ${periode.label}.`, periode);
    },
  },
];
