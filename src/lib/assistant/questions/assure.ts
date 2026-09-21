import { db } from '@/lib/db';
import type { AssistantContext, ParamValeurs, QuestionDef } from '../types';
import { AssistantError } from '../types';
import { resolvePeriode } from '../periods';
import { extrairePeriode } from '../context';
import {
  resultatNombre, resultatMontant, resultatTableau, resultatListe,
  resultatVide, round2, fmtAr, fmtNb, statutLabel, COLONNES_DOSSIER, LIMITE_LISTE,
} from '../results';
import { scopeAssure, dossierAutorise } from './scope';

// ─── Catalogue CLIENT / ASSURÉ (PORTAIL_CLIENT) — 20 questions ───────────────
// Les questions sont STRICTEMENT limitées aux données de l'assuré connecté
// et de ses ayants droit. Aucun paramètre SOCIETE / ASSURE n'existe ici :
// le périmètre est dérivé du compte (token) côté serveur.

const T = (question: string) => ({ question });
const P = (params: ParamValeurs) => resolvePeriode(extrairePeriode(params));

/** Where Dossier restreint à la famille de l'assuré connecté */
async function whereFamille(ctx: AssistantContext, extra: Record<string, unknown> = {}) {
  const { ids } = await scopeAssure(ctx);
  return { assureId: { in: ids }, ...extra };
}

