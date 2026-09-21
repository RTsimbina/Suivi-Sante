import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import type { ParamValeurs, QuestionDef } from '../types';
import { AssistantError } from '../types';
import { resolvePeriode } from '../periods';
import { extrairePeriode } from '../context';
import {
  resultatNombre, resultatMontant, resultatTableau, resultatListe,
  resultatGraphique, resultatKpi, resultatVide,
  round2, enNombre, fmtAr, fmtNb, statutLabel, STATUTS_EN_COURS, serieMensuelle,
  COLONNES_DOSSIER, LIMITE_LISTE,
} from '../results';

// ─── Catalogue COMPTABILITÉ — 20 questions prédéfinies ───────────────────────
// Mapping réel : « factures » = dossiers de soins (montant réclamé) ;
// « règlements » = paiements effectués (montantPaye / datePaiement) ;
// « facturation vers les sociétés clientes » = appels de fonds.

const T = (question: string) => ({ question });
const P = (params: ParamValeurs) => resolvePeriode(extrairePeriode(params));

/** Solde d'un dossier = montant réclamé − montant payé (Decimal → Number) */
function solde(d: { montantReclame: unknown; montantPaye: unknown }): number {
  return round2(enNombre(d.montantReclame) - enNombre(d.montantPaye));
}

export const questionsComptabilite: QuestionDef[] = [
  // ─── Factures ──────────────────────────────────────────────────────────────
  {
    id: 'COMPTA_TOTAL_FACTURES',
    role: 'COMPTABILITE',
    categorie: 'Factures',
    question: 'Quel est le montant total des factures sur une période donnée ?',
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'MONTANT',
    note: 'Total des montants réclamés par les prestataires (dossiers de soins).',
    async impl(_ctx, params) {
      const periode = P(params);
      const res = await db.dossier.aggregate({
        where: { dateReception: { gte: periode.du, lte: periode.au } },
        _sum: { montantReclame: true },
        _count: true,
      });
      return resultatMontant(T('Total des factures'), round2(res._sum.montantReclame),
        `${fmtAr(round2(res._sum.montantReclame))} réclamés sur ${fmtNb(res._count)} dossier(s) — ${periode.label}.`, periode);
    },
  },
  {
    id: 'COMPTA_FACTURES_IMPAYEES',
    role: 'COMPTABILITE',
    categorie: 'Factures',
    question: 'Quel est le montant total des factures impayées ?',
    params: [],
    presentation: 'MONTANT',
    async impl() {
      const res = await db.dossier.aggregate({
        where: { statut: { in: STATUTS_EN_COURS } },
        _sum: { montantReclame: true, montantPaye: true },
        _count: true,
      });
      const montant = round2(enNombre(res._sum.montantReclame) - enNombre(res._sum.montantPaye));
      return resultatMontant(T('Factures impayées'), montant,
        `${fmtAr(montant)} restant à payer sur ${fmtNb(res._count)} dossier(s) en cours.`);
    },
  },
  {
    id: 'COMPTA_FACTURES_IMPAYEES_LISTE',
    role: 'COMPTABILITE',
    categorie: 'Factures',
    question: 'Quelles factures sont actuellement impayées ?',
    params: [],
    presentation: 'LISTE',
    async impl() {
      const total = await db.dossier.count({ where: { statut: { in: STATUTS_EN_COURS } } });
      const dossiers = await db.dossier.findMany({
        where: { statut: { in: STATUTS_EN_COURS } },
        orderBy: { dateReception: 'asc' },
        take: LIMITE_LISTE,
        select: { numeroDossier: true, beneficiaire: true, typeDossier: true, statut: true, dateReception: true, montantReclame: true, montantPaye: true },
      });
      if (total === 0) return resultatVide(T('Factures impayées'));
      return resultatListe(
        T('Factures actuellement impayées (dossiers en cours)'),
        [...COLONNES_DOSSIER, { key: 'solde', label: 'Solde restant', type: 'montant' }],
        dossiers.map((d) => ({
          numero: d.numeroDossier,
          beneficiaire: d.beneficiaire,
          type: d.typeDossier,
          statut: statutLabel(d.statut),
          date: d.dateReception.toISOString(),
          montant: round2(d.montantReclame),
          solde: solde(d),
        })),
        total,
        `${fmtNb(total)} dossier(s) en cours non soldé(s) (les plus anciens d'abord).`
      );
    },
  },
  {
    id: 'COMPTA_FACTURES_ECHEANCE',
    role: 'COMPTABILITE',
    categorie: 'Factures',
    question: 'Quelles factures sont arrivées à échéance ?',
    params: [],
    presentation: 'LISTE',
    note: 'Dossiers non réglés reçus depuis plus de 30 jours (délai de règlement usuel dépassé).',
    async impl() {
      const limite = new Date(Date.now() - 30 * 86_400_000);
      const where: Prisma.DossierWhereInput = {
        statut: { in: STATUTS_EN_COURS },
        dateReception: { lt: limite },
      };
      const total = await db.dossier.count({ where });
      const dossiers = await db.dossier.findMany({
        where,
        orderBy: { dateReception: 'asc' },
        take: LIMITE_LISTE,
        select: { numeroDossier: true, beneficiaire: true, typeDossier: true, statut: true, dateReception: true, montantReclame: true, montantPaye: true },
      });
      if (total === 0) return resultatVide(T('Factures à échéance dépassée'));
      return resultatListe(
        T('Factures non réglées depuis plus de 30 jours'),
        [...COLONNES_DOSSIER, { key: 'solde', label: 'Solde restant', type: 'montant' }],
        dossiers.map((d) => ({
          numero: d.numeroDossier,
          beneficiaire: d.beneficiaire,
          type: d.typeDossier,
          statut: statutLabel(d.statut),
          date: d.dateReception.toISOString(),
          montant: round2(d.montantReclame),
          solde: solde(d),
        })),
        total,
        `${fmtNb(total)} dossier(s) non réglé(s) reçu(s) depuis plus de 30 jours.`
      );
    },
  },
  {
    id: 'COMPTA_FACTURES_MOIS',
    role: 'COMPTABILITE',
    categorie: 'Factures',
    question: 'Combien de factures ont été enregistrées ce mois-ci ?',
    params: [],
    presentation: 'NOMBRE',
    async impl() {
      const debut = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const res = await db.dossier.aggregate({
        where: { dateReception: { gte: debut } },
        _count: true,
        _sum: { montantReclame: true },
      });
      return resultatNombre(T('Factures enregistrées ce mois-ci'), res._count,
        `${fmtNb(res._count)} dossier(s) reçu(s) ce mois-ci, pour ${fmtAr(round2(res._sum.montantReclame))} réclamés.`);
    },
  },
  {
    id: 'COMPTA_EVOLUTION_FACTURES',
    role: 'COMPTABILITE',
    categorie: 'Factures',
    question: "Quelle est l'évolution des factures par mois ?",
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'GRAPHIQUE',
    async impl(_ctx, params) {
      const periode = P(params);
      const serie = await serieMensuelle({ champDate: 'dateReception', champSomme: 'montantReclame', periode });
      const total = serie.reduce((s, p) => s + p.valeur, 0);
      if (total === 0) return resultatVide(T('Évolution des factures'), periode);
      return resultatGraphique(T('Évolution des factures par mois'), serie, 'Montant réclamé (Ar)',
        `Total de ${fmtAr(total)} réclamés — ${periode.label}.`, periode);
    },
  },
  {
    id: 'COMPTA_RESTANT_PAR_SOCIETE',
    role: 'COMPTABILITE',
    categorie: 'Factures',
    question: 'Quels sont les montants restant à payer par société ?',
    params: [],
    presentation: 'TABLEAU',
    async impl() {
      const rows = await db.dossier.groupBy({
        by: ['societeId'],
        where: { statut: { in: STATUTS_EN_COURS } },
        _count: true,
        _sum: { montantReclame: true, montantPaye: true },
      });
      const ids = rows.map((r) => r.societeId);
      const societes = ids.length
        ? await db.societe.findMany({ where: { id: { in: ids } }, select: { id: true, nom: true } })
        : [];
      const noms = new Map(societes.map((s) => [s.id, s.nom]));
      const lignes = rows
        .map((r) => ({
          societe: noms.get(r.societeId) ?? 'Inconnu',
          nb: r._count,
          restant: round2(enNombre(r._sum.montantReclame) - enNombre(r._sum.montantPaye)),
        }))
        .filter((l) => l.restant > 0)
        .sort((a, b) => b.restant - a.restant)
        .slice(0, LIMITE_LISTE);
      if (lignes.length === 0) return resultatVide(T('Restant à payer par société'));
      return resultatTableau(
        T('Montants restant à payer par société'),
        [
          { key: 'societe', label: 'Société', type: 'texte' },
          { key: 'nb', label: 'Dossiers en cours', type: 'nombre' },
          { key: 'restant', label: 'Restant à payer', type: 'montant' },
        ],
        lignes, lignes.length,
        `${lignes.length} société(s) avec un solde restant à payer.`);
    },
  },

  // ─── Règlements ────────────────────────────────────────────────────────────
  {
    id: 'COMPTA_TOTAL_REGLEMENTS',
    role: 'COMPTABILITE',
    categorie: 'Règlements',
    question: 'Quel est le montant total des règlements effectués sur une période donnée ?',
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'MONTANT',
    async impl(_ctx, params) {
      const periode = P(params);
      const res = await db.dossier.aggregate({
        where: { datePaiement: { gte: periode.du, lte: periode.au } },
        _sum: { montantPaye: true },
        _count: true,
      });
      return resultatMontant(T('Total des règlements'), round2(res._sum.montantPaye),
        `${fmtAr(round2(res._sum.montantPaye))} réglés sur ${fmtNb(res._count)} paiement(s) — ${periode.label}.`, periode);
    },
  },
  {
    id: 'COMPTA_REGLEMENTS_ATTENTE',
    role: 'COMPTABILITE',
    categorie: 'Règlements',
    question: 'Quels sont les règlements en attente ?',
    params: [],
    presentation: 'LISTE',
    note: 'Dossiers validés en attente de paiement (Validé, En comptabilité, En paiement).',
    async impl() {
      const statuts = ['VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT'];
      const where: Prisma.DossierWhereInput = { statut: { in: statuts } };
      const total = await db.dossier.count({ where });
      const dossiers = await db.dossier.findMany({
        where,
        orderBy: { dateTraitementTechnique: 'desc' },
        take: LIMITE_LISTE,
        select: { numeroDossier: true, beneficiaire: true, typeDossier: true, statut: true, dateReception: true, montantValide: true, montantReclame: true },
      });
      if (total === 0) return resultatVide(T('Règlements en attente'));
      return resultatListe(
        T('Règlements en attente de paiement'),
        COLONNES_DOSSIER,
        dossiers.map((d) => ({
          numero: d.numeroDossier,
          beneficiaire: d.beneficiaire,
          type: d.typeDossier,
          statut: statutLabel(d.statut),
          date: d.dateReception.toISOString(),
          montant: round2(d.montantValide ?? d.montantReclame),
        })),
        total,
        `${fmtNb(total)} règlement(s) en attente (dossiers validés non encore payés).`
      );
    },
  },
  {
    id: 'COMPTA_REGLEMENTS_MOIS',
    role: 'COMPTABILITE',
    categorie: 'Règlements',
    question: 'Combien de règlements ont été effectués ce mois-ci ?',
    params: [],
    presentation: 'NOMBRE',
    async impl() {
      const debut = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const res = await db.dossier.aggregate({
        where: { datePaiement: { gte: debut } },
        _count: true,
        _sum: { montantPaye: true },
      });
      return resultatNombre(T('Règlements effectués ce mois-ci'), res._count,
        `${fmtNb(res._count)} règlement(s) ce mois-ci, pour ${fmtAr(round2(res._sum.montantPaye))} versés.`);
    },
  },
  {
    id: 'COMPTA_EVOLUTION_REGLEMENTS',
    role: 'COMPTABILITE',
    categorie: 'Règlements',
    question: "Quelle est l'évolution des règlements par mois ?",
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'GRAPHIQUE',
    async impl(_ctx, params) {
      const periode = P(params);
      const serie = await serieMensuelle({ champDate: 'datePaiement', champSomme: 'montantPaye', periode });
      const total = serie.reduce((s, p) => s + p.valeur, 0);
      if (total === 0) return resultatVide(T('Évolution des règlements'), periode);
      return resultatGraphique(T('Évolution des règlements par mois'), serie, 'Montant payé (Ar)',
        `Total de ${fmtAr(total)} versés — ${periode.label}.`, periode);
    },
  },
  {
    id: 'COMPTA_REMBOURSEMENTS_ATTENTE',
    role: 'COMPTABILITE',
    categorie: 'Règlements',
    question: 'Quels remboursements sont en attente de règlement ?',
    params: [],
    presentation: 'MONTANT',
    async impl() {
      const res = await db.dossier.aggregate({
        where: { statut: { in: ['VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT'] } },
        _sum: { montantValide: true },
        _count: true,
      });
      return resultatMontant(T('Remboursements en attente de règlement'), round2(res._sum.montantValide),
        `${fmtAr(round2(res._sum.montantValide))} validés en attente de paiement sur ${fmtNb(res._count)} dossier(s).`);
    },
  },
  {
    id: 'COMPTA_TOTAL_REMBOURSEMENTS',
    role: 'COMPTABILITE',
    categorie: 'Règlements',
    question: 'Quel est le montant total des remboursements sur une période donnée ?',
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'MONTANT',
    async impl(_ctx, params) {
      const periode = P(params);
      const res = await db.dossier.aggregate({
        where: { statut: 'PAYE', datePaiement: { gte: periode.du, lte: periode.au } },
        _sum: { montantPaye: true },
        _count: true,
      });
      return resultatMontant(T('Total des remboursements'), round2(res._sum.montantPaye),
        `${fmtAr(round2(res._sum.montantPaye))} versés au titre de ${fmtNb(res._count)} remboursement(s) — ${periode.label}.`, periode);
    },
  },

  // ─── Prestataires ──────────────────────────────────────────────────────────
  {
    id: 'COMPTA_PRESTATAIRES_IMPAYES',
    role: 'COMPTABILITE',
    categorie: 'Prestataires',
    question: 'Quels prestataires ont des factures impayées ?',
    params: [],
    presentation: 'TABLEAU',
    async impl() {
      const rows = await db.dossier.groupBy({
        by: ['prestataireId'],
        where: { statut: { in: STATUTS_EN_COURS }, prestataireId: { not: null } },
        _count: true,
        _sum: { montantReclame: true, montantPaye: true },
      });
      const ids = rows.map((r) => r.prestataireId!).filter(Boolean);
      const prests = ids.length
        ? await db.prestataire.findMany({ where: { id: { in: ids } }, select: { id: true, nom: true } })
        : [];
      const noms = new Map(prests.map((p) => [p.id, p.nom]));
      const lignes = rows
        .map((r) => ({
          prestataire: noms.get(r.prestataireId!) ?? 'Inconnu',
          nb: r._count,
          restant: round2(enNombre(r._sum.montantReclame) - enNombre(r._sum.montantPaye)),
        }))
        .sort((a, b) => b.restant - a.restant)
        .slice(0, LIMITE_LISTE);
      if (lignes.length === 0) return resultatVide(T('Prestataires avec factures impayées'));
      return resultatTableau(
        T('Prestataires avec factures impayées'),
        [
          { key: 'prestataire', label: 'Prestataire', type: 'texte' },
          { key: 'nb', label: 'Dossiers en cours', type: 'nombre' },
          { key: 'restant', label: 'Restant à payer', type: 'montant' },
        ],
        lignes, lignes.length,
        `${lignes.length} prestataire(s) avec un solde restant à payer.`);
    },
  },
  {
    id: 'COMPTA_MONTANT_DU_PRESTATAIRE',
    role: 'COMPTABILITE',
    categorie: 'Prestataires',
    question: 'Quel est le montant dû à un prestataire donné ?',
    params: [{ key: 'PRESTATAIRE', label: 'Prestataire', required: true }],
    presentation: 'MONTANT',
    async impl(_ctx, params) {
      const prestataireId = params.PRESTATAIRE;
      if (!prestataireId) throw new AssistantError('Prestataire requis.');
      const prest = await db.prestataire.findUnique({ where: { id: prestataireId }, select: { nom: true } });
      if (!prest) return resultatVide(T('Montant dû au prestataire'));
      const res = await db.dossier.aggregate({
        where: { prestataireId, statut: { in: STATUTS_EN_COURS } },
        _sum: { montantReclame: true, montantPaye: true },
        _count: true,
      });
      const montant = round2(enNombre(res._sum.montantReclame) - enNombre(res._sum.montantPaye));
      return resultatMontant(T(`Montant dû à ${prest.nom}`), montant,
        `${fmtAr(montant)} dus à ${prest.nom} sur ${fmtNb(res._count)} dossier(s) en cours.`);
    },
  },
  {
    id: 'COMPTA_PAYE_PRESTATAIRE_PERIODE',
    role: 'COMPTABILITE',
    categorie: 'Prestataires',
    question: 'Quel est le montant payé à un prestataire sur une période donnée ?',
    params: [
      { key: 'PRESTATAIRE', label: 'Prestataire', required: true },
      { key: 'PERIODE', label: 'Période' },
    ],
    presentation: 'MONTANT',
    async impl(_ctx, params) {
      const prestataireId = params.PRESTATAIRE;
      if (!prestataireId) throw new AssistantError('Prestataire requis.');
      const periode = P(params);
      const prest = await db.prestataire.findUnique({ where: { id: prestataireId }, select: { nom: true } });
      if (!prest) return resultatVide(T('Montant payé au prestataire'), periode);
      const res = await db.dossier.aggregate({
        where: { prestataireId, datePaiement: { gte: periode.du, lte: periode.au } },
        _sum: { montantPaye: true },
        _count: true,
      });
      return resultatMontant(T(`Montant payé à ${prest.nom}`), round2(res._sum.montantPaye),
        `${fmtAr(round2(res._sum.montantPaye))} versés à ${prest.nom} sur ${fmtNb(res._count)} paiement(s) — ${periode.label}.`, periode);
    },
  },
  {
    id: 'COMPTA_PRESTATAIRES_PAYES',
    role: 'COMPTABILITE',
    categorie: 'Prestataires',
    question: 'Quels prestataires ont été payés sur une période donnée ?',
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'TABLEAU',
    async impl(_ctx, params) {
      const periode = P(params);
      const rows = await db.dossier.groupBy({
        by: ['prestataireId'],
        where: { datePaiement: { gte: periode.du, lte: periode.au }, prestataireId: { not: null }, montantPaye: { gt: 0 } },
        _count: true,
        _sum: { montantPaye: true },
      });
      const ids = rows.map((r) => r.prestataireId!).filter(Boolean);
      const prests = ids.length
        ? await db.prestataire.findMany({ where: { id: { in: ids } }, select: { id: true, nom: true } })
        : [];
      const noms = new Map(prests.map((p) => [p.id, p.nom]));
      const lignes = rows
        .map((r) => ({
          prestataire: noms.get(r.prestataireId!) ?? 'Inconnu',
          nb: r._count,
          paye: round2(r._sum.montantPaye),
        }))
        .sort((a, b) => b.paye - a.paye)
        .slice(0, LIMITE_LISTE);
      if (lignes.length === 0) return resultatVide(T('Prestataires payés'), periode);
      return resultatTableau(
        T('Prestataires payés sur la période'),
        [
          { key: 'prestataire', label: 'Prestataire', type: 'texte' },
          { key: 'nb', label: 'Paiements', type: 'nombre' },
          { key: 'paye', label: 'Montant payé', type: 'montant' },
        ],
        lignes, lignes.length,
        `${lignes.length} prestataire(s) payé(s) — ${periode.label}.`, periode);
    },
  },

  // ─── Sociétés & synthèse ───────────────────────────────────────────────────
  {
    id: 'COMPTA_SITUATION_SOCIETE',
    role: 'COMPTABILITE',
    categorie: 'Sociétés & synthèse',
    question: "Quelle est la situation financière d'une société cliente ?",
    params: [{ key: 'SOCIETE', label: 'Société', required: true }],
    presentation: 'KPI',
    async impl(_ctx, params) {
      const societeId = params.SOCIETE;
      if (!societeId) throw new AssistantError('Société requise.');
      const societe = await db.societe.findUnique({ where: { id: societeId }, select: { nom: true } });
      if (!societe) return resultatVide(T('Situation financière'));
      const [dossiers, appels] = await Promise.all([
        db.dossier.aggregate({
          where: { societeId },
          _sum: { montantReclame: true, montantPaye: true },
          _count: true,
        }),
        db.appelDeFonds.aggregate({
          where: { contrat: { societeId } },
          _sum: { montant: true },
          _count: true,
        }),
      ]);
      const paye = round2(dossiers._sum.montantPaye);
      const reclame = round2(dossiers._sum.montantReclame);
      const appelsTotal = round2(appels._sum.montant);
      return resultatKpi(
        T(`Situation financière de ${societe.nom}`),
        [
          { label: 'Dossiers au total', valeur: dossiers._count, type: 'nombre' },
          { label: 'Montant réclamé', valeur: reclame, type: 'montant' },
          { label: 'Montant remboursé', valeur: paye, type: 'montant' },
          { label: 'Appels de fonds émis', valeur: appelsTotal, type: 'montant' },
        ],
        `${societe.nom} : ${fmtNb(dossiers._count)} dossier(s), ${fmtAr(reclame)} réclamés, ${fmtAr(paye)} remboursés ; ${fmtAr(appelsTotal)} d'appels de fonds émis.`
      );
    },
  },
  {
    id: 'COMPTA_TOTAL_DEPENSES_MEDICALES',
    role: 'COMPTABILITE',
    categorie: 'Sociétés & synthèse',
    question: 'Quel est le total des dépenses liées aux prestations médicales ?',
    params: [],
    presentation: 'MONTANT',
    async impl() {
      const res = await db.dossier.aggregate({ _sum: { montantPaye: true, montantValide: true } });
      const paye = round2(res._sum.montantPaye);
      const valide = round2(res._sum.montantValide);
      return resultatMontant(T('Total des dépenses médicales'), paye,
        `${fmtAr(paye)} payés au total (montants validés cumulés : ${fmtAr(valide)}).`);
    },
  },
  {
    id: 'COMPTA_OPERATIONS_A_VERIFIER',
    role: 'COMPTABILITE',
    categorie: 'Sociétés & synthèse',
    question: 'Quelles opérations comptables nécessitent une vérification ?',
    params: [],
    presentation: 'KPI',
    note: 'Paiements enregistrés depuis plus de 15 jours sans date de paiement, et dossiers validés stagnants.',
    async impl() {
      const limite = new Date(Date.now() - 15 * 86_400_000);
      const [enPaiementAnciens, validesAnciens, appelsAttente] = await Promise.all([
        db.dossier.count({ where: { statut: 'EN_PAIEMENT', dateReceptionDecompte: { lt: limite } } }),
        db.dossier.count({ where: { statut: 'VALIDE', dateTraitementTechnique: { lt: limite } } }),
        db.appelDeFonds.count({ where: { statut: 'EN_ATTENTE', dateAppel: { lt: limite } } }),
      ]);
      const total = enPaiementAnciens + validesAnciens + appelsAttente;
      if (total === 0) return resultatVide(T('Opérations comptables à vérifier'));
      return resultatKpi(
        T('Opérations comptables nécessitant une vérification'),
        [
          { label: 'Dossiers « En paiement » depuis > 15 j', valeur: enPaiementAnciens, type: 'nombre' },
          { label: 'Dossiers « Validé » depuis > 15 j', valeur: validesAnciens, type: 'nombre' },
          { label: 'Appels de fonds en attente > 15 j', valeur: appelsAttente, type: 'nombre' },
        ],
        `${fmtNb(total)} opération(s) stagnante(s) détectée(s) (délai > 15 jours).`
      );
    },
  },
];
