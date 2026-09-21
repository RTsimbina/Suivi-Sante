import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import type { AssistantContext, ParamValeurs, QuestionDef } from '../types';
import { AssistantError } from '../types';
import { resolvePeriode } from '../periods';
import { extrairePeriode } from '../context';
import {
  resultatNombre, resultatMontant, resultatTableau, resultatListe,
  resultatGraphique, resultatKpi, resultatVide,
  round2, enNombre, fmtAr, fmtNb, statutLabel, STATUTS_EN_COURS, serieMensuelle,
  COLONNES_DOSSIER, LIMITE_LISTE,
} from '../results';
import { scopePrestataire, societeAutoriseePrestataire, dossierAutorise } from './scope';

// ─── Catalogue PRESTATAIRE (PRESTATAIRE) — 20 questions ──────────────
// Les questions sont limitées aux données du prestataire connecté. Le
// prestataireId provient EXCLUSIVEMENT du token (dérivé serveur à la
// connexion). Un prestataire A ne peut jamais voir les données d'un B.

const T = (question: string) => ({ question });
const P = (params: ParamValeurs) => resolvePeriode(extrairePeriode(params));

async function wherePrestataire(ctx: AssistantContext, extra: Record<string, unknown> = {}) {
  return { prestataireId: scopePrestataire(ctx), ...extra };
}