export const questionsAssure: QuestionDef[] = [
  // ─── Contrat & garanties ───────────────────────────────────────────────────
  {
    id: 'ASSURE_CONTRAT_STATUT',
    role: 'PORTAIL_CLIENT',
    categorie: 'Mon contrat',
    question: 'Quel est le statut de mon contrat ?',
    params: [],
    presentation: 'NOMBRE',
    note: 'Contrat actif de la société à laquelle vous êtes rattaché.',
    async impl(ctx) {
      const { societeId } = await scopeAssure(ctx);
      if (!societeId) return resultatVide(T('Statut de mon contrat'));
      const total = await db.contrat.count({ where: { societeId, statut: 'ACTIF' } });
      return resultatNombre(T('Statut de mon contrat'), total,
        total > 0
          ? `Votre contrat est ACTIF (contrat en cours de votre société).`
          : `Aucun contrat actif trouvé pour votre société — contactez votre service RH.`);
    },
  },
  {
    id: 'ASSURE_CONTRAT_VALIDITE',
    role: 'PORTAIL_CLIENT',
    categorie: 'Mon contrat',
    question: "Jusqu'à quand mon contrat est-il valable ?",
    params: [],
    presentation: 'LISTE',
    async impl(ctx) {
      const { societeId } = await scopeAssure(ctx);
      if (!societeId) return resultatVide(T('Validité de mon contrat'));
      const contrats = await db.contrat.findMany({
        where: { societeId, statut: 'ACTIF' },
        orderBy: { dateFin: 'desc' },
        take: 3,
        select: { reference: true, dateDebut: true, dateFin: true },
      });
      if (contrats.length === 0) return resultatVide(T('Validité de mon contrat'));
      return resultatListe(
        T('Validité de votre contrat'),
        [
          { key: 'ref', label: 'Référence', type: 'texte' },
          { key: 'debut', label: 'Début', type: 'date' },
          { key: 'fin', label: 'Fin', type: 'date' },
        ],
        contrats.map((c) => ({ ref: c.reference, debut: c.dateDebut.toISOString(), fin: c.dateFin.toISOString() })),
        contrats.length,
        `Votre contrat est valable jusqu'au ${contrats[0].dateFin.toLocaleDateString('fr-FR')}.`
      );
    },
  },
  {
    id: 'ASSURE_GARANTIES',
    role: 'PORTAIL_CLIENT',
    categorie: 'Mon contrat',
    question: 'Quelles sont mes garanties ?',
    params: [],
    presentation: 'LISTE',
    note: 'Garanties = barèmes actifs de votre société (taux de couverture et plafonds).',
    async impl(ctx) {
      const { societeId } = await scopeAssure(ctx);
      if (!societeId) return resultatVide(T('Mes garanties'));
      const baremes = await db.bareme.findMany({
        where: { societeId, active: true },
        orderBy: { prestation: 'asc' },
        take: LIMITE_LISTE,
      });
      if (baremes.length === 0) return resultatVide(T('Mes garanties'));
      return resultatListe(
        T('Vos garanties (barèmes actifs de votre société)'),
        [
          { key: 'acte', label: 'Prestation', type: 'texte' },
          { key: 'taux', label: 'Taux de couverture', type: 'nombre' },
          { key: 'plafond', label: 'Plafond', type: 'montant' },
        ],
        baremes.map((b) => ({
          acte: b.prestation,
          taux: Math.round(b.tauxCouverture * 100),
          plafond: Math.round(b.plafond),
        })),
        baremes.length,
        `${baremes.length} garantie(s) active(s) pour votre société.`
      );
    },
  },
  {
    id: 'ASSURE_ACTES_COUVERTS',
    role: 'PORTAIL_CLIENT',
    categorie: 'Mon contrat',
    question: 'Quels sont les actes médicaux couverts par mon contrat ?',
    params: [],
    presentation: 'LISTE',
    async impl(ctx) {
      const { societeId } = await scopeAssure(ctx);
      if (!societeId) return resultatVide(T('Actes couverts'));
      const baremes = await db.bareme.findMany({
        where: { societeId, active: true },
        select: { prestation: true, description: true },
        orderBy: { prestation: 'asc' },
        take: LIMITE_LISTE,
      });
      if (baremes.length === 0) return resultatVide(T('Actes couverts'));
      return resultatListe(
        T('Actes médicaux couverts par votre contrat'),
        [
          { key: 'acte', label: 'Acte', type: 'texte' },
          { key: 'description', label: 'Conditions', type: 'texte' },
        ],
        baremes.map((b) => ({ acte: b.prestation, description: b.description ?? '—' })),
        baremes.length,
        `${baremes.length} acte(s) couvert(s) via les barèmes actifs de votre société.`
      );
    },
  },

  // ─── Mes dossiers ──────────────────────────────────────────────────────────
  {
    id: 'ASSURE_DOSSIERS_EN_COURS',
    role: 'PORTAIL_CLIENT',
    categorie: 'Mes dossiers',
    question: 'Quels sont mes dossiers en cours ?',
    params: [],
    presentation: 'LISTE',
    async impl(ctx) {
      const where = await whereFamille(ctx, { statut: { notIn: ['PAYE', 'REJETE'] } });
      const total = await db.dossier.count({ where });
      const dossiers = await db.dossier.findMany({
        where,
        orderBy: { dateReception: 'desc' },
        take: LIMITE_LISTE,
        select: {
          numeroDossier: true, beneficiaire: true, typeDossier: true, statut: true,
          dateReception: true, montantReclame: true,
        },
      });
      if (total === 0) return resultatVide(T('Mes dossiers en cours'));
      return resultatListe(T('Vos dossiers en cours'), COLONNES_DOSSIER,
        dossiers.map((d) => ({
          numero: d.numeroDossier,
          beneficiaire: d.beneficiaire,
          type: d.typeDossier,
          statut: statutLabel(d.statut),
          date: d.dateReception.toISOString(),
          montant: round2(d.montantReclame),
        })),
        total,
        `${fmtNb(total)} dossier(s) en cours pour vous et vos ayants droit.`);
    },
  },
  {
    id: 'ASSURE_DOSSIERS_OUVERTS_PERIODE',
    role: 'PORTAIL_CLIENT',
    categorie: 'Mes dossiers',
    question: 'Combien de dossiers ai-je ouverts sur une période donnée ?',
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'NOMBRE',
    async impl(ctx, params) {
      const periode = P(params);
      const where = await whereFamille(ctx, { dateReception: { gte: periode.du, lte: periode.au } });
      const total = await db.dossier.count({ where });
      return resultatNombre(T('Dossiers ouverts sur la période'), total,
        `${fmtNb(total)} dossier(s) ouvert(s) — ${periode.label}.`, periode);
    },
  },
  {
    id: 'ASSURE_DOSSIERS_MAJ_RECENTS',
    role: 'PORTAIL_CLIENT',
    categorie: 'Mes dossiers',
    question: 'Quels sont mes dossiers récemment mis à jour ?',
    params: [],
    presentation: 'LISTE',
    async impl(ctx) {
      const where = await whereFamille(ctx);
      const total = await db.dossier.count({ where });
      const dossiers = await db.dossier.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: LIMITE_LISTE,
        select: {
          numeroDossier: true, beneficiaire: true, typeDossier: true, statut: true,
          dateReception: true, montantReclame: true,
        },
      });
      if (total === 0) return resultatVide(T('Mes dossiers récemment mis à jour'));
      return resultatListe(T('Vos dossiers récemment mis à jour'), COLONNES_DOSSIER,
        dossiers.map((d) => ({
          numero: d.numeroDossier,
          beneficiaire: d.beneficiaire,
          type: d.typeDossier,
          statut: statutLabel(d.statut),
          date: d.dateReception.toISOString(),
          montant: round2(d.montantReclame),
        })),
        total,
        `Vos ${dossiers.length} dossier(s) mis à jour le plus récemment.`);
    },
  },
  {
    id: 'ASSURE_DOSSIERS_PIECES_ATTENTE',
    role: 'PORTAIL_CLIENT',
    categorie: 'Mes dossiers',
    question: 'Quels dossiers sont en attente de pièces ?',
    params: [],
    presentation: 'LISTE',
    async impl(ctx) {
      const where = await whereFamille(ctx, { statut: { in: ['RECU', 'EN_ANALYSE'] } });
      const dossiers = await db.dossier.findMany({
        where,
        orderBy: { dateReception: 'asc' },
        take: 50,
        select: { id: true, numeroDossier: true, beneficiaire: true, typeDossier: true, statut: true, dateReception: true, montantReclame: true },
      });
      const ids = dossiers.map((d) => d.id);
      const avecJustif = ids.length
        ? new Set(
            (await db.justificatif.findMany({ where: { dossierId: { in: ids } }, select: { dossierId: true } })).map((j) => j.dossierId)
          )
        : new Set<string>();
      const sansPieces = dossiers.filter((d) => !avecJustif.has(d.id));
      if (sansPieces.length === 0) return resultatVide(T('Dossiers en attente de pièces'));
      return resultatListe(
        T('Vos dossiers en attente de pièces complémentaires'),
        COLONNES_DOSSIER,
        sansPieces.map((d) => ({
          numero: d.numeroDossier,
          beneficiaire: d.beneficiaire,
          type: d.typeDossier,
          statut: statutLabel(d.statut),
          date: d.dateReception.toISOString(),
          montant: round2(d.montantReclame),
        })),
        sansPieces.length,
        `${sansPieces.length} dossier(s) sans justificatif joint — pièces à fournir.`
      );
    },
  },
  {
    id: 'ASSURE_MONTANT_DOSSIER',
    role: 'PORTAIL_CLIENT',
    categorie: 'Mes dossiers',
    question: 'Quel est le montant de mon dossier ?',
    params: [{ key: 'DOSSIER', label: 'Numéro de dossier', required: true }],
    presentation: 'MONTANT',
    async impl(ctx, params) {
      const numero = params.DOSSIER?.trim().toUpperCase();
      if (!numero) throw new AssistantError('Numéro de dossier requis.');
      const where = await whereFamille(ctx);
      const id = await dossierAutorise(numero, where);
      if (!id) return resultatVide(T(`Montant du dossier ${numero}`));
      const d = await db.dossier.findUnique({
        where: { id },
        select: { montantReclame: true, montantValide: true, montantPaye: true, ticketModerateur: true, partPatient: true },
      });
      if (!d) return resultatVide(T(`Montant du dossier ${numero}`));
      return resultatMontant(T(`Montant du dossier ${numero}`), round2(d.montantReclame),
        `Dossier à ${fmtAr(round2(d.montantReclame))} réclamés (validé : ${fmtAr(round2(d.montantValide))}, payé : ${fmtAr(round2(d.montantPaye))}, reste à votre charge : ${fmtAr(round2(d.ticketModerateur ?? d.partPatient ?? 0))}).`);
    },
  },
  {
    id: 'ASSURE_STATUT_DOSSIER',
    role: 'PORTAIL_CLIENT',
    categorie: 'Mes dossiers',
    question: 'Quel est le statut de mon dossier ?',
    params: [{ key: 'DOSSIER', label: 'Numéro de dossier', required: true }],
    presentation: 'TABLEAU',
    async impl(ctx, params) {
      const numero = params.DOSSIER?.trim().toUpperCase();
      if (!numero) throw new AssistantError('Numéro de dossier requis.');
      const where = await whereFamille(ctx);
      const id = await dossierAutorise(numero, where);
      if (!id) {
        return resultatVide(T(`Dossier ${numero}`));
      }
      const d = await db.dossier.findUnique({
        where: { id },
        select: {
          numeroDossier: true, beneficiaire: true, typeDossier: true, statut: true,
          dateReception: true, montantReclame: true, montantValide: true, montantPaye: true,
          datePaiement: true, motifRejet: true,
        },
      });
      if (!d) return resultatVide(T(`Dossier ${numero}`));
      return resultatTableau(
        T(`Statut du dossier ${numero}`),
        [
          { key: 'champ', label: 'Information', type: 'texte' },
          { key: 'valeur', label: 'Valeur', type: 'texte' },
        ],
        [
          { champ: 'Numéro', valeur: d.numeroDossier },
          { champ: 'Bénéficiaire', valeur: d.beneficiaire },
          { champ: 'Acte', valeur: d.typeDossier },
          { champ: 'Statut', valeur: statutLabel(d.statut) },
          { champ: 'Date de réception', valeur: d.dateReception.toISOString() },
          { champ: 'Montant réclamé', valeur: Math.round(d.montantReclame * 100) / 100 },
          { champ: 'Montant validé', valeur: d.montantValide !== null ? Math.round(d.montantValide * 100) / 100 : '—' },
          { champ: 'Motif de rejet', valeur: d.motifRejet ?? '—' },
        ],
        8,
        `Dossier ${d.numeroDossier} : ${statutLabel(d.statut)}.`
      );
    },
  },

  // ─── Mes remboursements ────────────────────────────────────────────────────
  {
    id: 'ASSURE_REMBOURSEMENT_EN_COURS',
    role: 'PORTAIL_CLIENT',
    categorie: 'Mes remboursements',
    question: 'Quel est le statut de mon remboursement ?',
    params: [{ key: 'DOSSIER', label: 'Numéro de dossier', required: true }],
    presentation: 'TABLEAU',
    async impl(ctx, params) {
      const numero = params.DOSSIER?.trim().toUpperCase();
      if (!numero) throw new AssistantError('Numéro de dossier requis.');
      const where = await whereFamille(ctx);
      const id = await dossierAutorise(numero, where);
      if (!id) return resultatVide(T(`Remboursement du dossier ${numero}`));
      const d = await db.dossier.findUnique({
        where: { id },
        select: { numeroDossier: true, statut: true, montantValide: true, montantPaye: true, datePaiement: true, referencePaiement: true },
      });
      if (!d) return resultatVide(T(`Remboursement du dossier ${numero}`));
      return resultatTableau(
        T(`Remboursement du dossier ${numero}`),
        [
          { key: 'champ', label: 'Information', type: 'texte' },
          { key: 'valeur', label: 'Valeur', type: 'texte' },
        ],
        [
          { champ: 'Statut', valeur: statutLabel(d.statut) },
          { champ: 'Montant validé', valeur: d.montantValide !== null ? Math.round(d.montantValide * 100) / 100 : '—' },
          { champ: 'Montant payé', valeur: d.montantPaye !== null ? Math.round(d.montantPaye * 100) / 100 : '—' },
          { champ: 'Date de paiement', valeur: d.datePaiement ? d.datePaiement.toISOString() : '—' },
          { champ: 'Référence de paiement', valeur: d.referencePaiement ?? '—' },
        ],
        5,
        `Remboursement du dossier ${d.numeroDossier} : ${statutLabel(d.statut)}.`
      );
    },
  },
  {
    id: 'ASSURE_MONTANT_REMBOURSEMENT',
    role: 'PORTAIL_CLIENT',
    categorie: 'Mes remboursements',
    question: 'Quel est le montant de mon remboursement ?',
    params: [{ key: 'DOSSIER', label: 'Numéro de dossier', required: true }],
    presentation: 'MONTANT',
    async impl(ctx, params) {
      const numero = params.DOSSIER?.trim().toUpperCase();
      if (!numero) throw new AssistantError('Numéro de dossier requis.');
      const where = await whereFamille(ctx);
      const id = await dossierAutorise(numero, where);
      if (!id) return resultatVide(T(`Montant du remboursement ${numero}`));
      const d = await db.dossier.findUnique({
        where: { id },
        select: { montantPaye: true, montantValide: true, statut: true },
      });
      if (!d) return resultatVide(T(`Montant du remboursement ${numero}`));
      const montant = d.montantPaye ?? d.montantValide ?? 0;
      return resultatMontant(T(`Montant du remboursement du dossier ${numero}`), round2(montant),
        d.montantPaye !== null
          ? `${fmtAr(round2(d.montantPaye))} payé(s) pour ce dossier.`
          : `Remboursement non encore payé (montant validé : ${fmtAr(round2(d.montantValide ?? 0))}).`);
    },
  },
  {
    id: 'ASSURE_DATE_REMBOURSEMENT',
    role: 'PORTAIL_CLIENT',
    categorie: 'Mes remboursements',
    question: 'Quand mon remboursement a-t-il été effectué ?',
    params: [{ key: 'DOSSIER', label: 'Numéro de dossier', required: true }],
    presentation: 'LISTE',
    async impl(ctx, params) {
      const numero = params.DOSSIER?.trim().toUpperCase();
      if (!numero) throw new AssistantError('Numéro de dossier requis.');
      const where = await whereFamille(ctx);
      const id = await dossierAutorise(numero, where);
      if (!id) return resultatVide(T(`Date de remboursement ${numero}`));
      const d = await db.dossier.findUnique({
        where: { id },
        select: { numeroDossier: true, datePaiement: true, referencePaiement: true, statut: true },
      });
      if (!d) return resultatVide(T(`Date de remboursement ${numero}`));
      return resultatListe(
        T(`Date de remboursement du dossier ${numero}`),
        [
          { key: 'champ', label: 'Information', type: 'texte' },
          { key: 'valeur', label: 'Valeur', type: 'texte' },
        ],
        [
          { champ: 'Date de paiement', valeur: d.datePaiement ? d.datePaiement.toISOString() : 'Non encore payé' },
          { champ: 'Référence de paiement', valeur: d.referencePaiement ?? '—' },
          { champ: 'Statut', valeur: statutLabel(d.statut) },
        ],
        3,
        d.datePaiement
          ? `Remboursement effectué le ${d.datePaiement.toLocaleDateString('fr-FR')}.`
          : `Remboursement pas encore effectué (statut : ${statutLabel(d.statut)}).`
      );
    },
  },
  {
    id: 'ASSURE_REMBOURSEMENTS_REUS',
    role: 'PORTAIL_CLIENT',
    categorie: 'Mes remboursements',
    question: 'Quels remboursements ai-je reçus ?',
    params: [],
    presentation: 'LISTE',
    async impl(ctx) {
      const where = await whereFamille(ctx, { statut: 'PAYE' });
      const total = await db.dossier.count({ where });
      const dossiers = await db.dossier.findMany({
        where,
        orderBy: { datePaiement: 'desc' },
        take: LIMITE_LISTE,
        select: {
          numeroDossier: true, beneficiaire: true, typeDossier: true, statut: true,
          datePaiement: true, montantPaye: true,
        },
      });
      if (total === 0) return resultatVide(T('Mes remboursements reçus'));
      return resultatListe(
        T('Vos remboursements reçus'),
        [
          { key: 'numero', label: 'N° dossier', type: 'texte' },
          { key: 'beneficiaire', label: 'Bénéficiaire', type: 'texte' },
          { key: 'type', label: 'Acte', type: 'texte' },
          { key: 'date', label: 'Date de paiement', type: 'date' },
          { key: 'montant', label: 'Montant payé', type: 'montant' },
        ],
        dossiers.map((d) => ({
          numero: d.numeroDossier,
          beneficiaire: d.beneficiaire,
          type: d.typeDossier,
          date: d.datePaiement ? d.datePaiement.toISOString() : null,
          montant: round2(d.montantPaye ?? 0),
        })),
        total,
        `${fmtNb(total)} remboursement(s) reçu(s) (les plus récents d'abord).`
      );
    },
  },
  {
    id: 'ASSURE_HISTORIQUE_REMBOURSEMENTS',
    role: 'PORTAIL_CLIENT',
    categorie: 'Mes remboursements',
    question: "Quel est l'historique de mes remboursements ?",
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'GRAPHIQUE',
    async impl(ctx, params) {
      const periode = P(params);
      const where = await whereFamille(ctx, { statut: 'PAYE', datePaiement: { gte: periode.du, lte: periode.au } });
      const dossiers = await db.dossier.findMany({
        where,
        select: { datePaiement: true, montantPaye: true },
        take: 500,
      });
      if (dossiers.length === 0) return resultatVide(T('Historique de mes remboursements'), periode);
      const parMois = new Map<string, number>();
      for (const d of dossiers) {
        if (!d.datePaiement) continue;
        const mois = d.datePaiement.toISOString().slice(0, 7);
        parMois.set(mois, (parMois.get(mois) ?? 0) + (d.montantPaye ?? 0));
      }
      const serie = [...parMois.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, valeur]) => ({ label, valeur: Math.round(valeur * 100) / 100 }));
      const total = serie.reduce((s, p) => s + p.valeur, 0);
      return resultatGraphique(T('Historique de vos remboursements'), serie, 'Montant payé (Ar)',
        `${fmtAr(total)} remboursés sur ${dossiers.length} dossier(s) — ${periode.label}.`, periode);
    },
  },

  // ─── Mes prestations ───────────────────────────────────────────────────────
  {
    id: 'ASSURE_PRESTATIONS_UTILISEES',
    role: 'PORTAIL_CLIENT',
    categorie: 'Mes prestations',
    question: 'Quelles prestations ai-je utilisées ?',
    params: [],
    presentation: 'TABLEAU',
    async impl(ctx) {
      const where = await whereFamille(ctx);
      const rows = await db.dossier.groupBy({
        by: ['typeDossier'],
        where,
        _count: { typeDossier: true },
        _sum: { montantReclame: true },
      });
      if (rows.length === 0) return resultatVide(T('Mes prestations utilisées'));
      rows.sort((a, b) => b._count.typeDossier - a._count.typeDossier);
      return resultatTableau(
        T('Prestations que vous avez utilisées'),
        [
          { key: 'acte', label: 'Acte', type: 'texte' },
          { key: 'nb', label: 'Nombre', type: 'nombre' },
          { key: 'montant', label: 'Montant réclamé', type: 'montant' },
        ],
        rows.map((r) => ({ acte: r.typeDossier, nb: r._count.typeDossier, montant: round2(r._sum.montantReclame) })),
        rows.length,
        `${rows.length} type(s) de prestation(s) utilisé(s) par votre famille.`
      );
    },
  },
  {
    id: 'ASSURE_TOTAL_PRESTATIONS_PERIODE',
    role: 'PORTAIL_CLIENT',
    categorie: 'Mes prestations',
    question: 'Quel est le montant total de mes prestations sur une période donnée ?',
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'MONTANT',
    async impl(ctx, params) {
      const periode = P(params);
      const where = await whereFamille(ctx, { dateSoins: { gte: periode.du, lte: periode.au } });
      const res = await db.dossier.aggregate({ where, _sum: { montantReclame: true }, _count: true });
      return resultatMontant(T('Total de mes prestations'), round2(res._sum.montantReclame),
        `${fmtAr(round2(res._sum.montantReclame))} de prestations sur ${fmtNb(res._count)} dossier(s) — ${periode.label}.`, periode);
    },
  },
  {
    id: 'ASSURE_PRESTATAIRES_CONSULTES',
    role: 'PORTAIL_CLIENT',
    categorie: 'Mes prestations',
    question: 'Quels prestataires ai-je consultés ?',
    params: [],
    presentation: 'LISTE',
    async impl(ctx) {
      const where = await whereFamille(ctx, { prestataireId: { not: null } });
      const rows = await db.dossier.groupBy({
        by: ['prestataireId'],
        where,
        _count: true,
      });
      const ids = rows.map((r) => r.prestataireId!).filter(Boolean);
      if (ids.length === 0) return resultatVide(T('Prestataires consultés'));
      const prests = await db.prestataire.findMany({
        where: { id: { in: ids } },
        select: { id: true, nom: true, type: true, adresse: true },
      });
      const counts = new Map(rows.map((r) => [r.prestataireId!, r._count]));
      const lignes = prests
        .map((p) => ({ nom: p.nom, type: p.type, nb: counts.get(p.id) ?? 0 }))
        .sort((a, b) => b.nb - a.nb)
        .slice(0, LIMITE_LISTE);
      return resultatListe(
        T('Prestataires consultés par votre famille'),
        [
          { key: 'nom', label: 'Prestataire', type: 'texte' },
          { key: 'type', label: 'Type', type: 'texte' },
          { key: 'nb', label: 'Dossiers', type: 'nombre' },
        ],
        lignes, lignes.length,
        `${lignes.length} prestataire(s) consulté(s).`
      );
    },
  },

  // ─── Mon profil ────────────────────────────────────────────────────────────
  {
    id: 'ASSURE_MON_PROFIL',
    role: 'PORTAIL_CLIENT',
    categorie: 'Mon profil',
    question: 'Quelles informations personnelles sont enregistrées dans mon profil ?',
    params: [],
    presentation: 'TABLEAU',
    async impl(ctx) {
      const { ids, societeId } = await scopeAssure(ctx);
      const assure = await db.assure.findUnique({
        where: { id: ctx.assureId ?? '' },
        select: {
          nom: true, prenom: true, nSS: true, matricule: true, typeBeneficiaire: true,
          dateNaissance: true, dateEffet: true, telephone: true, email: true,
          societe: { select: { nom: true } },
        },
      });
      if (!assure) return resultatVide(T('Mon profil'));
      const nbAyantsDroit = ids.length - 1;
      return resultatTableau(
        T('Informations de votre profil'),
        [
          { key: 'champ', label: 'Information', type: 'texte' },
          { key: 'valeur', label: 'Valeur', type: 'texte' },
        ],
        [
          { champ: 'Nom', valeur: [assure.nom, assure.prenom].filter(Boolean).join(' ') },
          { champ: 'Société', valeur: assure.societe?.nom ?? '—' },
          { champ: 'Type de bénéficiaire', valeur: assure.typeBeneficiaire },
          { champ: 'Matricule', valeur: assure.matricule ?? '—' },
          { champ: 'Date d\u2019effet de couverture', valeur: assure.dateEffet ? assure.dateEffet.toISOString() : '—' },
          { champ: 'Ayants droit rattachés', valeur: nbAyantsDroit },
          { champ: 'Société rattachée (ID interne)', valeur: societeId ? 'Vérifié' : '—' },
        ],
        7,
        'Informations personnelles enregistrées dans votre profil assuré.'
      );
    },
  },
  {
    id: 'ASSURE_DERNIERES_OPERATIONS',
    role: 'PORTAIL_CLIENT',
    categorie: 'Mon profil',
    question: 'Quelles sont les dernières opérations concernant mon dossier ?',
    params: [{ key: 'DOSSIER', label: 'Numéro de dossier', required: true }],
    presentation: 'LISTE',
    async impl(ctx, params) {
      const numero = params.DOSSIER?.trim().toUpperCase();
      if (!numero) throw new AssistantError('Numéro de dossier requis.');
      const where = await whereFamille(ctx);
      const id = await dossierAutorise(numero, where);
      if (!id) return resultatVide(T(`Opérations du dossier ${numero}`));
      const commentaires = await db.commentaire.findMany({
        where: { dossierId: id, prive: false },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { contenu: true, createdAt: true, auteur: { select: { nom: true } } },
      });
      if (commentaires.length === 0) return resultatVide(T(`Opérations du dossier ${numero}`));
      return resultatListe(
        T(`Dernières opérations concernant le dossier ${numero}`),
        [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'par', label: 'Par', type: 'texte' },
          { key: 'contenu', label: 'Opération', type: 'texte' },
        ],
        commentaires.map((c) => ({
          date: c.createdAt.toISOString(),
          par: c.auteur?.nom ?? 'Suivi Santé',
          contenu: c.contenu,
        })),
        commentaires.length,
        `${commentaires.length} opération(s) publique(s) enregistrée(s) sur ce dossier.`
      );
    },
  },
];