export const questionsPrestataire: QuestionDef[] = [
  // ─── Mes factures ──────────────────────────────────────────────────────────
  {
    id: 'PRESTATAIRE_TOTAL_FACTURES',
    role: 'PRESTATAIRE',
    categorie: 'Mes factures',
    question: 'Quel est le montant total de mes factures ?',
    params: [],
    presentation: 'MONTANT',
    note: 'Vos factures = dossiers de soins rattachés à votre établissement (montants réclamés).',
    async impl(ctx) {
      const res = await db.dossier.aggregate({
        where: await wherePrestataire(ctx),
        _sum: { montantReclame: true },
        _count: true,
      });
      return resultatMontant(T('Total de vos factures'), round2(res._sum.montantReclame),
        `${fmtAr(round2(res._sum.montantReclame))} réclamés sur ${fmtNb(res._count)} dossier(s) de soins.`);
    },
  },
  {
    id: 'PRESTATAIRE_FACTURES_IMPAYEES',
    role: 'PRESTATAIRE',
    categorie: 'Mes factures',
    question: 'Quel est le montant total de mes factures impayées ?',
    params: [],
    presentation: 'MONTANT',
    async impl(ctx) {
      const res = await db.dossier.aggregate({
        where: await wherePrestataire(ctx, { statut: { in: STATUTS_EN_COURS } }),
        _sum: { montantReclame: true, montantPaye: true },
        _count: true,
      });
      const solde = round2(enNombre(res._sum.montantReclame) - enNombre(res._sum.montantPaye));
      return resultatMontant(T('Vos factures impayées'), solde,
        `${fmtAr(solde)} restant à percevoir sur ${fmtNb(res._count)} dossier(s) en cours.`);
    },
  },
  {
    id: 'PRESTATAIRE_FACTURES_REGLEES',
    role: 'PRESTATAIRE',
    categorie: 'Mes factures',
    question: 'Quel est le montant total de mes factures réglées ?',
    params: [],
    presentation: 'MONTANT',
    async impl(ctx) {
      const res = await db.dossier.aggregate({
        where: await wherePrestataire(ctx, { statut: 'PAYE' }),
        _sum: { montantPaye: true },
        _count: true,
      });
      return resultatMontant(T('Vos factures réglées'), round2(res._sum.montantPaye),
        `${fmtAr(round2(res._sum.montantPaye))} déjà réglés sur ${fmtNb(res._count)} dossier(s) payé(s).`);
    },
  },
  {
    id: 'PRESTATAIRE_FACTURES_ATTENTE_PAIEMENT',
    role: 'PRESTATAIRE',
    categorie: 'Mes factures',
    question: 'Quelles sont mes factures actuellement en attente de paiement ?',
    params: [],
    presentation: 'LISTE',
    async impl(ctx) {
      const where = await wherePrestataire(ctx, { statut: { in: ['VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT'] } });
      const total = await db.dossier.count({ where });
      const dossiers = await db.dossier.findMany({
        where,
        orderBy: { dateReception: 'desc' },
        take: LIMITE_LISTE,
        select: {
          numeroDossier: true, beneficiaire: true, typeDossier: true, statut: true,
          dateReception: true, montantReclame: true, montantValide: true,
        },
      });
      if (total === 0) return resultatVide(T('Vos factures en attente de paiement'));
      return resultatListe(
        T('Vos factures en attente de paiement'),
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
        `${fmtNb(total)} facture(s) validée(s) en attente de règlement.`
      );
    },
  },
  {
    id: 'PRESTATAIRE_FACTURES_REGLEES_LISTE',
    role: 'PRESTATAIRE',
    categorie: 'Mes factures',
    question: 'Quelles factures ont été réglées ?',
    params: [],
    presentation: 'LISTE',
    async impl(ctx) {
      const where = await wherePrestataire(ctx, { statut: 'PAYE' });
      const total = await db.dossier.count({ where });
      const dossiers = await db.dossier.findMany({
        where,
        orderBy: { datePaiement: 'desc' },
        take: LIMITE_LISTE,
        select: {
          numeroDossier: true, beneficiaire: true, typeDossier: true, statut: true,
          dateReception: true, montantPaye: true, datePaiement: true,
        },
      });
      if (total === 0) return resultatVide(T('Vos factures réglées'));
      return resultatListe(
        T('Vos factures réglées'),
        [
          ...COLONNES_DOSSIER.slice(0, 5),
          { key: 'datePaiement', label: 'Date de règlement', type: 'date' },
        ],
        dossiers.map((d) => ({
          numero: d.numeroDossier,
          beneficiaire: d.beneficiaire,
          type: d.typeDossier,
          statut: statutLabel(d.statut),
          date: d.dateReception.toISOString(),
          montant: round2(d.montantPaye ?? 0),
          datePaiement: d.datePaiement ? d.datePaiement.toISOString() : null,
        })),
        total,
        `${fmtNb(total)} facture(s) réglée(s), la plus récente d'abord.`
      );
    },
  },
  {
    id: 'PRESTATAIRE_STATUT_FACTURE',
    role: 'PRESTATAIRE',
    categorie: 'Mes factures',
    question: "Quel est le statut d'une facture donnée ?",
    params: [{ key: 'DOSSIER', label: 'Numéro de dossier', required: true }],
    presentation: 'TABLEAU',
    async impl(ctx, params) {
      const numero = params.DOSSIER?.trim().toUpperCase();
      if (!numero) throw new AssistantError('Numéro de dossier requis.');
      const id = await dossierAutorise(numero, await wherePrestataire(ctx));
      if (!id) return resultatVide(T(`Facture ${numero}`));
      const d = await db.dossier.findUnique({
        where: { id },
        select: {
          numeroDossier: true, beneficiaire: true, typeDossier: true, statut: true,
          dateReception: true, montantReclame: true, montantValide: true, montantPaye: true,
        },
      });
      if (!d) return resultatVide(T(`Facture ${numero}`));
      return resultatTableau(
        T(`Statut de la facture ${numero}`),
        [
          { key: 'champ', label: 'Information', type: 'texte' },
          { key: 'valeur', label: 'Valeur', type: 'texte' },
        ],
        [
          { champ: 'N° de dossier', valeur: d.numeroDossier },
          { champ: 'Patient', valeur: d.beneficiaire },
          { champ: 'Acte', valeur: d.typeDossier },
          { champ: 'Statut', valeur: statutLabel(d.statut) },
          { champ: 'Montant réclamé', valeur: round2(d.montantReclame) },
          { champ: 'Montant validé', valeur: d.montantValide !== null ? round2(d.montantValide) : '—' },
          { champ: 'Montant réglé', valeur: d.montantPaye !== null ? round2(d.montantPaye) : '—' },
        ],
        7,
        `Facture ${d.numeroDossier} : ${statutLabel(d.statut)}.`
      );
    },
  },
  {
    id: 'PRESTATAIRE_DATE_REGLEMENT',
    role: 'PRESTATAIRE',
    categorie: 'Mes factures',
    question: "Quand une facture a-t-elle été réglée ?",
    params: [{ key: 'DOSSIER', label: 'Numéro de dossier', required: true }],
    presentation: 'LISTE',
    async impl(ctx, params) {
      const numero = params.DOSSIER?.trim().toUpperCase();
      if (!numero) throw new AssistantError('Numéro de dossier requis.');
      const id = await dossierAutorise(numero, await wherePrestataire(ctx));
      if (!id) return resultatVide(T(`Règlement de la facture ${numero}`));
      const d = await db.dossier.findUnique({
        where: { id },
        select: { numeroDossier: true, datePaiement: true, referencePaiement: true, statut: true },
      });
      if (!d) return resultatVide(T(`Règlement de la facture ${numero}`));
      return resultatListe(
        T(`Règlement de la facture ${numero}`),
        [
          { key: 'champ', label: 'Information', type: 'texte' },
          { key: 'valeur', label: 'Valeur', type: 'texte' },
        ],
        [
          { champ: 'Date de règlement', valeur: d.datePaiement ? d.datePaiement.toISOString() : 'Non encore réglé' },
          { champ: 'Référence de paiement', valeur: d.referencePaiement ?? '—' },
          { champ: 'Statut', valeur: statutLabel(d.statut) },
        ],
        3,
        d.datePaiement
          ? `Facture réglée le ${d.datePaiement.toLocaleDateString('fr-FR')}.`
          : `Facture pas encore réglée (statut : ${statutLabel(d.statut)}).`
      );
    },
  },

  // ─── Mes actes ─────────────────────────────────────────────────────────────
  {
    id: 'PRESTATAIRE_ACTES_PERIODE',
    role: 'PRESTATAIRE',
    categorie: 'Mes actes',
    question: "Combien d'actes ai-je réalisés sur une période donnée ?",
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'NOMBRE',
    async impl(ctx, params) {
      const periode = P(params);
      const total = await db.dossier.count({
        where: await wherePrestataire(ctx, { dateSoins: { gte: periode.du, lte: periode.au } }),
      });
      return resultatNombre(T('Vos actes sur la période'), total,
        `${fmtNb(total)} acte(s) avec date de soins — ${periode.label}.`, periode);
    },
  },
  {
    id: 'PRESTATAIRE_ACTES_LISTE',
    role: 'PRESTATAIRE',
    categorie: 'Mes actes',
    question: 'Quels actes ai-je réalisés ?',
    params: [],
    presentation: 'LISTE',
    async impl(ctx) {
      const where = await wherePrestataire(ctx);
      const total = await db.dossier.count({ where });
      const dossiers = await db.dossier.findMany({
        where,
        orderBy: { dateSoins: 'desc' },
        take: LIMITE_LISTE,
        select: {
          numeroDossier: true, beneficiaire: true, typeDossier: true, statut: true,
          dateReception: true, montantReclame: true,
        },
      });
      if (total === 0) return resultatVide(T('Vos actes réalisés'));
      return resultatListe(T('Actes que vous avez réalisés'), COLONNES_DOSSIER,
        dossiers.map((d) => ({
          numero: d.numeroDossier,
          beneficiaire: d.beneficiaire,
          type: d.typeDossier,
          statut: statutLabel(d.statut),
          date: d.dateReception.toISOString(),
          montant: round2(d.montantReclame),
        })),
        total,
        `${fmtNb(total)} acte(s) au total (${dossiers.length} affiché(s)).`);
    },
  },
  {
    id: 'PRESTATAIRE_ACTES_TOP',
    role: 'PRESTATAIRE',
    categorie: 'Mes actes',
    question: 'Quels sont mes actes les plus fréquents ?',
    params: [],
    presentation: 'TABLEAU',
    async impl(ctx) {
      const rows = await db.dossier.groupBy({
        by: ['typeDossier'],
        where: await wherePrestataire(ctx),
        _count: { typeDossier: true },
        _sum: { montantReclame: true },
      });
      if (rows.length === 0) return resultatVide(T('Vos actes les plus fréquents'));
      const lignes = rows.sort((a, b) => b._count.typeDossier - a._count.typeDossier).slice(0, LIMITE_LISTE);
      return resultatTableau(
        T('Vos actes les plus fréquents'),
        [
          { key: 'acte', label: 'Acte', type: 'texte' },
          { key: 'nb', label: 'Nombre', type: 'nombre' },
          { key: 'montant', label: 'Montant réclamé', type: 'montant' },
        ],
        lignes.map((r) => ({ acte: r.typeDossier, nb: r._count.typeDossier, montant: round2(r._sum.montantReclame) })),
        lignes.length,
        `${lignes.length} type(s) d'acte(s) réalisé(s) dans votre établissement.`);
    },
  },
  {
    id: 'PRESTATAIRE_DOSSIERS_PERIODE',
    role: 'PRESTATAIRE',
    categorie: 'Mes actes',
    question: 'Combien de dossiers ai-je traités sur une période donnée ?',
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'NOMBRE',
    async impl(ctx, params) {
      const periode = P(params);
      const total = await db.dossier.count({
        where: await wherePrestataire(ctx, { dateReception: { gte: periode.du, lte: periode.au } }),
      });
      return resultatNombre(T('Vos dossiers sur la période'), total,
        `${fmtNb(total)} dossier(s) rattaché(s) à votre établissement — ${periode.label}.`, periode);
    },
  },
  {
    id: 'PRESTATAIRE_EVOLUTION_ACTIVITE',
    role: 'PRESTATAIRE',
    categorie: 'Mes actes',
    question: "Quelle est l'évolution de mon activité par mois ?",
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'GRAPHIQUE',
    async impl(ctx, params) {
      const periode = P(params);
      const prestataireId = scopePrestataire(ctx);
      const serie = await serieMensuelle({
        champDate: 'dateReception',
        periode,
        filtres: [Prisma.sql`AND "prestataireId" = ${prestataireId}`],
      });
      const total = serie.reduce((s, p) => s + p.valeur, 0);
      if (total === 0) return resultatVide(T('Évolution de votre activité'), periode);
      return resultatGraphique(T('Évolution de votre activité par mois'), serie, 'Dossiers',
        `${fmtNb(total)} dossier(s) enregistré(s) — ${periode.label}.`, periode);
    },
  },

  // ─── Mes prestations ───────────────────────────────────────────────────────
  {
    id: 'PRESTATAIRE_TOTAL_PRESTATIONS',
    role: 'PRESTATAIRE',
    categorie: 'Mes prestations',
    question: 'Quel est le montant total de mes prestations ?',
    params: [],
    presentation: 'MONTANT',
    async impl(ctx) {
      const res = await db.dossier.aggregate({
        where: await wherePrestataire(ctx),
        _sum: { montantValide: true, montantReclame: true },
      });
      const valide = round2(res._sum.montantValide);
      return resultatMontant(T('Montant total de vos prestations'), valide,
        `${fmtAr(valide)} de montants validés (sur ${fmtAr(round2(res._sum.montantReclame))} réclamés).`);
    },
  },
  {
    id: 'PRESTATAIRE_PRESTATIONS_PERIODE',
    role: 'PRESTATAIRE',
    categorie: 'Mes prestations',
    question: 'Quel est le montant total de mes prestations sur une période donnée ?',
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'MONTANT',
    async impl(ctx, params) {
      const periode = P(params);
      const res = await db.dossier.aggregate({
        where: await wherePrestataire(ctx, { dateSoins: { gte: periode.du, lte: periode.au } }),
        _sum: { montantReclame: true, montantValide: true },
        _count: true,
      });
      return resultatMontant(T('Vos prestations sur la période'), round2(res._sum.montantReclame),
        `${fmtAr(round2(res._sum.montantReclame))} réclamés sur ${fmtNb(res._count)} acte(s) (dont ${fmtAr(round2(res._sum.montantValide))} validés) — ${periode.label}.`, periode);
    },
  },

  // ─── Sociétés & barèmes ────────────────────────────────────────────────────
  {
    id: 'PRESTATAIRE_SOCIETES',
    role: 'PRESTATAIRE',
    categorie: 'Sociétés & barèmes',
    question: 'Quelles sociétés clientes sont rattachées à mon compte ?',
    params: [],
    presentation: 'LISTE',
    async impl(ctx) {
      const prestataireId = scopePrestataire(ctx);
      const liaisons = await db.prestataireSociete.findMany({
        where: { prestataireId },
        include: { societe: { select: { nom: true } } },
        orderBy: { createdAt: 'desc' },
      });
      if (liaisons.length === 0) return resultatVide(T('Vos sociétés clientes'));
      return resultatListe(
        T('Sociétés clientes rattachées à votre établissement'),
        [
          { key: 'nom', label: 'Société', type: 'texte' },
          { key: 'actif', label: 'Convention active', type: 'texte' },
        ],
        liaisons.map((l) => ({ nom: l.societe.nom, actif: l.actif ? 'Oui' : 'Non' })),
        liaisons.length,
        `${liaisons.length} société(s) cliente(s) rattachée(s).`
      );
    },
  },
  {
    id: 'PRESTATAIRE_BAREMES_APPLICABLES',
    role: 'PRESTATAIRE',
    categorie: 'Sociétés & barèmes',
    question: 'Quels barèmes sont applicables à mes prestations ?',
    params: [{ key: 'SOCIETE', label: 'Société (optionnel)' }],
    presentation: 'LISTE',
    async impl(ctx, params) {
      const prestataireId = scopePrestataire(ctx);
      const societeId = await societeAutoriseePrestataire(ctx, params);
      const societeIds = societeId ? [societeId] : await db.prestataireSociete.findMany({
        where: { prestataireId, actif: true },
        select: { societeId: true },
      }).then((rows) => rows.map((r) => r.societeId));
      if (societeIds.length === 0) return resultatVide(T('Barèmes applicables'));
      const baremes = await db.bareme.findMany({
        where: { societeId: { in: societeIds }, active: true },
        include: { societe: { select: { nom: true } } },
        orderBy: [{ societe: { nom: 'asc' } }, { prestation: 'asc' }],
        take: LIMITE_LISTE,
      });
      if (baremes.length === 0) return resultatVide(T('Barèmes applicables'));
      return resultatListe(
        T('Barèmes applicables à vos prestations'),
        [
          { key: 'societe', label: 'Société', type: 'texte' },
          { key: 'acte', label: 'Acte', type: 'texte' },
          { key: 'taux', label: 'Taux (%)', type: 'nombre' },
          { key: 'plafond', label: 'Plafond', type: 'montant' },
        ],
        baremes.map((b) => ({
          societe: b.societe.nom,
          acte: b.prestation,
          taux: Math.round(enNombre(b.tauxCouverture) * 100),
          plafond: round2(b.plafond),
        })),
        baremes.length,
        `${baremes.length} barème(s) actif(s) des sociétés conventionnées avec vous.`
      );
    },
  },
  {
    id: 'PRESTATAIRE_TARIF_ACTE',
    role: 'PRESTATAIRE',
    categorie: 'Sociétés & barèmes',
    question: 'Quel est le tarif d\u2019un acte donné ?',
    params: [
      { key: 'ACTE', label: 'Acte (prestation)', required: true },
      { key: 'SOCIETE', label: 'Société (optionnel)' },
    ],
    presentation: 'TABLEAU',
    note: 'Le tarif applicable = taux de couverture et plafond définis dans le barème de la société concernée.',
    async impl(ctx, params) {
      const acte = params.ACTE;
      if (!acte) throw new AssistantError('Acte requis.');
      const prestataireId = scopePrestataire(ctx);
      const societeId = await societeAutoriseePrestataire(ctx, params);
      const societeIds = societeId ? [societeId] : await db.prestataireSociete.findMany({
        where: { prestataireId, actif: true },
        select: { societeId: true },
      }).then((rows) => rows.map((r) => r.societeId));
      if (societeIds.length === 0) return resultatVide(T(`Tarif de l\u2019acte ${acte}`));
      const baremes = await db.bareme.findMany({
        where: { societeId: { in: societeIds }, prestation: acte, active: true },
        include: { societe: { select: { nom: true } } },
        orderBy: { societe: { nom: 'asc' } },
        take: LIMITE_LISTE,
      });
      if (baremes.length === 0) return resultatVide(T(`Tarif de l\u2019acte ${acte}`));
      return resultatTableau(
        T(`Tarif applicable pour l'acte « ${acte} »`),
        [
          { key: 'societe', label: 'Société', type: 'texte' },
          { key: 'taux', label: 'Taux de couverture (%)', type: 'nombre' },
          { key: 'plafond', label: 'Plafond', type: 'montant' },
        ],
        baremes.map((b) => ({
          societe: b.societe.nom,
          taux: Math.round(enNombre(b.tauxCouverture) * 100),
          plafond: round2(b.plafond),
        })),
        baremes.length,
        `${baremes.length} barème(s) actif(s) trouvé(s) pour cet acte.`
      );
    },
  },
  {
    id: 'PRESTATAIRE_ACTES_SOCIETE',
    role: 'PRESTATAIRE',
    categorie: 'Sociétés & barèmes',
    question: 'Quels actes puis-je réaliser pour une société donnée ?',
    params: [{ key: 'SOCIETE', label: 'Société', required: true }],
    presentation: 'LISTE',
    async impl(ctx, params) {
      const societeId = await societeAutoriseePrestataire(ctx, params);
      if (!societeId) throw new AssistantError('Société requise.');
      const baremes = await db.bareme.findMany({
        where: { societeId, active: true },
        select: { prestation: true, tauxCouverture: true, plafond: true },
        orderBy: { prestation: 'asc' },
      });
      if (baremes.length === 0) return resultatVide(T('Actes disponibles pour cette société'));
      return resultatListe(
        T('Actes que vous pouvez réaliser pour cette société (barème actif)'),
        [
          { key: 'acte', label: 'Acte', type: 'texte' },
          { key: 'taux', label: 'Taux (%)', type: 'nombre' },
          { key: 'plafond', label: 'Plafond', type: 'montant' },
        ],
        baremes.map((b) => ({
          acte: b.prestation,
          taux: Math.round(enNombre(b.tauxCouverture) * 100),
          plafond: round2(b.plafond),
        })),
        baremes.length,
        `${baremes.length} acte(s) couvert(s) par le barème actif de cette société.`
      );
    },
  },

  // ─── Ma situation ──────────────────────────────────────────────────────────
  {
    id: 'PRESTATAIRE_MONTANT_RESTANT',
    role: 'PRESTATAIRE',
    categorie: 'Ma situation',
    question: 'Quel est le montant restant à me payer ?',
    params: [],
    presentation: 'MONTANT',
    async impl(ctx) {
      const res = await db.dossier.aggregate({
        where: await wherePrestataire(ctx, { statut: { in: STATUTS_EN_COURS } }),
        _sum: { montantReclame: true, montantValide: true, montantPaye: true },
        _count: true,
      });
      const restant = round2(enNombre(res._sum.montantReclame) - enNombre(res._sum.montantPaye));
      const valide = round2(res._sum.montantValide);
      return resultatMontant(T('Montant restant à percevoir'), restant,
        `${fmtAr(restant)} restant à percevoir sur ${fmtNb(res._count)} dossier(s) en cours (montants validés : ${fmtAr(valide)}).`);
    },
  },
  {
    id: 'PRESTATAIRE_SITUATION_PAIEMENT',
    role: 'PRESTATAIRE',
    categorie: 'Ma situation',
    question: 'Quelle est ma situation de paiement actuelle ?',
    params: [],
    presentation: 'KPI',
    async impl(ctx) {
      const prestataireId = scopePrestataire(ctx);
      const rows = await db.dossier.groupBy({
        by: ['statut'],
        where: { prestataireId },
        _count: { statut: true },
        _sum: { montantReclame: true, montantPaye: true },
      });
      if (rows.length === 0) return resultatVide(T('Votre situation de paiement'));
      const nb = (s: string) => rows.find((r) => r.statut === s)?._count.statut ?? 0;
      const somme = (s: string[], champ: 'montantReclame' | 'montantPaye') =>
        round2(enNombre(rows.filter((r) => s.includes(r.statut)).reduce((acc, r) => acc + enNombre(r._sum[champ]), 0)));
      const totalFactures = rows.reduce((s, r) => s + r._count.statut, 0);
      const regle = somme(['PAYE'], 'montantPaye');
      const enCours = somme(STATUTS_EN_COURS, 'montantReclame');
      return resultatKpi(
        T('Votre situation de paiement actuelle'),
        [
          { label: 'Dossiers au total', valeur: totalFactures, type: 'nombre' },
          { label: 'Montants réglés', valeur: regle, type: 'montant' },
          { label: 'Montants en cours (réclamés)', valeur: enCours, type: 'montant' },
          { label: 'Dossiers en attente de paiement', valeur: nb('EN_PAIEMENT') + nb('EN_COMPTABILITE') + nb('VALIDE'), type: 'nombre' },
        ],
        `Situation : ${fmtNb(totalFactures)} facture(s) au total, ${fmtAr(regle)} réglé(s), ${fmtAr(enCours)} en cours de traitement.`
      );
    },
  },
];
